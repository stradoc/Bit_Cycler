import { unitOf } from '../sim/isa.js';
import { freezeBeats } from '../sim/memory.js';
import { Pipeline } from '../sim/pipeline.js';
import { Chip } from '../sim/thermal.js';
import { judge } from './judge.js';
const CORRECT = ['issued', 'stalled'];
const THROUGHPUT_WINDOW = 8;
/** The outcome of `action` for the instruction currently in ID (null if ID is empty). */
export function evaluate(pipeline, action) {
    const slot = pipeline.stages.ID;
    if (!slot)
        return null;
    const hazard = pipeline.hazard();
    if (action.kind === 'stall')
        return hazard ? 'stalled' : 'wasted-stall';
    if (action.unit !== unitOf(slot.instr))
        return 'wrong-unit';
    return hazard ? 'violation' : 'issued';
}
/**
 * A program played on the 5-stage pipeline. Each beat is one clock cycle: the
 * player decides for the instruction in ID around the beat, and the pipeline
 * advances once that beat's timing window has closed.
 */
export class PipelineRun {
    pipeline;
    /** Beat on which cycle 1 happens. */
    firstBeat;
    /** Seconds per beat at the chip's rated clock. */
    ratedSecondsPerBeat;
    windows;
    /** Clock and temperature: each cycle heats it, the dial changes the tempo, and overheating stops the clock. */
    chip;
    counts = {
        issued: 0, stalled: 0, 'wasted-stall': 0, violation: 0, 'wrong-unit': 0, 'off-beat': 0, missed: 0,
    };
    streak = 0;
    bestStreak = 0;
    /** Cycles played so far (decisions closed), not counting memory waits: indexes a recorded run. */
    steps = 0;
    /** Beats drawn frozen while waiting for memory (each stands for many cycles). */
    memoryBeats = 0;
    /** The memory wait in progress: all its cycles, the beats it's drawn over, and how many of those have passed. */
    freeze = null;
    pending = null;
    /** Seq of the instruction that stalled last cycle and is still waiting in ID. */
    waitingSeq = null;
    /** Recent cycles: 1 if an instruction completed (reached WB), else 0. */
    completions = [];
    constructor(cpu, options, firstBeat, secondsPerBeat, windows, chip = new Chip(1)) {
        this.pipeline = new Pipeline(cpu, options);
        this.firstBeat = firstBeat;
        this.ratedSecondsPerBeat = secondsPerBeat;
        this.windows = windows;
        this.chip = chip;
    }
    /** Seconds per beat right now: one beat is one cycle, so a faster clock means a faster beat. */
    get secondsPerBeat() {
        return this.ratedSecondsPerBeat / this.chip.clockRatio;
    }
    get done() {
        return this.pipeline.done;
    }
    /**
     * Beat on which the current cycle's decision is due: later by each beat the
     * clock was stopped, and a memory wait's cycles take only its few frozen beats.
     */
    get dueBeat() {
        const { pipeline } = this;
        return this.firstBeat + pipeline.cycle - pipeline.memoryCycles + this.memoryBeats + this.chip.haltedBeats;
    }
    /** Waiting for memory: the pipeline is frozen and presses are ignored. */
    get frozen() {
        return this.pipeline.memoryWait > 0;
    }
    /** The memory wait in progress: its cycles, how many are left, and its frozen beats left. */
    get waiting() {
        if (!this.frozen)
            return null;
        const total = this.freeze?.total ?? this.pipeline.memoryWait;
        const beats = this.freeze?.beats ?? freezeBeats(total);
        return { total, left: this.pipeline.memoryWait, beatsLeft: beats - (this.freeze?.passed ?? 0) };
    }
    /** The choice already made this cycle, if any. */
    get decided() {
        return this.pending;
    }
    /** Instructions completed per cycle over the last few cycles (0-1): how full the pipeline is running. */
    get throughput() {
        if (this.completions.length === 0)
            return 0;
        return this.completions.reduce((a, b) => a + b, 0) / THROUGHPUT_WINDOW;
    }
    /**
     * The player acts at fractional `beat`. Returns the decision, or null when
     * there is nothing to decide, it's already decided, or it's too early to count.
     */
    press(action, beat) {
        const slot = this.pipeline.stages.ID;
        // With the clock stopped, or everything waiting for memory, there's nothing to decide: presses are ignored.
        if (!slot || this.pending || this.done || this.chip.halted || this.frozen)
            return null;
        // A note already waiting on the line isn't moving, so there's no beat to hit:
        // any press during its cycle counts. Timing only matters when a note first arrives.
        const waited = this.waitingSeq === slot.seq;
        let judgment = 'PERFECT';
        if (!waited) {
            const offset = (beat - this.dueBeat) * this.secondsPerBeat;
            if (offset < -this.windows.early)
                return null;
            judgment = judge(offset, this.windows);
        }
        const outcome = judgment === 'MISS' ? 'off-beat' : (evaluate(this.pipeline, action) ?? 'missed');
        this.pending = { slot, action, outcome, judgment, hazard: this.pipeline.hazard(), waited };
        this.applyGuess(action, outcome);
        return this.pending;
    }
    /** A branch routed with a guess fetches down the guessed path right away. */
    applyGuess(action, outcome) {
        if (action?.kind !== 'route' || action.guessTaken === undefined)
            return;
        if (outcome === 'issued' || outcome === 'violation')
            this.pipeline.predict(action.guessTaken);
    }
    /** Sets this cycle's decision directly (replaying a recorded run). */
    force(action, outcome, judgment) {
        const slot = this.pipeline.stages.ID;
        if (!slot || this.done || this.chip.halted || this.frozen)
            return null;
        this.pending = { slot, action, outcome, judgment, hazard: this.pipeline.hazard(), waited: this.waitingSeq === slot.seq };
        this.applyGuess(action, outcome);
        return this.pending;
    }
    /**
     * Call every frame: advances the pipeline for each cycle whose window has
     * closed. A beat with the clock stopped (overheated) just cools the chip; a
     * beat waiting for memory spends its share of the wait's cycles.
     */
    update(beat) {
        const reports = [];
        while (!this.done && (beat - this.dueBeat) * this.secondsPerBeat > this.windows.good) {
            if (this.chip.halted)
                this.chip.coolBeat();
            else if (this.frozen)
                this.waitBeat();
            else
                reports.push(this.advance());
        }
        return reports;
    }
    /** One frozen beat: an even share of the wait's cycles pass, all of them by its last beat. */
    waitBeat() {
        const { pipeline } = this;
        this.freeze ??= { total: pipeline.memoryWait, beats: freezeBeats(pipeline.memoryWait), passed: 0 };
        const freeze = this.freeze;
        freeze.passed++;
        const spentBefore = freeze.total - pipeline.memoryWait;
        const share = freeze.passed >= freeze.beats ? pipeline.memoryWait : Math.round((freeze.total * freeze.passed) / freeze.beats) - spentBefore;
        const cycles = pipeline.wait(share);
        this.chip.waitBeat(cycles);
        this.memoryBeats++;
        if (this.frozen)
            return;
        this.freeze = null;
        // The note on the line sat through the wait: like a stalled note, it isn't arriving on a beat, so any press counts.
        this.waitingSeq = pipeline.stages.ID?.seq ?? null;
    }
    advance() {
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
            }
            else {
                this.streak = 0;
            }
        }
        // Only a correct route or a violation actually issues; every other outcome is a stall.
        const issues = decision?.outcome === 'issued' || decision?.outcome === 'violation';
        // A trip to RAM takes a fixed time, so its cycles depend on the clock right now.
        this.pipeline.clockMhz = this.chip.mhz;
        this.steps++;
        const result = this.pipeline.step(issues ? 'issue' : 'stall');
        const { dial } = this.chip;
        this.chip.cycle(issues);
        const id = this.pipeline.stages.ID;
        this.waitingSeq = slot && id?.seq === slot.seq ? id.seq : null;
        this.completions.push(result.committed ? 1 : 0);
        if (this.completions.length > THROUGHPUT_WINDOW)
            this.completions.shift();
        return { ...result, decision, dial };
    }
}
//# sourceMappingURL=pipelineRun.js.map