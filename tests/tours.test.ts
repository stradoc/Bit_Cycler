import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS } from '../game/src/data/lessons.ts';
import { BOARD_TOUR, BOARD_TOUR_ID, SONG_TOURS, TAUGHT_IDS, WELCOME_TOUR } from '../game/src/data/tours.ts';
import type { Instruction } from '../game/src/sim/isa.ts';
import { SongWords } from '../game/src/song/words.ts';

// The guide's tours: they fit its bubble, every lesson is one (there are no
// slides), and each song tour belongs to a lesson. (Which parts of a screen a
// step may point at is checked by the compiler.)

/** About what the bubble holds at its width before it gets taller than the robot's screen space. */
const LONGEST_LINE = 150;

test('every line the guide says is short enough for its bubble', () => {
  for (const step of [...WELCOME_TOUR, ...BOARD_TOUR, ...Object.values(SONG_TOURS).flat()]) {
    assert.ok(step.say.length <= LONGEST_LINE, `${step.say.length} characters: ${step.say}`);
    assert.ok(!(step.point && step.picture), 'a step points at something or holds up a picture, not both');
  }
});

test('every lesson is a tour of the song screen, and every tour is a lesson', () => {
  for (const id of Object.keys(LESSONS)) assert.ok((SONG_TOURS[id]?.length ?? 0) >= 4, `${id} has no tour`);
  for (const id of Object.keys(SONG_TOURS)) assert.ok(LESSONS[id], `${id} is not a lesson`);
});

test('everything taught can be marked seen', () => {
  assert.ok(TAUGHT_IDS.includes(BOARD_TOUR_ID));
  for (const id of Object.keys(LESSONS)) assert.ok(TAUGHT_IDS.includes(id));
});

test('a lesson with no practice is one the game goes on from (overclocking, the memory wall)', () => {
  assert.deepEqual(
    Object.values(LESSONS).filter((lesson) => !lesson.practice).map((lesson) => lesson.id),
    ['overclock', 'memwall'],
  );
});

test("lesson 1's close look at an add uses the real numbers, points at its registers, and says where the answer went", () => {
  const words = new SongWords(null as never, null as never, null as never);
  const add = { op: 'add', rd: 3, rs1: 3, rs2: 4 } as const;
  const reads = { a: 0, b: 3, byte: 0, total: true };
  const before = words.closeLook(add, reads);
  assert.deepEqual(before.map((step) => step.point), ['listing', 'x3', 'x4', 'lanes']);
  assert.match(before[1].say, /reads x3\. It holds 0/);
  assert.match(before[2].say, /x4, which holds 3/);
  const done = (instr: Instruction, value?: number, taken?: boolean) => ({ seq: 1, pc: 4, instr, value, step: { pc: 4, instr, taken } });
  const after = words.closeLookDone(add, reads, done(add, 3));
  assert.match(after[0].say, /See! 0 \+ 3 = 3, and the ALU stored it in x3/);
  assert.equal(after.length, 2, 'x3 = x3 + x4: a running total');
  assert.equal(words.closeLookDone(add, { ...reads, total: false }, done(add, 3)).length, 1, 'no running total when the loop reloads x3');
  assert.match(words.closeLookDone(add, { a: 200, b: 100, byte: 0 }, done(add, 44))[0].say, /200 \+ 100 is 300, .* wraps round to 44/);
});

test('every kind of instruction gets a close look, pointing at what it reads and where its answer goes', () => {
  const words = new SongWords(null as never, null as never, null as never);
  const done = (instr: Instruction, value?: number, taken?: boolean) => ({ seq: 1, pc: 6, instr, value, step: { pc: 6, instr, taken } });
  const lb = { op: 'lb', rd: 4, rs1: 1, imm: 2 } as const;
  const lbBefore = words.closeLook(lb, { a: 1, b: 0, byte: 7 });
  assert.match(lbBefore[1].say, /the address is 1 \+ 2 = 3/);
  assert.match(lbBefore[2].say, /address 3 holds 7 \(memory shows it as 07\)/);
  assert.equal(lbBefore[2].point, 'memory');
  assert.match(words.closeLookDone(lb, { a: 1, b: 0, byte: 7 }, done(lb, 7))[0].say, /The 7 from address 3 was copied into x4/);

  const sb = { op: 'sb', rs2: 3, rs1: 0, imm: 8 } as const;
  assert.match(words.closeLook(sb, { a: 0, b: 17, byte: 0 })[2].say, /x0 always holds 0\. So the address is 0 \+ 8 = 8/);
  assert.equal(words.closeLookDone(sb, { a: 0, b: 17, byte: 0 }, done(sb))[0].point, 'memory');

  const addi = { op: 'addi', rd: 2, rs1: 0, imm: 4 } as const;
  assert.match(words.closeLook(addi, { a: 0, b: 0, byte: 0 })[1].say, /just puts 4 into x2/);
  const count = { op: 'addi', rd: 1, rs1: 1, imm: 1 } as const;
  assert.equal(words.closeLookDone(count, { a: 2, b: 0, byte: 0 }, done(count, 3)).length, 2, 'counting round the loop');

  const bne = { op: 'bne', rs1: 1, rs2: 2, target: 3, label: 'loop' } as const;
  assert.match(words.closeLook(bne, { a: 1, b: 4, byte: 0 })[2].say, /different, so it will jump \(TAKEN\)/);
  assert.match(words.closeLookDone(bne, { a: 1, b: 4, byte: 0 }, done(bne, undefined, true))[0].say, /jumped back to loop/);
  assert.match(words.closeLookDone(bne, { a: 4, b: 4, byte: 0 }, done(bne, undefined, false))[0].say, /carried straight on/);

  const xor = { op: 'xor', rd: 5, rs1: 3, rs2: 4 } as const;
  assert.match(words.closeLookDone(xor, { a: 3, b: 5, byte: 0 }, done(xor, 6))[0].say, /00000011 XOR 00000101 = 00000110: that's 6/);
  const sub = { op: 'sub', rd: 5, rs1: 3, rs2: 4 } as const;
  assert.match(words.closeLookDone(sub, { a: 0, b: 3, byte: 0 }, done(sub, 253))[0].say, /0 - 3 is -3, .* wraps round to 253/);
  const toZero = { op: 'add', rd: 0, rs1: 3, rs2: 4 } as const;
  assert.match(words.closeLookDone(toZero, { a: 1, b: 2, byte: 0 }, done(toZero))[0].say, /x0 always stays 0/);
});

test('every close look fits the bubble, even with the biggest numbers', () => {
  const words = new SongWords(null as never, null as never, null as never);
  const big = { a: 255, b: 255, byte: 255 };
  const instrs: Instruction[] = [
    ...(['add', 'sub', 'and', 'or', 'xor'] as const).map((op) => ({ op, rd: 7, rs1: 6, rs2: 5 })),
    { op: 'addi', rd: 7, rs1: 6, imm: 127 },
    { op: 'lb', rd: 7, rs1: 6, imm: 127 },
    { op: 'sb', rs2: 7, rs1: 6, imm: 127 },
    { op: 'beq', rs1: 7, rs2: 6, target: 0, label: 'outer' },
    { op: 'bne', rs1: 7, rs2: 6, target: 9, label: 'outer' },
  ];
  for (const instr of instrs) {
    const done = { seq: 1, pc: 5, instr, value: 254, step: { pc: 5, instr, taken: true } };
    for (const step of [...words.closeLook(instr, big), ...words.closeLookDone(instr, big, done)]) {
      assert.ok(step.say.length <= LONGEST_LINE, `${step.say.length}: ${step.say}`);
    }
  }
});
