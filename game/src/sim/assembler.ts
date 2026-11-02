import type { Instruction, Program } from './isa.ts';

const LABEL_LINE = /^([A-Za-z_]\w*):\s*(.*)$/;
const MEM_OPERAND = /^(-?(?:0x[0-9a-fA-F]+|\d+))\((x\d+)\)$/;

/**
 * Assembles RISC-V style text: one instruction per line, `label:` prefixes,
 * `#` comments, immediates in decimal or 0x hex.
 */
export function assemble(source: string, registerCount = 32): Program {
  // Pass 1: strip comments, record label positions.
  const lines: { text: string; line: number }[] = [];
  const labels = new Map<string, number>();
  source.split('\n').forEach((raw, n) => {
    let text = raw.replace(/#.*/, '').trim();
    const labelMatch = LABEL_LINE.exec(text);
    if (labelMatch) {
      const [, name, rest] = labelMatch;
      if (labels.has(name)) throw new Error(`line ${n + 1}: duplicate label "${name}"`);
      labels.set(name, lines.length);
      text = rest.trim();
    }
    if (text) lines.push({ text, line: n + 1 });
  });

  // Pass 2: parse instructions, now that every label is known.
  const instructions = lines.map(({ text, line }) => parseInstruction(text, line, labels, registerCount));
  return { instructions, labels };
}

function parseInstruction(
  text: string,
  line: number,
  labels: ReadonlyMap<string, number>,
  registerCount: number,
): Instruction {
  const fail = (message: string) => new Error(`line ${line}: ${message}`);
  const [, op, rest] = /^(\S+)\s*(.*)$/.exec(text) ?? [];
  const args = (rest ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const expectArgs = (count: number) => {
    if (args.length !== count) throw fail(`${op} takes ${count} operands, got ${args.length}`);
  };
  const reg = (s: string) => {
    const m = /^x(\d+)$/.exec(s);
    if (!m || Number(m[1]) >= registerCount) throw fail(`bad register "${s}" (x0-x${registerCount - 1})`);
    return Number(m[1]);
  };
  const imm = (s: string) => {
    const value = Number(s);
    if (s === '' || !Number.isInteger(value)) throw fail(`bad immediate "${s}"`);
    return value;
  };
  const memOperand = (s: string) => {
    const m = MEM_OPERAND.exec(s);
    if (!m) throw fail(`expected offset(register), got "${s}"`);
    return { imm: imm(m[1]), rs1: reg(m[2]) };
  };
  const label = (s: string) => {
    const target = labels.get(s);
    if (target === undefined) throw fail(`unknown label "${s}"`);
    return target;
  };

  switch (op) {
    case 'add':
    case 'sub':
    case 'and':
    case 'or':
    case 'xor':
      expectArgs(3);
      return { op, rd: reg(args[0]), rs1: reg(args[1]), rs2: reg(args[2]) };
    case 'addi':
      expectArgs(3);
      return { op, rd: reg(args[0]), rs1: reg(args[1]), imm: imm(args[2]) };
    case 'lb':
    case 'lh':
    case 'lw':
    case 'ld':
      expectArgs(2);
      return { op, rd: reg(args[0]), ...memOperand(args[1]) };
    case 'sb':
    case 'sh':
    case 'sw':
    case 'sd':
      expectArgs(2);
      return { op, rs2: reg(args[0]), ...memOperand(args[1]) };
    case 'beq':
    case 'bne':
      expectArgs(3);
      return { op, rs1: reg(args[0]), rs2: reg(args[1]), target: label(args[2]), label: args[2] };
    default:
      throw fail(`unknown instruction "${op}"`);
  }
}
