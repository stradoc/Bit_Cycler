import { assemble } from './assembler.ts';
import { accessBytes, isLoad, isStore, type Instruction, type Program } from './isa.ts';

/**
 * How wide the registers are: the width of the job's data (a byte job's CPU
 * works in bytes whatever chip runs it). 8 and 16 bits wrap round as unsigned
 * numbers, as before; 32 and 64 hold signed ones. The 64-bit registers are
 * JavaScript numbers, exact up to 2^53: the game's values stay far below that
 * (approximate, and said so in the README).
 */
export type WordBits = 8 | 16 | 32 | 64;

const MEMORY_BYTES = 256;

/** A value as a register `bits` wide holds it. */
export function wrapTo(bits: WordBits, value: number): number {
  switch (bits) {
    case 8:
      return value & 0xff;
    case 16:
      return value & 0xffff;
    case 32:
      return value | 0;
    case 64:
      return value;
  }
}

/** The `bytes`-byte number at `address` (little-endian, like RISC-V), sign-extended from its own size. */
export function readItem(memory: ArrayLike<number>, address: number, bytes: number): number {
  if (bytes === 8) {
    let value = 0n;
    for (let i = 7; i >= 0; i--) value = (value << 8n) | BigInt(memory[(address + i) & (MEMORY_BYTES - 1)]);
    return Number(BigInt.asIntN(64, value));
  }
  let value = 0;
  for (let i = bytes - 1; i >= 0; i--) value = value * 256 + memory[(address + i) & (MEMORY_BYTES - 1)];
  const top = 2 ** (8 * bytes);
  return value >= top / 2 ? value - top : value;
}

/** The data item at `address`, in a program whose data is `bits` wide, as its registers hold it. */
export function itemAt(memory: ArrayLike<number>, address: number, bits: WordBits): number {
  return wrapTo(bits, readItem(memory, address, bits / 8));
}

/** Writes the low `bytes` bytes of `value` at `address` (little-endian; a negative value as two's complement). */
export function writeItem(memory: Uint8Array, address: number, bytes: number, value: number): void {
  const bits = BigInt.asUintN(64, BigInt(Math.trunc(value)));
  for (let i = 0; i < bytes; i++) memory[(address + i) & (MEMORY_BYTES - 1)] = Number((bits >> BigInt(8 * i)) & 0xffn);
}

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
  readonly size?: number; // bytes a load or store moved
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

    if (isLoad(instr)) {
      // Like RISC-V, a load sign-extends what it read to the register's width.
      const address = this.address(instr.rs1, instr.imm);
      const size = accessBytes(instr);
      return { ...this.write(pc, instr, instr.rd, readItem(this.memory, address, size)), loaded: address, size };
    }
    if (isStore(instr)) {
      const address = this.address(instr.rs1, instr.imm);
      const size = accessBytes(instr);
      writeItem(this.memory, address, size, this.regs[instr.rs2]);
      return { pc, instr, stored: address, size };
    }
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
      case 'beq':
      case 'bne': {
        const equal = this.regs[instr.rs1] === this.regs[instr.rs2];
        const taken = instr.op === 'beq' ? equal : !equal;
        if (taken) this.pc = instr.target;
        return { pc, instr, taken };
      }
    }
  }


  private address(rs1: number, imm: number): number {
    return addressOf(this.regs[rs1], imm);
  }

  private write(pc: number, instr: Instruction, rd: number, value: number): Step {
    if (rd === 0) return { pc, instr }; // x0 is hardwired to zero
    this.regs[rd] = wrapTo(this.wordBits, value);
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

/**
 * A fresh CPU for a program: its source assembled, its memory loaded, its
 * registers as wide as its data (`dataBits`, 8 unless given), `registers` of them.
 */
export function cpuFor(spec: { readonly source: string; readonly memory: readonly number[]; readonly dataBits?: WordBits }, registers = 8): Cpu {
  return new Cpu(assemble(spec.source, registers), spec.dataBits ?? 8, spec.memory, registers);
}
