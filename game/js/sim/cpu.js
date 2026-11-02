import { assemble } from './assembler.js';
import { accessBytes, isLoad, isStore } from './isa.js';
const MEMORY_BYTES = 256;
/** A value as a register `bits` wide holds it. */
export function wrapTo(bits, value) {
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
export function readItem(memory, address, bytes) {
    if (bytes === 8) {
        let value = 0n;
        for (let i = 7; i >= 0; i--)
            value = (value << 8n) | BigInt(memory[(address + i) & (MEMORY_BYTES - 1)]);
        return Number(BigInt.asIntN(64, value));
    }
    let value = 0;
    for (let i = bytes - 1; i >= 0; i--)
        value = value * 256 + memory[(address + i) & (MEMORY_BYTES - 1)];
    const top = 2 ** (8 * bytes);
    return value >= top / 2 ? value - top : value;
}
/** The data item at `address`, in a program whose data is `bits` wide, as its registers hold it. */
export function itemAt(memory, address, bits) {
    return wrapTo(bits, readItem(memory, address, bits / 8));
}
/** Writes the low `bytes` bytes of `value` at `address` (little-endian; a negative value as two's complement). */
export function writeItem(memory, address, bytes, value) {
    const bits = BigInt.asUintN(64, BigInt(Math.trunc(value)));
    for (let i = 0; i < bytes; i++)
        memory[(address + i) & (MEMORY_BYTES - 1)] = Number((bits >> BigInt(8 * i)) & 0xffn);
}
/** The address a load or store works out: a register's value plus the instruction's number, wrapped round to memory's size. */
export function addressOf(base, imm) {
    return (base + imm) & (MEMORY_BYTES - 1);
}
/** Single-cycle CPU: one instruction completes per clock cycle. */
export class Cpu {
    program;
    wordBits;
    regs;
    memory;
    pc = 0;
    constructor(program, wordBits, memory = [], registerCount = 8) {
        this.program = program;
        this.wordBits = wordBits;
        this.regs = new Array(registerCount).fill(0);
        this.memory = new Uint8Array(MEMORY_BYTES);
        this.memory.set(Array.from(memory));
    }
    get halted() {
        return this.pc >= this.program.instructions.length;
    }
    clone() {
        const copy = new Cpu(this.program, this.wordBits, this.memory, this.regs.length);
        copy.regs.splice(0, copy.regs.length, ...this.regs);
        copy.pc = this.pc;
        return copy;
    }
    step() {
        if (this.halted)
            throw new Error('CPU is halted');
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
                if (taken)
                    this.pc = instr.target;
                return { pc, instr, taken };
            }
        }
    }
    address(rs1, imm) {
        return addressOf(this.regs[rs1], imm);
    }
    write(pc, instr, rd, value) {
        if (rd === 0)
            return { pc, instr }; // x0 is hardwired to zero
        this.regs[rd] = wrapTo(this.wordBits, value);
        return { pc, instr, wrote: rd };
    }
}
/** Runs a copy of the CPU to completion and returns every executed instruction, in order. */
export function trace(cpu, maxSteps = 512) {
    const copy = cpu.clone();
    const steps = [];
    while (!copy.halted) {
        if (steps.length >= maxSteps)
            throw new Error(`program did not halt within ${maxSteps} steps`);
        steps.push(copy.step());
    }
    return steps;
}
/**
 * A fresh CPU for a program: its source assembled, its memory loaded, its
 * registers as wide as its data (`dataBits`, 8 unless given), `registers` of them.
 */
export function cpuFor(spec, registers = 8) {
    return new Cpu(assemble(spec.source, registers), spec.dataBits ?? 8, spec.memory, registers);
}
//# sourceMappingURL=cpu.js.map