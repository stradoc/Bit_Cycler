import { trace } from '../sim/cpu.js';
import { unitOf } from '../sim/isa.js';
import { judge } from './judge.js';
/**
 * One program played on a single-cycle CPU. Each beat is a clock cycle: a
 * correct press executes the next instruction, and a miss stalls the CPU for
 * a cycle, pushing every later instruction back one beat.
 */
export class SingleCycleRun {
    cpu;
    notes;
    firstBeat;
    secondsPerBeat;
    windows;
    counts = { PERFECT: 0, GOOD: 0, MISS: 0 };
    head = 0;
    stalls = 0;
    constructor(cpu, firstBeat, secondsPerBeat, windows) {
        this.cpu = cpu;
        this.notes = trace(cpu);
        this.firstBeat = firstBeat;
        this.secondsPerBeat = secondsPerBeat;
        this.windows = windows;
    }
    get done() {
        return this.head >= this.notes.length;
    }
    get instructions() {
        return this.head;
    }
    get cycles() {
        return this.head + this.stalls;
    }
    get cpi() {
        return this.head === 0 ? 0 : this.cycles / this.head;
    }
    /** Beat on which note `index` (not yet played) is due. */
    dueBeat(index) {
        return this.firstBeat + index + this.stalls;
    }
    /** A press on `unit` at fractional `beat`. Returns null if it was too early to count. */
    press(unit, beat) {
        if (this.done)
            return null;
        const offset = (beat - this.dueBeat(this.head)) * this.secondsPerBeat;
        if (offset < -this.windows.early)
            return null;
        const expected = unitOf(this.notes[this.head].instr);
        return this.resolve(unit === expected ? judge(offset, this.windows) : 'MISS', unit);
    }
    /** Call every frame: misses any note whose window has passed without a press. */
    update(beat) {
        const results = [];
        while (!this.done && (beat - this.dueBeat(this.head)) * this.secondsPerBeat > this.windows.good) {
            results.push(this.resolve('MISS', null));
        }
        return results;
    }
    resolve(judgment, pressed) {
        const index = this.head;
        const step = this.notes[index];
        this.counts[judgment]++;
        if (judgment === 'MISS') {
            this.stalls++;
        }
        else {
            this.cpu.step();
            this.head++;
        }
        return { index, step, judgment, expected: unitOf(step.instr), pressed };
    }
}
//# sourceMappingURL=run.js.map