import type { Cpu } from '../sim/cpu.ts';
import { unitOf, type Unit } from '../sim/isa.ts';
import { freezeBeats } from '../sim/memory.ts';
import { Pipeline, type CycleResult, type Hazard, type PairBlock, type PipelineOptions, type Slot } from '../sim/pipeline.ts';
import { Chip } from '../sim/thermal.ts';
import { judge, type Judgment, type Windows } from './judge.ts';

/** One lane pressed: the unit, and for a branch, a guess (taken or not). */
export type Route = { readonly unit: Unit; readonly guessTaken?: boolean };

/**
 * What the player can do with the instruction in ID: route it to a unit, or
 * stall. Superscalar: a chord routes it and the one behind it together
 * (`also`, a second lane), in either order of keys.
 */
export type Action =
  | { readonly kind: 'route'; readonly unit: Unit; readonly guessTaken?: boolean; readonly also?: Route }
  | { readonly kind: 'stall' };

/** How a choice turned out. Only `issued`, `paired` and `stalled` are correct. */
export type Outcome =
  | 'issued' // routed to the right unit with no hazard
  | 'paired' // superscalar: a chord, on two that could start together
  | 'wrong-pair' // a chord on two that couldn't: both thrown away and fetched again
  | 'stalled' // stalled for a real hazard
  | 'wasted-stall' // stalled with no hazard: a lost cycle
  | 'violation' // issued while a value was still being computed: flushed
  | 'wrong-unit' // routed to the wrong unit: treated as a stall
  | 'off-beat' // right idea, outside the timing window: treated as a stall
  | 'missed'; // no input at all: treated as a stall

export type Decision = {
  readonly slot: Slot;
  readonly action: Action | null;
  readonly outcome: Outcome;
  readonly judgment: Judgment;
  /** The hazard blocking the instruction when the choice was made, if any. */
  readonly hazard: Hazard | null;
  /** The instruction had already been waiting on the line (stalled), so timing didn't count. */
  readonly waited: boolean;
  /** Superscalar: whether it and the one behind it could start together, and if not, why. */
  readonly pairable: boolean;
  readonly pairBlock?: PairBlock;
};

export type CycleReport = CycleResult & {
  readonly decision: Decision | null;
  /** The clock dial during this cycle (replays set it back to this). */
  readonly dial: number;
};

const CORRECT: readonly Outcome[] = ['issued', 'paired', 'stalled'];
const THROUGHPUT_WINDOW = 8;

/**
 * The outcome of `action` for the instruction currently in ID (null if ID is
 * empty). A chord must name ID's unit and the unit of the one behind it.
 */
export function evaluate(pipeline: Pipeline, action: Action): Outcome | null {
  const slot = pipeline.stages.ID;
  if (!slot) return null;
  const hazard = pipeline.hazard();
  if (action.kind === 'stall') return hazard ? 'stalled' : 'wasted-stall';
  if (!action.also) return action.unit !== unitOf(slot.instr) ? 'wrong-unit' : hazard ? 'violation' : 'issued';
  const [first, second] = chordParts(pipeline, action);
  if (!first) return 'wrong-unit';
  if (hazard) return 'violation';
  // The chord's other lane must be the second instruction's unit, and the two must be able to start together.
  return second && pipeline.pairCheck().ok ? 'paired' : 'wrong-pair';
}

/**
 * A chord's two lanes matched to the instructions: which lane is ID's, and
 * which is the one behind it (in IF); undefined where a lane doesn't fit.
 */
function chordParts(pipeline: Pipeline, action: Action & { kind: 'route' }): [Route | undefined, Route | undefined] {
  const lanes: Route[] = [action, ...(action.also ? [action.also] : [])];
  const id = pipeline.stages.ID;
  const behind = pipeline.stages.IF;
  const first = id ? lanes.find((lane) => lane.unit === unitOf(id.instr)) : undefined;
  const rest = lanes.find((lane) => lane !== first);
  const second = behind && rest && rest.unit === unitOf(behind.instr) ? rest : undefined;
  return [first, second];
}

/**
 * A program played on the 5-stage pipeline. Each beat is one clock cycle: the
 * player decides for the instruction in ID around the beat, and the pipeline
 * advances once that beat's timing window has closed.
 */
export class PipelineRun {
  readonly pipeline: Pipeline;
  /** Beat on which cycle 1 happens. */
  readonly firstBeat: number;
  /** Seconds per beat at the chip's rated clock. */
  readonly ratedSecondsPerBeat: number;
  readonly windows: Windows;
  /** Clock and temperature: each cycle heats it, the dial changes the tempo, and overheating stops the clock. */
  readonly chip: Chip;
  readonly counts: Record<Outcome, number> = {
    issued: 0, paired: 0, 'wrong-pair': 0, stalled: 0, 'wasted-stall': 0, violation: 0, 'wrong-unit': 0, 'off-beat': 0, missed: 0,
  };
  streak = 0;
  bestStreak = 0;
  /** Cycles played so far (decisions closed), not counting memory waits: indexes a recorded run. */
  steps = 0;
  /** Beats drawn frozen while waiting (for memory, or a deep pipeline refilling): each stands for one or more cycles. */
  waitBeats = 0;
  /** The wait in progress: all its cycles, the beats it's drawn over, and how many of those have passed. */
  private freeze: { total: number; beats: number; passed: number } | null = null;
  private pending: Decision | null = null;
  /** Seq of the instruction that stalled last cycle and is still waiting in ID. */
  private waitingSeq: number | null = null;
  /** Recent cycles: 1 if an instruction completed (reached WB), else 0. */
  private completions: number[] = [];

  constructor(cpu: Cpu, options: PipelineOptions, firstBeat: number, secondsPerBeat: number, windows: Windows, chip = new Chip(1)) {
    this.pipeline = new Pipeline(cpu, options);
    this.firstBeat = firstBeat;
    this.ratedSecondsPerBeat = secondsPerBeat;
    this.windows = windows;
    this.chip = chip;
  }

  /** Seconds per beat right now: one beat is one cycle, so a faster clock means a faster beat. */
  get secondsPerBeat(): number {
    return this.ratedSecondsPerBeat / this.chip.clockRatio;
  }

  get done(): boolean {
    return this.pipeline.done;
  }

  /**
   * Beat on which the current cycle's decision is due: later by each beat the
   * clock was stopped, and a wait's cycles take only its few frozen beats.
   */
  get dueBeat(): number {
    const { pipeline } = this;
    return this.firstBeat + pipeline.cycle - pipeline.memoryCycles - pipeline.refillCycles + this.waitBeats + this.chip.haltedBeats;
  }

  /** Waiting for memory, or a deep pipeline refilling after a wrong guess: nothing moves and presses are ignored. */
  get frozen(): boolean {
    return this.pipeline.waitLeft > 0;
  }

  /** A deep pipeline refilling after a wrong guess (not waiting for memory). */
  get refilling(): boolean {
    return this.pipeline.refillWait > 0 && this.pipeline.memoryWait === 0;
  }

  /** The wait in progress: its cycles, how many are left, and its frozen beats left. */
  get waiting(): { total: number; left: number; beatsLeft: number } | null {
    if (!this.frozen) return null;
    const total = this.freeze?.total ?? this.pipeline.waitLeft;
    const beats = this.freeze?.beats ?? freezeBeats(total);
    return { total, left: this.pipeline.waitLeft, beatsLeft: beats - (this.freeze?.passed ?? 0) };
  }

  /** The choice already made this cycle, if any. */
  get decided(): Decision | null {
    return this.pending;
  }

  /** Instructions completed per cycle over the last few cycles (0-1, up to 2 superscalar): how full the pipeline is running. */
  get throughput(): number {
    if (this.completions.length === 0) return 0;
    return this.completions.reduce((a, b) => a + b, 0) / THROUGHPUT_WINDOW;
  }

  /**
   * The player acts at fractional `beat`. Returns the decision, or null when
   * there is nothing to decide, it's already decided, or it's too early to count.
   */
  press(action: Action, beat: number): Decision | null {
    const slot = this.pipeline.stages.ID;
    // With the clock stopped, or everything waiting for memory, there's nothing to decide: presses are ignored.
    if (!slot || this.pending || this.done || this.chip.halted || this.frozen) return null;
    // A note already waiting on the line isn't moving, so there's no beat to hit:
    // any press during its cycle counts. Timing only matters when a note first arrives.
    const waited = this.waitingSeq === slot.seq;
    let judgment: Judgment = 'PERFECT';
    if (!waited) {
      const offset = (beat - this.dueBeat) * this.secondsPerBeat;
      if (offset < -this.windows.early) return null;
      judgment = judge(offset, this.windows);
    }
    const outcome = judgment === 'MISS' ? 'off-beat' : (evaluate(this.pipeline, action) ?? 'missed');
    this.pending = this.decide(slot, action, outcome, judgment, waited);
    return this.pending;
  }

  /**
   * Superscalar: a second lane pressed in the same cycle turns the decision
   * into a chord (either order of keys), judged again as a whole, if it's in
   * time. Returns the new decision, or null if it doesn't count.
   */
  chord(route: Route, beat: number): Decision | null {
    const decided = this.pending;
    if (!this.pipeline.options.superscalar || decided?.action?.kind !== 'route' || decided.action.also || decided.action.unit === route.unit) return null;
    const judgment = decided.waited ? 'PERFECT' : judge((beat - this.dueBeat) * this.secondsPerBeat, this.windows);
    if (judgment === 'MISS') return null;
    const action: Action = { ...decided.action, also: route };
    const worse = judgment === 'GOOD' || decided.judgment === 'GOOD' ? 'GOOD' : 'PERFECT';
    this.pending = this.decide(decided.slot, action, decided.judgment === 'MISS' ? 'off-beat' : (evaluate(this.pipeline, action) ?? 'missed'), worse, decided.waited);
    return this.pending;
  }

  /** A decision for the instruction in ID, with whatever a branch's guess starts fetching. */
  private decide(slot: Slot, action: Action | null, outcome: Outcome, judgment: Judgment, waited: boolean): Decision {
    const check = this.pipeline.pairCheck();
    const decision: Decision = {
      slot, action, outcome, judgment, hazard: this.pipeline.hazard(), waited, pairable: check.ok, pairBlock: check.ok ? undefined : check.reason,
    };
    this.applyGuess(action, outcome);
    return decision;
  }

  /** A branch routed with a guess fetches down the guessed path right away: the one in ID, or a chord's second. */
  private applyGuess(action: Action | null, outcome: Outcome): void {
    if (action?.kind !== 'route') return;
    if (!action.also) {
      if (action.guessTaken !== undefined && (outcome === 'issued' || outcome === 'violation')) this.pipeline.predict(action.guessTaken);
      return;
    }
    const [first, second] = chordParts(this.pipeline, action);
    if (first?.guessTaken !== undefined && outcome === 'violation') this.pipeline.predict(first.guessTaken);
    if (second?.guessTaken !== undefined && outcome === 'paired') this.pipeline.predictPartner(second.guessTaken);
  }

  /** Sets this cycle's decision directly (replaying a recorded run). */
  force(action: Action | null, outcome: Outcome, judgment: Judgment): Decision | null {
    const slot = this.pipeline.stages.ID;
    if (!slot || this.done || this.chip.halted || this.frozen) return null;
    this.pending = this.decide(slot, action, outcome, judgment, this.waitingSeq === slot.seq);
    return this.pending;
  }

  /**
   * Call every frame: advances the pipeline for each cycle whose window has
   * closed. A beat with the clock stopped (overheated) just cools the chip; a
   * beat waiting for memory spends its share of the wait's cycles.
   */
  update(beat: number): CycleReport[] {
    const reports: CycleReport[] = [];
    while (!this.done && (beat - this.dueBeat) * this.secondsPerBeat > this.windows.good) {
      if (this.chip.halted) this.chip.coolBeat();
      else if (this.frozen) this.waitBeat();
      else reports.push(this.advance());
    }
    return reports;
  }

  /** One frozen beat: an even share of the wait's cycles pass, all of them by its last beat. */
  private waitBeat(): void {
    const { pipeline } = this;
    this.freeze ??= { total: pipeline.waitLeft, beats: freezeBeats(pipeline.waitLeft), passed: 0 };
    const freeze = this.freeze;
    freeze.passed++;
    const spentBefore = freeze.total - pipeline.waitLeft;
    const share = freeze.passed >= freeze.beats ? pipeline.waitLeft : Math.round((freeze.total * freeze.passed) / freeze.beats) - spentBefore;
    const cycles = pipeline.wait(share);
    this.chip.waitBeat(cycles);
    this.waitBeats++;
    if (this.frozen) return;
    this.freeze = null;
    // The note on the line sat through the wait: like a stalled note, it isn't arriving on a beat, so any press counts.
    this.waitingSeq = pipeline.stages.ID?.seq ?? null;
  }

  private advance(): CycleReport {
    const slot = this.pipeline.stages.ID;
    let decision = this.pending;
    if (slot && !decision) {
      const check = this.pipeline.pairCheck();
      decision = {
        slot, action: null, outcome: 'missed', judgment: 'MISS', hazard: this.pipeline.hazard(), waited: this.waitingSeq === slot.seq,
        pairable: check.ok, pairBlock: check.ok ? undefined : check.reason,
      };
    }
    this.pending = null;

    if (decision) {
      this.counts[decision.outcome]++;
      if (CORRECT.includes(decision.outcome)) {
        this.streak++;
        this.bestStreak = Math.max(this.bestStreak, this.streak);
      } else {
        this.streak = 0;
      }
    }

    // Only a correct route, a chord or a violation actually issues; every other outcome is a stall. A chord starts a pair (or fails as one).
    const outcome = decision?.outcome;
    const chorded = decision?.action?.kind === 'route' && decision.action.also !== undefined;
    const issues = outcome === 'issued' || outcome === 'violation' || outcome === 'paired' || outcome === 'wrong-pair';
    // A trip to RAM takes a fixed time, so its cycles depend on the clock right now.
    this.pipeline.clockMhz = this.chip.mhz;
    this.steps++;
    const result = this.pipeline.step(!issues ? 'stall' : chorded ? 'pair' : 'issue');
    const { dial } = this.chip;
    this.chip.cycle(issues);
    const id = this.pipeline.stages.ID;
    this.waitingSeq = slot && id?.seq === slot.seq ? id.seq : null;
    this.completions.push((result.committed ? 1 : 0) + (result.committedPartner ? 1 : 0));
    if (this.completions.length > THROUGHPUT_WINDOW) this.completions.shift();
    return { ...result, decision, dial };
  }
}
