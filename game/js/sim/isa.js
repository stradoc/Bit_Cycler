// RISC-V inspired instruction set: same mnemonics and operand order as RISC-V,
// sized to the width of the job's data: loads and stores move 1, 2, 4 or 8 bytes.
/** Functional units an instruction can be routed to. */
export const UNITS = ['ALU', 'MEM', 'BRANCH'];
/** Loads and stores by how much they move: a byte, a halfword (2 bytes), a word (4) or a doubleword (8), as in RISC-V. */
export const LOADS = { lb: 1, lh: 2, lw: 4, ld: 8 };
export const STORES = { sb: 1, sh: 2, sw: 4, sd: 8 };
/** Each size's name, for the words that describe them. */
export const SIZE_NAMES = { 1: 'BYTE', 2: 'HALFWORD', 4: 'WORD', 8: 'DOUBLEWORD' };
export const isLoad = (instr) => instr.op in LOADS;
export const isBranch = (instr) => instr?.op === 'beq' || instr?.op === 'bne';
export const isStore = (instr) => instr.op in STORES;
/** How many bytes a load or store moves (0 for anything else). */
export function accessBytes(instr) {
    return isLoad(instr) ? LOADS[instr.op] : isStore(instr) ? STORES[instr.op] : 0;
}
/** The load and the store that move `bytes` at a time (lb / sb for 1, lw / sw for 4, ...). */
export function memoryOps(bytes) {
    const load = Object.keys(LOADS).find((op) => LOADS[op] === bytes) ?? 'lb';
    const store = Object.keys(STORES).find((op) => STORES[op] === bytes) ?? 'sb';
    return { load, store };
}
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
        case 'lh':
        case 'lw':
        case 'ld':
            return `LOAD ${sized(LOADS[instr.op])}: copy memory[${x(instr.rs1)} + ${instr.imm}] into ${x(instr.rd)}`;
        case 'sb':
        case 'sh':
        case 'sw':
        case 'sd':
            return `STORE ${sized(STORES[instr.op])}: copy ${x(instr.rs2)} into memory[${x(instr.rs1)} + ${instr.imm}]`;
        case 'beq':
            return `BRANCH IF EQUAL: if ${x(instr.rs1)} = ${x(instr.rs2)} go to ${instr.label}`;
        case 'bne':
            return `BRANCH IF NOT EQUAL: if ${x(instr.rs1)} ≠ ${x(instr.rs2)} go to ${instr.label}`;
    }
}
/** A size's name, and how many bytes when it's more than one ("WORD (4 BYTES)"). */
function sized(bytes) {
    return bytes === 1 ? SIZE_NAMES[1] : `${SIZE_NAMES[bytes]} (${bytes} BYTES)`;
}
/** Registers an instruction reads. */
export function sourceRegs(instr) {
    if (instr.op === 'addi' || isLoad(instr))
        return [instr.rs1];
    return [instr.rs1, instr.rs2];
}
/** Register an instruction writes, if any (stores and branches write none). */
export function destReg(instr) {
    if (isStore(instr) || isBranch(instr))
        return undefined;
    return instr.rd;
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
    if (isLoad(instr) || isStore(instr))
        return 'MEM';
    return instr.op === 'beq' || instr.op === 'bne' ? 'BRANCH' : 'ALU';
}
/** An instruction split into syntax tokens (for highlighting); `compact` drops spaces after commas. */
export function tokens(instr, compact = false) {
    const op = { text: instr.op, kind: 'op' };
    const space = { text: ' ', kind: 'punct' };
    const sep = { text: compact ? ',' : ', ', kind: 'punct' };
    const reg = (r) => ({ text: `x${r}`, kind: 'reg' });
    const num = (n) => ({ text: String(n), kind: 'num' });
    const punct = (text) => ({ text, kind: 'punct' });
    if (isLoad(instr))
        return [op, space, reg(instr.rd), sep, num(instr.imm), punct('('), reg(instr.rs1), punct(')')];
    if (isStore(instr))
        return [op, space, reg(instr.rs2), sep, num(instr.imm), punct('('), reg(instr.rs1), punct(')')];
    switch (instr.op) {
        case 'addi':
            return [op, space, reg(instr.rd), sep, reg(instr.rs1), sep, num(instr.imm)];
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