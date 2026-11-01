import { programByName } from '../data/programs.ts';
import { assemble } from './assembler.ts';
import { Cpu, trace } from './cpu.ts';
import { format, UNITS, unitOf, type Unit } from './isa.ts';
import { SHOWN_BYTES } from './memory.ts';

// What's in a contract's program, for the board's job sheet: the loop that
// does the work, the notes the song will send down each lane, and which
// memory it reads and writes (its access pattern). Worked out by running the
// program, so it is right for every generated job and every hand-written one.

export type JobSheet = {
  /** The program's main loop as assembly, a label in front of the lines that have one. */
  readonly loop: readonly string[];
  /** How many times the loop's first instruction runs. */
  readonly loopRuns: number;
  /** Notes the song sends down each lane: one per instruction run. */
  readonly notes: Readonly<Record<Unit, number>>;
  /** Of the memory the song shows, which addresses the program reads and which it writes. */
  readonly reads: readonly boolean[];
  readonly writes: readonly boolean[];
};

/** The job sheet for a program, by name (a contract's `program`). */
export function jobSheet(programName: string): JobSheet {
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

  const notes = Object.fromEntries(UNITS.map((unit) => [unit, 0])) as Record<Unit, number>;
  const reads = new Array<boolean>(SHOWN_BYTES).fill(false);
  const writes = new Array<boolean>(SHOWN_BYTES).fill(false);
  for (const step of steps) {
    notes[unitOf(step.instr)]++;
    if (step.loaded !== undefined && step.loaded < SHOWN_BYTES) reads[step.loaded] = true;
    if (step.stored !== undefined && step.stored < SHOWN_BYTES) writes[step.stored] = true;
  }
  return { loop, loopRuns: steps.filter((step) => step.pc === start).length, notes, reads, writes };
}
