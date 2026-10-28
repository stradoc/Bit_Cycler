import { beatAtTime, timeOfBeat } from './timing.js';
// How far ahead (seconds) beats are scheduled, and how often (ms) we top up.
// setInterval only wakes the scheduler; the beat times themselves come from
// the audio clock, so a late timer never makes a beat late.
const LOOKAHEAD = 0.1;
const SCHEDULE_INTERVAL_MS = 25;
/** Keeps the beat. Every timing decision in the game reads this clock. */
export class Conductor {
    ctx;
    bpm;
    startTime = 0;
    nextBeat = 0;
    timer;
    constructor(ctx, bpm) {
        this.ctx = ctx;
        this.bpm = bpm;
    }
    start() {
        this.stop();
        this.startTime = this.ctx.currentTime + LOOKAHEAD;
        this.nextBeat = 0;
        this.schedule();
        this.timer = setInterval(() => this.schedule(), SCHEDULE_INTERVAL_MS);
    }
    stop() {
        if (this.timer !== undefined)
            clearInterval(this.timer);
        this.timer = undefined;
    }
    /** Fractional beat the player is hearing right now (corrected for output latency). */
    currentBeat() {
        const heardTime = this.ctx.currentTime - (this.ctx.outputLatency || 0);
        return beatAtTime(heardTime, this.startTime, this.bpm);
    }
    schedule() {
        while (timeOfBeat(this.nextBeat, this.startTime, this.bpm) < this.ctx.currentTime + LOOKAHEAD) {
            this.click(this.nextBeat, timeOfBeat(this.nextBeat, this.startTime, this.bpm));
            this.nextBeat++;
        }
    }
    click(beat, time) {
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
//# sourceMappingURL=conductor.js.map