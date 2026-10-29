import { unitOf } from '../sim/isa.js';
import { Pipeline } from '../sim/pipeline.js';
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
    secondsPerBeat;
    windows;
    counts = {
        issued: 0, stalled: 0, 'wasted-stall': 0, violation: 0, 'wrong-unit': 0, 'off-beat': 0, missed: 0,
    };
    streak = 0;
    bestStreak = 0;
    pending = null;
    /** Seq of the instruction that stalled last cycle and is still waiting in ID. */
    waitingSeq = null;
    /** Recent cycles: 1 if an instruction completed (reached WB), else 0. */
    completions = [];
    constructor(cpu, forwarding, firstBeat, secondsPerBeat, windows) {
        this.pipeline = new Pipeline(cpu, { forwarding });
        this.firstBeat = firstBeat;
        this.secondsPerBeat = secondsPerBeat;
        this.windows = windows;
    }
    get done() {
        return this.pipeline.done;
    }
    /** Beat on which the current cycle's decision is due. */
    get dueBeat() {
        return this.firstBeat + this.pipeline.cycle;
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
        if (!slot || this.pending || this.done)
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
        return this.pending;
    }
    /** Sets this cycle's decision directly (replaying a recorded run). */
    force(action, outcome, judgment) {
        const slot = this.pipeline.stages.ID;
        if (!slot || this.done)
            return null;
        this.pending = { slot, action, outcome, judgment, hazard: this.pipeline.hazard(), waited: this.waitingSeq === slot.seq };
        return this.pending;
    }
    /** Call every frame: advances the pipeline for each cycle whose window has closed. */
    update(beat) {
        const reports = [];
        while (!this.done && (beat - this.dueBeat) * this.secondsPerBeat > this.windows.good) {
            reports.push(this.advance());
        }
        return reports;
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
        const result = this.pipeline.step(issues ? 'issue' : 'stall');
        const id = this.pipeline.stages.ID;
        this.waitingSeq = slot && id?.seq === slot.seq ? id.seq : null;
        this.completions.push(result.committed ? 1 : 0);
        if (this.completions.length > THROUGHPUT_WINDOW)
            this.completions.shift();
        return { ...result, decision };
    }
}
//# sourceMappingURL=pipelineRun.js.map