import { blip } from './sfx.ts';
import { beatAtTime, timeOfBeat } from './timing.ts';

// How far ahead (seconds) beats are scheduled, and how often (ms) we top up.
// setInterval only wakes the scheduler; the beat times themselves come from
// the audio clock, so a late timer never makes a beat late.
const LOOKAHEAD = 0.1;
const SCHEDULE_INTERVAL_MS = 25;

/** Keeps the beat. Every timing decision in the game reads this clock. */
export class Conductor {
  readonly ctx: AudioContext;
  readonly bpm: number;
  /** Player calibration (seconds). Positive = the player hears audio later than reported. */
  offset = 0;
  clickVolume = 0.15;
  /** Called as each beat is scheduled, with its exact audio time (for music). */
  onBeat: ((beat: number, time: number) => void) | undefined;
  private startTime = 0;
  private nextBeat = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(ctx: AudioContext, bpm: number) {
    this.ctx = ctx;
    this.bpm = bpm;
  }

  start(): void {
    this.stop();
    this.startTime = this.ctx.currentTime + LOOKAHEAD;
    this.nextBeat = 0;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), SCHEDULE_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Fractional beat the player is hearing right now. */
  currentBeat(): number {
    return this.beatAt(performance.now());
  }

  /**
   * Fractional beat the player was hearing at `performanceMs` (a performance.now()
   * timestamp). Pass a KeyboardEvent's timeStamp to judge a press at the exact
   * moment it happened, independent of frame rate.
   */
  beatAt(performanceMs: number): number {
    return beatAtTime(this.heardTime(performanceMs) - this.offset, this.startTime, this.bpm);
  }

  /** Audio-clock time of the sound leaving the speakers at `performanceMs` (default: now). */
  heardTime(performanceMs = performance.now()): number {
    // getOutputTimestamp() maps the sample currently at the output device to
    // performance.now(); extrapolate from it to the requested moment.
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts?.contextTime && ts.performanceTime) {
      return ts.contextTime + (performanceMs - ts.performanceTime) / 1000;
    }
    const latency = this.ctx.outputLatency || 0;
    return this.ctx.currentTime - latency - (performance.now() - performanceMs) / 1000;
  }

  private schedule(): void {
    while (timeOfBeat(this.nextBeat, this.startTime, this.bpm) < this.ctx.currentTime + LOOKAHEAD) {
      const time = timeOfBeat(this.nextBeat, this.startTime, this.bpm);
      this.click(this.nextBeat, time);
      this.onBeat?.(this.nextBeat, time);
      this.nextBeat++;
    }
  }

  private click(beat: number, time: number): void {
    blip(this.ctx, beat % 4 === 0 ? 1760 : 880, time, 0.05, 'square', this.clickVolume);
  }
}
