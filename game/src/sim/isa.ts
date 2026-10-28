// RISC-V inspired instruction set: same mnemonics and operand order as RISC-V,
// sized to whatever word width the current CPU tier has.

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
export type Load = { readonly op: 'lb'; readonly rd: number; readonly rs1: number; readonly imm: number };
export type Store = { readonly op: 'sb'; readonly rs2: number; readonly rs1: number; readonly imm: number };
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
      return `LOAD BYTE: copy memory[${x(instr.rs1)} + ${instr.imm}] into ${x(instr.rd)}`;
    case 'sb':
      return `STORE BYTE: copy ${x(instr.rs2)} into memory[${x(instr.rs1)} + ${instr.imm}]`;
    case 'beq':
      return `BRANCH IF EQUAL: if ${x(instr.rs1)} = ${x(instr.rs2)} go to ${instr.label}`;
    case 'bne':
      return `BRANCH IF NOT EQUAL: if ${x(instr.rs1)} ≠ ${x(instr.rs2)} go to ${instr.label}`;
  }
}

export function unitOf(instr: Instruction): Unit {
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
export function format(instr: Instruction, compact = false): string {
  return tokens(instr, compact)
    .map((t) => t.text)
    .join('');
}
