// RISC-V inspired instruction set: same mnemonics and operand order as RISC-V,
// sized to whatever word width the current CPU tier has.
/** Functional units an instruction can be routed to. */
export const UNITS = ['ALU', 'MEM', 'BRANCH'];
/** What each unit does, in plain words (for tutorials). */
export const UNIT_ROLES = {
    ALU: 'Math or logic',
    MEM: 'Uses memory',
    BRANCH: 'Decides where to go next',
};
/** Plain-English meaning of an instruction, using its actual operands. */
export function describe(instr) {
    const x = (r) => `x${r}`;
    switch (instr.op) {
        case 'add':
            return `ADD: ${x(instr.rd)} = ${x(instr.rs1)} + ${x(instr.rs2)}`;
        case 'sub':
            return `SUBTRACT: ${x(instr.rd)} = ${x(instr.rs1)} - ${x(instr.rs2)}`;
        case 'and':
            return `AND: ${x(instr.rd)} = ${x(instr.rs1)} AND ${x(instr.rs2)}, bit by bit`;
        case 'or':
            return `OR: ${x(instr.rd)} = ${x(instr.rs1)} OR ${x(instr.rs2)}, bit by bit`;
        case 'xor':
            return `XOR: ${x(instr.rd)} = ${x(instr.rs1)} XOR ${x(instr.rs2)}, bit by bit`;
        case 'addi':
            return `ADD IMMEDIATE: ${x(instr.rd)} = ${x(instr.rs1)} + ${instr.imm}`;
        case 'lb':
            return `LOAD BYTE: copy memory[${x(instr.rs1)} + ${instr.imm}] into ${x(instr.rd)}`;
        case 'sb':
            return `STORE BYTE: copy ${x(instr.rs2)} into memory[${x(instr.rs1)} + ${instr.imm}]`;
        case 'beq':
            return `BRANCH IF EQUAL: if ${x(instr.rs1)} = ${x(instr.rs2)} go to ${instr.label}`;
        case 'bne':
            return `BRANCH IF NOT EQUAL: if ${x(instr.rs1)} ≠ ${x(instr.rs2)} go to ${instr.label}`;
    }
}
/** Registers an instruction reads. */
export function sourceRegs(instr) {
    switch (instr.op) {
        case 'addi':
        case 'lb':
            return [instr.rs1];
        default:
            return [instr.rs1, instr.rs2];
    }
}
/** Register an instruction writes, if any (stores and branches write none). */
export function destReg(instr) {
    switch (instr.op) {
        case 'sb':
        case 'beq':
        case 'bne':
            return undefined;
        default:
            return instr.rd;
    }
}
/**
 * The instruction at `pc` keeps a running total: it adds into its own
 * register (x3 = x3 + x4) inside a loop, and nothing else in that loop
 * writes the register (so it isn't loaded afresh each time round).
 */
export function keepsTotal(program, pc) {
    const instr = program.instructions[pc];
    if (instr?.op !== 'add' || instr.rd !== instr.rs1 || instr.rd === 0)
        return false;
    const loop = program.instructions.findIndex((other, i) => (other.op === 'beq' || other.op === 'bne') && other.target <= pc && i >= pc);
    if (loop < 0)
        return false;
    const target = program.instructions[loop].target;
    return program.instructions.slice(target, loop + 1).every((other, i) => target + i === pc || destReg(other) !== instr.rd);
}
export function unitOf(instr) {
    switch (instr.op) {
        case 'lb':
        case 'sb':
            return 'MEM';
        case 'beq':
        case 'bne':
            return 'BRANCH';
        default:
            return 'ALU';
    }
}
/** An instruction split into syntax tokens (for highlighting); `compact` drops spaces after commas. */
export function tokens(instr, compact = false) {
    const op = { text: instr.op, kind: 'op' };
    const space = { text: ' ', kind: 'punct' };
    const sep = { text: compact ? ',' : ', ', kind: 'punct' };
    const reg = (r) => ({ text: `x${r}`, kind: 'reg' });
    const num = (n) => ({ text: String(n), kind: 'num' });
    const punct = (text) => ({ text, kind: 'punct' });
    switch (instr.op) {
        case 'addi':
            return [op, space, reg(instr.rd), sep, reg(instr.rs1), sep, num(instr.imm)];
        case 'lb':
            return [op, space, reg(instr.rd), sep, num(instr.imm), punct('('), reg(instr.rs1), punct(')')];
        case 'sb':
            return [op, space, reg(instr.rs2), sep, num(instr.imm), punct('('), reg(instr.rs1), punct(')')];
        case 'beq':
        case 'bne':
            return [op, space, reg(instr.rs1), sep, reg(instr.rs2), sep, { text: instr.label, kind: 'label' }];
        default:
            return [op, space, reg(instr.rd), sep, reg(instr.rs1), sep, reg(instr.rs2)];
    }
}
/** Assembly text for an instruction; `compact` drops spaces after commas (for notes). */
export function format(instr, compact = false) {
    return tokens(instr, compact)
        .map((t) => t.text)
        .join('');
}
//# sourceMappingURL=isa.js.map