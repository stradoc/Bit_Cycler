import { test } from 'node:test';
import assert from 'node:assert/strict';
import { behind, buildChip, drawOrder, overlaps, screenOutline, type Part, type Shape } from '../game/src/visual/chip3d.ts';
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
