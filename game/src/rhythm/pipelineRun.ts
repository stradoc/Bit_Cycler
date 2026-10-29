import type { Cpu } from '../sim/cpu.ts';
import { unitOf, type Unit } from '../sim/isa.ts';
import { Pipeline, type CycleResult, type Hazard, type PipelineOptions, type Slot } from '../sim/pipeline.ts';
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

export type CycleReport = CycleResult & { readonly decision: Decision | null };

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
  readonly secondsPerBeat: number;
  readonly windows: Windows;
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

  constructor(cpu: Cpu, options: PipelineOptions, firstBeat: number, secondsPerBeat: number, windows: Windows) {
    this.pipeline = new Pipeline(cpu, options);
    this.firstBeat = firstBeat;
    this.secondsPerBeat = secondsPerBeat;
    this.windows = windows;
  }

  get done(): boolean {
    return this.pipeline.done;
  }

  /** Beat on which the current cycle's decision is due. */
  get dueBeat(): number {
    return this.firstBeat + this.pipeline.cycle;
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
    if (!slot || this.pending || this.done) return null;
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

  /** Call every frame: advances the pipeline for each cycle whose window has closed. */
  update(beat: number): CycleReport[] {
    const reports: CycleReport[] = [];
    while (!this.done && (beat - this.dueBeat) * this.secondsPerBeat > this.windows.good) {
      reports.push(this.advance());
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
    const id = this.pipeline.stages.ID;
    this.waitingSeq = slot && id?.seq === slot.seq ? id.seq : null;
    this.completions.push(result.committed ? 1 : 0);
    if (this.completions.length > THROUGHPUT_WINDOW) this.completions.shift();
    return { ...result, decision };
  }
}
