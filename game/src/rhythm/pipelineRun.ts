import type { Cpu } from '../sim/cpu.ts';
import { unitOf, type Unit } from '../sim/isa.ts';
import { Pipeline, type CycleResult, type Hazard, type PipelineOptions, type Slot } from '../sim/pipeline.ts';
import { Chip } from '../sim/thermal.ts';
import { judge, type Judgment, type Windows } from './judge.ts';

/** What the player can do with the instruction in ID. Routing a branch can carry a guess: taken or not. */
export type Action =
  | { readonly kind: 'route'; readonly unit: Unit; readonly guessTaken?: boolean }
  | { readonly kind: 'stall' };

/** How a choice turned out. Only `issued` and `stalled` are correct. */
export type Outcome =
  | 'issued' // routed to the right unit with no hazard
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
};

export type CycleReport = CycleResult & {
  readonly decision: Decision | null;
  /** The clock dial during this cycle (replays set it back to this). */
  readonly dial: number;
};

const CORRECT: readonly Outcome[] = ['issued', 'stalled'];
const THROUGHPUT_WINDOW = 8;

/** The outcome of `action` for the instruction currently in ID (null if ID is empty). */
export function evaluate(pipeline: Pipeline, action: Action): Outcome | null {
  const slot = pipeline.stages.ID;
  if (!slot) return null;
  const hazard = pipeline.hazard();
  if (action.kind === 'stall') return hazard ? 'stalled' : 'wasted-stall';
  if (action.unit !== unitOf(slot.instr)) return 'wrong-unit';
  return hazard ? 'violation' : 'issued';
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
    issued: 0, stalled: 0, 'wasted-stall': 0, violation: 0, 'wrong-unit': 0, 'off-beat': 0, missed: 0,
  };
  streak = 0;
  bestStreak = 0;
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

  /** Beat on which the current cycle's decision is due (later by each beat the clock was stopped). */
  get dueBeat(): number {
    return this.firstBeat + this.pipeline.cycle + this.chip.haltedBeats;
  }

  /** The choice already made this cycle, if any. */
  get decided(): Decision | null {
    return this.pending;
  }

  /** Instructions completed per cycle over the last few cycles (0-1): how full the pipeline is running. */
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
    // With the clock stopped there's nothing to decide: presses are ignored.
    if (!slot || this.pending || this.done || this.chip.halted) return null;
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
    this.pending = { slot, action, outcome, judgment, hazard: this.pipeline.hazard(), waited };
    this.applyGuess(action, outcome);
    return this.pending;
  }

  /** A branch routed with a guess fetches down the guessed path right away. */
  private applyGuess(action: Action | null, outcome: Outcome): void {
    if (action?.kind !== 'route' || action.guessTaken === undefined) return;
    if (outcome === 'issued' || outcome === 'violation') this.pipeline.predict(action.guessTaken);
  }

  /** Sets this cycle's decision directly (replaying a recorded run). */
  force(action: Action | null, outcome: Outcome, judgment: Judgment): Decision | null {
    const slot = this.pipeline.stages.ID;
    if (!slot || this.done) return null;
    this.pending = { slot, action, outcome, judgment, hazard: this.pipeline.hazard(), waited: this.waitingSeq === slot.seq };
    this.applyGuess(action, outcome);
    return this.pending;
  }

  /**
   * Call every frame: advances the pipeline for each cycle whose window has
   * closed. A beat with the clock stopped (overheated) just cools the chip.
   */
  update(beat: number): CycleReport[] {
    const reports: CycleReport[] = [];
    while (!this.done && (beat - this.dueBeat) * this.secondsPerBeat > this.windows.good) {
      if (this.chip.halted) this.chip.coolBeat();
      else reports.push(this.advance());
    }
    return reports;
  }

  private advance(): CycleReport {
    const slot = this.pipeline.stages.ID;
    let decision = this.pending;
    if (slot && !decision) {
      const waited = this.waitingSeq === slot.seq;
      decision = { slot, action: null, outcome: 'missed', judgment: 'MISS', hazard: this.pipeline.hazard(), waited };
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

    // Only a correct route or a violation actually issues; every other outcome is a stall.
    const issues = decision?.outcome === 'issued' || decision?.outcome === 'violation';
    const result = this.pipeline.step(issues ? 'issue' : 'stall');
    const { dial } = this.chip;
    this.chip.cycle(issues);
    const id = this.pipeline.stages.ID;
    this.waitingSeq = slot && id?.seq === slot.seq ? id.seq : null;
    this.completions.push(result.committed ? 1 : 0);
    if (this.completions.length > THROUGHPUT_WINDOW) this.completions.shift();
    return { ...result, decision, dial };
  }
}
