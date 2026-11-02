import { unitOf } from '../sim/isa.js';
import { freezeBeats } from '../sim/memory.js';
import { Pipeline } from '../sim/pipeline.js';
import { Chip } from '../sim/thermal.js';
import { judge } from './judge.js';
const CORRECT = ['issued', 'paired', 'stalled'];
const THROUGHPUT_WINDOW = 8;
/**
 * The outcome of `action` for the instruction currently in ID (null if ID is
 * empty). A chord must name ID's unit and the unit of the one behind it.
 */
export function evaluate(pipeline, action) {
    const slot = pipeline.stages.ID;
    if (!slot)
        return null;
    const hazard = pipeline.hazard();
    if (action.kind === 'stall')
        return hazard ? 'stalled' : 'wasted-stall';
    if (!action.also)
        return action.unit !== unitOf(slot.instr) ? 'wrong-unit' : hazard ? 'violation' : 'issued';
    const [first, second] = chordParts(pipeline, action);
    if (!first)
        return 'wrong-unit';
    if (hazard)
        return 'violation';
    // The chord's other lane must be the second instruction's unit, and the two must be able to start together.
    return second && pipeline.pairCheck().ok ? 'paired' : 'wrong-pair';
}
/**
 * A chord's two lanes matched to the instructions: which lane is ID's, and
 * which is the one behind it (in IF); undefined where a lane doesn't fit.
 */
function chordParts(pipeline, action) {
    const lanes = [action, ...(action.also ? [action.also] : [])];
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
    pipeline;
    /** Beat on which cycle 1 happens. */
    firstBeat;
    /** Seconds per beat at the chip's rated clock. */
    ratedSecondsPerBeat;
    windows;
    /** Clock and temperature: each cycle heats it, the dial changes the tempo, and overheating stops the clock. */
    chip;
    counts = {
        issued: 0, paired: 0, 'wrong-pair': 0, stalled: 0, 'wasted-stall': 0, violation: 0, 'wrong-unit': 0, 'off-beat': 0, missed: 0,
    };
    streak = 0;
    bestStreak = 0;
    /** Cycles played so far (decisions closed), not counting memory waits: indexes a recorded run. */
    steps = 0;
    /** Beats drawn frozen while waiting (for memory, or a deep pipeline refilling): each stands for one or more cycles. */
    waitBeats = 0;
    /** The wait in progress: all its cycles, the beats it's drawn over, and how many of those have passed. */
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
     * clock was stopped, and a wait's cycles take only its few frozen beats.
     */
    get dueBeat() {
        const { pipeline } = this;
        return this.firstBeat + pipeline.cycle - pipeline.memoryCycles - pipeline.refillCycles + this.waitBeats + this.chip.haltedBeats;
    }
    /** Waiting for memory, or a deep pipeline refilling after a wrong guess: nothing moves and presses are ignored. */
    get frozen() {
        return this.pipeline.waitLeft > 0;
    }
    /** A deep pipeline refilling after a wrong guess (not waiting for memory). */
    get refilling() {
        return this.pipeline.refillWait > 0 && this.pipeline.memoryWait === 0;
    }
    /** The wait in progress: its cycles, how many are left, and its frozen beats left. */
    get waiting() {
        if (!this.frozen)
            return null;
        const total = this.freeze?.total ?? this.pipeline.waitLeft;
        const beats = this.freeze?.beats ?? freezeBeats(total);
        return { total, left: this.pipeline.waitLeft, beatsLeft: beats - (this.freeze?.passed ?? 0) };
    }
    /** The choice already made this cycle, if any. */
    get decided() {
        return this.pending;
    }
    /** Instructions completed per cycle over the last few cycles (0-1, up to 2 superscalar): how full the pipeline is running. */
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
        this.pending = this.decide(slot, action, outcome, judgment, waited);
        return this.pending;
    }
    /**
     * Superscalar: a second lane pressed in the same cycle turns the decision
     * into a chord (either order of keys), judged again as a whole, if it's in
     * time. Returns the new decision, or null if it doesn't count.
     */
    chord(route, beat) {
        const decided = this.pending;
        if (!this.pipeline.options.superscalar || decided?.action?.kind !== 'route' || decided.action.also || decided.action.unit === route.unit)
            return null;
        const judgment = decided.waited ? 'PERFECT' : judge((beat - this.dueBeat) * this.secondsPerBeat, this.windows);
        if (judgment === 'MISS')
            return null;
        const action = { ...decided.action, also: route };
        const worse = judgment === 'GOOD' || decided.judgment === 'GOOD' ? 'GOOD' : 'PERFECT';
        this.pending = this.decide(decided.slot, action, decided.judgment === 'MISS' ? 'off-beat' : (evaluate(this.pipeline, action) ?? 'missed'), worse, decided.waited);
        return this.pending;
    }
    /** A decision for the instruction in ID, with whatever a branch's guess starts fetching. */
    decide(slot, action, outcome, judgment, waited) {
        const check = this.pipeline.pairCheck();
        const decision = {
            slot, action, outcome, judgment, hazard: this.pipeline.hazard(), waited, pairable: check.ok, pairBlock: check.ok ? undefined : check.reason,
        };
        this.applyGuess(action, outcome);
        return decision;
    }
    /** A branch routed with a guess fetches down the guessed path right away: the one in ID, or a chord's second. */
    applyGuess(action, outcome) {
        if (action?.kind !== 'route')
            return;
        if (!action.also) {
            if (action.guessTaken !== undefined && (outcome === 'issued' || outcome === 'violation'))
                this.pipeline.predict(action.guessTaken);
            return;
        }
        const [first, second] = chordParts(this.pipeline, action);
        if (first?.guessTaken !== undefined && outcome === 'violation')
            this.pipeline.predict(first.guessTaken);
        if (second?.guessTaken !== undefined && outcome === 'paired')
            this.pipeline.predictPartner(second.guessTaken);
    }
    /** Sets this cycle's decision directly (replaying a recorded run). */
    force(action, outcome, judgment) {
        const slot = this.pipeline.stages.ID;
        if (!slot || this.done || this.chip.halted || this.frozen)
            return null;
        this.pending = this.decide(slot, action, outcome, judgment, this.waitingSeq === slot.seq);
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
        this.freeze ??= { total: pipeline.waitLeft, beats: freezeBeats(pipeline.waitLeft), passed: 0 };
        const freeze = this.freeze;
        freeze.passed++;
        const spentBefore = freeze.total - pipeline.waitLeft;
        const share = freeze.passed >= freeze.beats ? pipeline.waitLeft : Math.round((freeze.total * freeze.passed) / freeze.beats) - spentBefore;
        const cycles = pipeline.wait(share);
        this.chip.waitBeat(cycles);
        this.waitBeats++;
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
            }
            else {
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
        if (this.completions.length > THROUGHPUT_WINDOW)
            this.completions.shift();
        return { ...result, decision, dial };
    }
}
//# sourceMappingURL=pipelineRun.js.map