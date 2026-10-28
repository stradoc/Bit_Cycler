const MEMORY_BYTES = 256;
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
                const byte = this.memory[this.address(instr.rs1, instr.imm)];
                return this.write(pc, instr, instr.rd, byte & 0x80 ? byte - 0x100 : byte);
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
                if (taken)
                    this.pc = instr.target;
                return { pc, instr, taken };
            }
        }
    }
    /** Wraps a value to the word size, as the hardware register would. */
    wrap(value) {
        return value & ((1 << this.wordBits) - 1);
    }
    address(rs1, imm) {
        return (this.regs[rs1] + imm) & (MEMORY_BYTES - 1);
    }
    write(pc, instr, rd, value) {
        if (rd === 0)
            return { pc, instr }; // x0 is hardwired to zero
        this.regs[rd] = this.wrap(value);
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
//# sourceMappingURL=cpu.js.map