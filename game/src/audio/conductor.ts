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

  /** Fractional beat the player is hearing right now (corrected for output latency). */
  currentBeat(): number {
    const heardTime = this.ctx.currentTime - (this.ctx.outputLatency || 0);
    return beatAtTime(heardTime, this.startTime, this.bpm);
  }

  private schedule(): void {
    while (timeOfBeat(this.nextBeat, this.startTime, this.bpm) < this.ctx.currentTime + LOOKAHEAD) {
      this.click(this.nextBeat, timeOfBeat(this.nextBeat, this.startTime, this.bpm));
      this.nextBeat++;
    }
  }

  private click(beat: number, time: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = beat % 4 === 0 ? 1760 : 880;
    gain.gain.setValueAtTime(0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }
}
