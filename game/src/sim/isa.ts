// RISC-V inspired instruction set: same mnemonics and operand order as RISC-V,
// sized to the width of the job's data: loads and stores move 1, 2, 4 or 8 bytes.

/** Functional units an instruction can be routed to. */
export const UNITS = ['ALU', 'MEM', 'BRANCH'] as const;
export type Unit = (typeof UNITS)[number];

export type RType = {
  readonly op: 'add' | 'sub' | 'and' | 'or' | 'xor';
  readonly rd: number;
  readonly rs1: number;
  readonly rs2: number;
};
export type IType = { readonly op: 'addi'; readonly rd: number; readonly rs1: number; readonly imm: number };
/** Loads and stores by how much they move: a byte, a halfword (2 bytes), a word (4) or a doubleword (8), as in RISC-V. */
export const LOADS = { lb: 1, lh: 2, lw: 4, ld: 8 } as const;
export const STORES = { sb: 1, sh: 2, sw: 4, sd: 8 } as const;
export type LoadOp = keyof typeof LOADS;
export type StoreOp = keyof typeof STORES;
/** Each size's name, for the words that describe them. */
export const SIZE_NAMES: Readonly<Record<number, string>> = { 1: 'BYTE', 2: 'HALFWORD', 4: 'WORD', 8: 'DOUBLEWORD' };

export type Load = { readonly op: LoadOp; readonly rd: number; readonly rs1: number; readonly imm: number };
export type Store = { readonly op: StoreOp; readonly rs2: number; readonly rs1: number; readonly imm: number };
export type Branch = {
  readonly op: 'beq' | 'bne';
  readonly rs1: number;
  readonly rs2: number;
  readonly target: number; // instruction index
  readonly label: string;
};
export type Instruction = RType | IType | Load | Store | Branch;

export type Program = {
  readonly instructions: readonly Instruction[];
  readonly labels: ReadonlyMap<string, number>;
};

export const isLoad = (instr: Instruction): instr is Load => instr.op in LOADS;
export const isBranch = (instr: Instruction | undefined): instr is Branch => instr?.op === 'beq' || instr?.op === 'bne';
export const isStore = (instr: Instruction): instr is Store => instr.op in STORES;

/** How many bytes a load or store moves (0 for anything else). */
export function accessBytes(instr: Instruction): number {
  return isLoad(instr) ? LOADS[instr.op] : isStore(instr) ? STORES[instr.op] : 0;
}

/** The load and the store that move `bytes` at a time (lb / sb for 1, lw / sw for 4, ...). */
export function memoryOps(bytes: number): { readonly load: LoadOp; readonly store: StoreOp } {
  const load = (Object.keys(LOADS) as LoadOp[]).find((op) => LOADS[op] === bytes) ?? 'lb';
  const store = (Object.keys(STORES) as StoreOp[]).find((op) => STORES[op] === bytes) ?? 'sb';
  return { load, store };
}

/** What each unit does, in plain words (for tutorials). */
export const UNIT_ROLES: Record<Unit, string> = {
  ALU: 'Math or logic',
  MEM: 'Uses memory',
  BRANCH: 'Decides where to go next',
};

/** Plain-English meaning of an instruction, using its actual operands. */
export function describe(instr: Instruction): string {
  const x = (r: number) => `x${r}`;
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
function sized(bytes: number): string {
  return bytes === 1 ? SIZE_NAMES[1] : `${SIZE_NAMES[bytes]} (${bytes} BYTES)`;
}

/** Registers an instruction reads. */
export function sourceRegs(instr: Instruction): number[] {
  if (instr.op === 'addi' || isLoad(instr)) return [instr.rs1];
  return [instr.rs1, instr.rs2];
}

/** Register an instruction writes, if any (stores and branches write none). */
export function destReg(instr: Instruction): number | undefined {
  if (isStore(instr) || isBranch(instr)) return undefined;
  return (instr as RType | IType | Load).rd;
}

/**
 * The instruction at `pc` keeps a running total: it adds into its own
 * register (x3 = x3 + x4) inside a loop, and nothing else in that loop
 * writes the register (so it isn't loaded afresh each time round).
 */
export function keepsTotal(program: Program, pc: number): boolean {
  const instr = program.instructions[pc];
  if (instr?.op !== 'add' || instr.rd !== instr.rs1 || instr.rd === 0) return false;
  const loop = program.instructions.findIndex((other, i) => (other.op === 'beq' || other.op === 'bne') && other.target <= pc && i >= pc);
  if (loop < 0) return false;
  const target = (program.instructions[loop] as Branch).target;
  return program.instructions.slice(target, loop + 1).every((other, i) => target + i === pc || destReg(other) !== instr.rd);
}

export function unitOf(instr: Instruction): Unit {
  if (isLoad(instr) || isStore(instr)) return 'MEM';
  return instr.op === 'beq' || instr.op === 'bne' ? 'BRANCH' : 'ALU';
}

export type TokenKind = 'op' | 'reg' | 'num' | 'label' | 'punct';
export type Token = { readonly text: string; readonly kind: TokenKind };

/** An instruction split into syntax tokens (for highlighting); `compact` drops spaces after commas. */
export function tokens(instr: Instruction, compact = false): Token[] {
  const op: Token = { text: instr.op, kind: 'op' };
  const space: Token = { text: ' ', kind: 'punct' };
  const sep: Token = { text: compact ? ',' : ', ', kind: 'punct' };
  const reg = (r: number): Token => ({ text: `x${r}`, kind: 'reg' });
  const num = (n: number): Token => ({ text: String(n), kind: 'num' });
  const punct = (text: string): Token => ({ text, kind: 'punct' });

  if (isLoad(instr)) return [op, space, reg(instr.rd), sep, num(instr.imm), punct('('), reg(instr.rs1), punct(')')];
  if (isStore(instr)) return [op, space, reg(instr.rs2), sep, num(instr.imm), punct('('), reg(instr.rs1), punct(')')];
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
export function format(instr: Instruction, compact = false): string {
  return tokens(instr, compact)
    .map((t) => t.text)
    .join('');
}
