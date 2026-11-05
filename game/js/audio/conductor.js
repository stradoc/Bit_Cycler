import { cueOn } from './cues.js';
import { beatAtTime, timeOfBeat } from './timing.js';
// How far ahead (seconds) beats are scheduled, and how often (ms) we top up.
// setInterval only wakes the scheduler; the beat times themselves come from
// the audio clock, so a late timer never makes a beat late.
const LOOKAHEAD = 0.1;
const SCHEDULE_INTERVAL_MS = 25;
/** Keeps the beat. Every timing decision in the game reads this clock. */
export class Conductor {
    ctx;
    /** Current tempo; setTempo() changes it from the next beat on. */
    bpm;
    /** Player calibration (seconds). Positive = the player hears audio later than reported. */
    offset = 0;
    /** The metronome's loudness: 1 as designed (alone, for calibration), lower under music, 0 silent. */
    clickLevel = 1;
    /** Called as each beat is scheduled, with its exact audio time (for music). */
    onBeat;
    /** Beat times follow the current tempo from this anchor (the beat and audio time of the last tempo change). */
    anchor = { beat: 0, time: 0 };
    /** The tempo in force before the last change, for presses just before it. */
    previous;
    nextBeat = 0;
    timer;
    /** While paused (the pause menu): the beat it stopped on. */
    pausedBeat;
    constructor(ctx, bpm) {
        this.ctx = ctx;
        this.bpm = bpm;
    }
    start() {
        this.stop();
        this.anchor = { beat: 0, time: this.ctx.currentTime + LOOKAHEAD };
        this.previous = undefined;
        this.nextBeat = 0;
        this.schedule();
        this.timer = setInterval(() => this.schedule(), SCHEDULE_INTERVAL_MS);
    }
    stop() {
        if (this.timer !== undefined)
            clearInterval(this.timer);
        this.timer = undefined;
    }
    /**
     * Stops the beat where it is (the pause menu): nothing more is scheduled,
     * and every reading gives the beat it stopped on until resume(). The audio
     * keeps running; only the beat waits.
     */
    pause() {
        if (this.pausedBeat !== undefined)
            return;
        this.pausedBeat = this.currentBeat();
        this.stop();
    }
    /** Carries on from the beat it stopped on, as of now: no beat is skipped or played twice. */
    resume() {
        const beat = this.pausedBeat;
        if (beat === undefined)
            return;
        this.pausedBeat = undefined;
        this.anchor = { beat, time: this.heardTime() - this.offset };
        this.previous = undefined;
        this.schedule();
        this.timer = setInterval(() => this.schedule(), SCHEDULE_INTERVAL_MS);
    }
    /**
     * Changes the tempo from the next unscheduled beat on, so every beat stays
     * evenly placed (a CPU's clock changing speed, e.g. thermal throttling).
     */
    setTempo(bpm) {
        if (bpm === this.bpm)
            return;
        const time = this.timeOf(this.nextBeat);
        this.previous = { bpm: this.bpm, anchor: this.anchor };
        this.anchor = { beat: this.nextBeat, time };
        this.bpm = bpm;
    }
    /** Fractional beat the player is hearing right now. */
    currentBeat() {
        return this.beatAt(performance.now());
    }
    /**
     * Fractional beat the player was hearing at `performanceMs` (a performance.now()
     * timestamp). Pass a KeyboardEvent's timeStamp to judge a press at the exact
     * moment it happened, independent of frame rate.
     */
    beatAt(performanceMs) {
        if (this.pausedBeat !== undefined)
            return this.pausedBeat;
        const time = this.heardTime(performanceMs) - this.offset;
        const { bpm, anchor } = this.previous && time < this.anchor.time ? this.previous : { bpm: this.bpm, anchor: this.anchor };
        return anchor.beat + beatAtTime(time, anchor.time, bpm);
    }
    /** Audio-clock time of the sound leaving the speakers at `performanceMs` (default: now). */
    heardTime(performanceMs = performance.now()) {
        // getOutputTimestamp() maps the sample currently at the output device to
        // performance.now(); extrapolate from it to the requested moment.
        const ts = this.ctx.getOutputTimestamp?.();
        if (ts?.contextTime && ts.performanceTime) {
            return ts.contextTime + (performanceMs - ts.performanceTime) / 1000;
        }
        const latency = this.ctx.outputLatency || 0;
        return this.ctx.currentTime - latency - (performance.now() - performanceMs) / 1000;
    }
    schedule() {
        while (this.timeOf(this.nextBeat) < this.ctx.currentTime + LOOKAHEAD) {
            const time = this.timeOf(this.nextBeat);
            this.click(this.nextBeat, time);
            this.onBeat?.(this.nextBeat, time);
            this.nextBeat++;
        }
    }
    /** Audio time of `beat` (at or after the last tempo change). */
    timeOf(beat) {
        return timeOfBeat(beat - this.anchor.beat, this.anchor.time, this.bpm);
    }
    click(beat, time) {
        cueOn(this.ctx, beat % 4 === 0 ? 'downbeat' : 'beat', { at: time, volume: this.clickLevel });
    }
}
//# sourceMappingURL=conductor.js.map