import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChip } from '../game/src/visual/chip3d.ts';
import { behind, drawOrder, overlaps, screenOutline, type Part, type Shape } from '../game/src/visual/model3d.ts';
import { blockPixels } from '../game/src/data/menuFiles.ts';
import { buildTitle, pixelBlocks } from '../game/src/visual/title3d.ts';
import { NEW_GAME, withEverything } from '../game/src/sim/progress.ts';

/** The shop's camera, seen from the model, as the chip turns to `spin` (420 units away, tilted down 0.62 rad). */
const cameraAt = (spin: number): [number, number, number] => [420 * Math.cos(-0.62) * Math.sin(spin), -420 * Math.sin(-0.62), -420 * Math.cos(-0.62) * Math.cos(spin)];

/** The parts as drawn with the fan turned to `fan`. */
const shapesAt = (parts: Part[], fan: number): Shape[] =>
  parts.map(({ plan, bottom, top, spins }) => ({
    plan: spins ? plan.map(([x, z]) => [x * Math.cos(fan) - z * Math.sin(fan), x * Math.sin(fan) + z * Math.cos(fan)] as const) : plan,
    bottom,
    top,
  }));

const block = (x0: number, z0: number, x1: number, z1: number, bottom: number, top: number): Shape => ({
  plan: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]],
  bottom,
  top,
});

test('a part on top of another is drawn after it from above, before it from below', () => {
  const board = block(-10, -10, 10, 10, 0, 2);
  const die = block(-5, -5, 5, 5, 2, 4);
  assert.equal(behind(board, die, [0, 100, -50]), true);
  assert.equal(behind(board, die, [0, -100, -50]), false);
  assert.deepEqual(drawOrder([die, board], [0, 100, -50]), [1, 0]);
});

test('parts that can\'t hide each other need no order; side by side, the part nearer the camera is drawn last', () => {
  // Apart along both x and z, with the camera between the two planes: neither hides the other.
  assert.equal(behind(block(-10, -10, -5, -5, 0, 5), block(5, 5, 10, 10, 0, 5), [100, 50, -100]), null);
  const left = block(-10, -2, -4, 2, 0, 5);
  const right = block(4, -2, 10, 2, 0, 5);
  assert.equal(behind(left, right, [100, 50, 0]), true);
  assert.equal(behind(left, right, [-100, 50, 0]), false);
  // Overlapping parts have no plane between them.
  assert.equal(behind(left, block(-6, -1, 0, 1, 1, 3), [100, 50, 0]), undefined);
});

test('no two parts of a fully upgraded chip overlap, with the fan at any angle', () => {
  const parts = buildChip({ ...withEverything(NEW_GAME), chipMaxDial: 1.2 });
  for (let step = 0; step < 72; step++) {
    const shapes = shapesAt(parts, (step / 72) * 2 * Math.PI);
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        assert.notEqual(behind(shapes[i], shapes[j], cameraAt(0)), undefined, `parts ${i} and ${j} overlap at fan step ${step}`);
      }
    }
  }
});

test("the L1 drawn on the chip as it's built: a cell per byte of each line, none overlapping", () => {
  const cached = { ...withEverything(NEW_GAME), cooling: 0 };
  for (const upgrades of [[], ['lines'], ['ways'], ['blocks'], ['lines', 'ways', 'blocks']] as const) {
    const shapes = shapesAt(buildChip({ ...cached, cacheUpgrades: upgrades }), 0);
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) assert.notEqual(behind(shapes[i], shapes[j], cameraAt(0)), undefined, `${upgrades.join()}: parts ${i} and ${j} overlap`);
    }
  }
  // 4 lines of 4 cells at first; all three upgrades: 8 lines of 8.
  const cells = (upgrades: readonly ('lines' | 'ways' | 'blocks')[]) => buildChip({ ...cached, cacheUpgrades: upgrades }).length;
  assert.equal(cells(['lines', 'ways', 'blocks']) - cells([]), 64 - 16);
});

test('as the chip turns, every part is drawn after every part it can hide', () => {
  const parts = buildChip(withEverything(NEW_GAME));
  for (let step = 0; step < 48; step++) {
    const camera = cameraAt((step / 48) * 2 * Math.PI);
    const shapes = shapesAt(parts, step * 0.7);
    const position = new Map(drawOrder(shapes, camera).map((part, place) => [part, place]));
    const outlines = shapes.map((shape) => screenOutline(shape, camera));
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        // Only parts that overlap on screen can hide each other; those must agree on every plane between them.
        if (!overlaps(outlines[i], outlines[j])) continue;
        const iFirst = behind(shapes[i], shapes[j], camera);
        assert.notEqual(iFirst, null, `step ${step}: parts ${i} and ${j} overlap on screen but their planes disagree`);
        assert.equal((position.get(i) ?? 0) < (position.get(j) ?? 0), iFirst, `step ${step}: parts ${i} and ${j} out of order`);
      }
    }
  }
});

test("the title's blocks cover exactly the block letters' lit pixels, once each", () => {
  const rows = blockPixels('BIT CYCLER');
  const lit = rows.join('').split('').filter((pixel) => pixel === '#').length;
  const cells = new Set<string>();
  for (const { x, y, w, h } of pixelBlocks(rows)) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        assert.equal(rows[y + dy][x + dx], '#');
        assert.ok(!cells.has(`${x + dx},${y + dy}`), 'covered twice');
        cells.add(`${x + dx},${y + dy}`);
      }
    }
  }
  assert.equal(cells.size, lit);
});

test('the title types itself without moving: each letter lands where the whole word has it, the cursor after it', () => {
  const where = (part: Part) => JSON.stringify([part.plan, part.bottom, part.top]);
  const whole = new Set(buildTitle('BIT CYCLER').map(where));
  const typed = buildTitle('BIT CYCLER', 3);
  // "BIT" is blocks of the whole word, in the same places.
  assert.ok(typed.length > 0 && typed.every((part) => whole.has(where(part))));
  // Nothing typed yet: the cursor alone, a 5 x 5 block at the left end.
  const [cursor, ...rest] = buildTitle('BIT CYCLER', 0, true);
  assert.equal(rest.length, 0);
  assert.equal(cursor.plan[0][0], Math.min(...buildTitle('BIT CYCLER').flatMap((part) => part.plan.map(([x]) => x))));
  assert.equal(cursor.top - cursor.bottom, 50);
});

test('as the title turns toward the pointer, every block is drawn after every block it can hide', () => {
  const shapes = buildTitle('BIT CYCLER');
  for (const yaw of [-0.45, -0.2, 0, 0.2, 0.45]) {
    for (const tilt of [-0.45, -0.18, 0, 0.1]) {
      const camera: [number, number, number] = [900 * Math.cos(tilt) * Math.sin(yaw), -900 * Math.sin(tilt), -900 * Math.cos(tilt) * Math.cos(yaw)];
      const position = new Map(drawOrder(shapes, camera).map((part, place) => [part, place]));
      const outlines = shapes.map((shape) => screenOutline(shape, camera));
      for (let i = 0; i < shapes.length; i++) {
        for (let j = i + 1; j < shapes.length; j++) {
          if (!overlaps(outlines[i], outlines[j])) continue;
          const iFirst = behind(shapes[i], shapes[j], camera);
          assert.notEqual(iFirst, undefined, `blocks ${i} and ${j} overlap`);
          if (iFirst !== null) assert.equal((position.get(i) ?? 0) < (position.get(j) ?? 0), iFirst, `yaw ${yaw} tilt ${tilt}: blocks ${i} and ${j} out of order`);
        }
      }
    }
  }
});
