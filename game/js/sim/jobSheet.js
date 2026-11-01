import { programByName } from '../data/programs.js';
import { assemble } from './assembler.js';
import { Cpu, trace } from './cpu.js';
import { format, UNITS, unitOf } from './isa.js';
import { SHOWN_BYTES } from './memory.js';
/** The job sheet for a program, by name (a contract's `program`). */
export function jobSheet(programName) {
    const spec = programByName(programName);
    const program = assemble(spec.source, 8);
    const steps = trace(new Cpu(program, 8, spec.memory));
    // The main loop: the backward branch that reaches furthest back (the outer loop of a loop inside a loop).
    let start = 0;
    let end = program.instructions.length - 1;
    let furthest = Number.POSITIVE_INFINITY;
    program.instructions.forEach((instr, i) => {
        if ((instr.op === 'beq' || instr.op === 'bne') && instr.target <= i && instr.target < furthest) {
            furthest = instr.target;
            [start, end] = [instr.target, i];
        }
    });
    const labels = new Map([...program.labels].map(([name, index]) => [index, name]));
    const loop = program.instructions.slice(start, end + 1).map((instr, i) => {
        const label = labels.get(start + i);
        return (label ? `${label}:` : '').padEnd(7) + format(instr);
    });
    const notes = Object.fromEntries(UNITS.map((unit) => [unit, 0]));
    const reads = new Array(SHOWN_BYTES).fill(false);
    const writes = new Array(SHOWN_BYTES).fill(false);
    for (const step of steps) {
        notes[unitOf(step.instr)]++;
        if (step.loaded !== undefined && step.loaded < SHOWN_BYTES)
            reads[step.loaded] = true;
        if (step.stored !== undefined && step.stored < SHOWN_BYTES)
            writes[step.stored] = true;
    }
    return { loop, loopRuns: steps.filter((step) => step.pc === start).length, notes, reads, writes };
}
//# sourceMappingURL=jobSheet.js.map