import type { Instruction, Program } from './isa.ts';

export type WordBits = 8 | 16;

const MEMORY_BYTES = 256;

/** The address a load or store works out: a register's value plus the instruction's number, wrapped round to memory's size. */
export function addressOf(base: number, imm: number): number {
  return (base + imm) & (MEMORY_BYTES - 1);
}

/** What one executed instruction did, for display and scoring. */
export type Step = {
  readonly pc: number;
  readonly instr: Instruction;
  readonly wrote?: number; // destination register, if one changed
  readonly stored?: number; // memory address, if one changed
  readonly loaded?: number; // memory address a load read
  readonly taken?: boolean; // branches only
};

/** Single-cycle CPU: one instruction completes per clock cycle. */
export class Cpu {
  readonly program: Program;
  readonly wordBits: WordBits;
  readonly regs: number[];
  readonly memory: Uint8Array;
  pc = 0;

  constructor(program: Program, wordBits: WordBits, memory: ArrayLike<number> = [], registerCount = 8) {
    this.program = program;
    this.wordBits = wordBits;
    this.regs = new Array<number>(registerCount).fill(0);
    this.memory = new Uint8Array(MEMORY_BYTES);
    this.memory.set(Array.from(memory));
  }

  get halted(): boolean {
    return this.pc >= this.program.instructions.length;
  }

  clone(): Cpu {
    const copy = new Cpu(this.program, this.wordBits, this.memory, this.regs.length);
    copy.regs.splice(0, copy.regs.length, ...this.regs);
    copy.pc = this.pc;
    return copy;
  }

  step(): Step {
    if (this.halted) throw new Error('CPU is halted');
    const pc = this.pc;
    const instr = this.program.instructions[pc];
    this.pc++;

    switch (instr.op) {
      case 'add':
        return this.write(pc, instr, instr.rd, this.regs[instr.rs1] + this.regs[instr.rs2]);
      case 'sub':
        return this.write(pc, instr, instr.rd, this.regs[instr.rs1] - this.regs[instr.rs2]);
      case 'and':
        return this.write(pc, instr, instr.rd, this.regs[instr.rs1] & this.regs[instr.rs2]);
      case 'or':
        return this.write(pc, instr, instr.rd, this.regs[instr.rs1] | this.regs[instr.rs2]);
      case 'xor':
        return this.write(pc, instr, instr.rd, this.regs[instr.rs1] ^ this.regs[instr.rs2]);
      case 'addi':
        return this.write(pc, instr, instr.rd, this.regs[instr.rs1] + instr.imm);
      case 'lb': {
        // Like RISC-V, lb sign-extends the byte to the full register width.
        const address = this.address(instr.rs1, instr.imm);
        const byte = this.memory[address];
        return { ...this.write(pc, instr, instr.rd, byte & 0x80 ? byte - 0x100 : byte), loaded: address };
      }
      case 'sb': {
        const address = this.address(instr.rs1, instr.imm);
        this.memory[address] = this.regs[instr.rs2] & 0xff;
        return { pc, instr, stored: address };
      }
      case 'beq':
      case 'bne': {
        const equal = this.regs[instr.rs1] === this.regs[instr.rs2];
        const taken = instr.op === 'beq' ? equal : !equal;
        if (taken) this.pc = instr.target;
        return { pc, instr, taken };
      }
    }
  }

  /** Wraps a value to the word size, as the hardware register would. */
  private wrap(value: number): number {
    return value & ((1 << this.wordBits) - 1);
  }

  private address(rs1: number, imm: number): number {
    return addressOf(this.regs[rs1], imm);
  }

  private write(pc: number, instr: Instruction, rd: number, value: number): Step {
    if (rd === 0) return { pc, instr }; // x0 is hardwired to zero
    this.regs[rd] = this.wrap(value);
    return { pc, instr, wrote: rd };
  }
}

/** Runs a copy of the CPU to completion and returns every executed instruction, in order. */
export function trace(cpu: Cpu, maxSteps = 512): Step[] {
  const copy = cpu.clone();
  const steps: Step[] = [];
  while (!copy.halted) {
    if (steps.length >= maxSteps) throw new Error(`program did not halt within ${maxSteps} steps`);
    steps.push(copy.step());
  }
  return steps;
}
