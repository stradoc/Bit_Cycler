import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARMS, ASCII_TICK, AT_REST, characterFrame, characterLayers, CP437_TICK, EYES, FEET, MOUTHS, PIXEL_TICK, pixelFrame, poseAt, POSES, poseKey, TICK, TICK_LOOKS, vectorPose,
  type CharacterSheet, type Doing, type Pose,
} from '../game/src/data/tick.ts';
import { ERAS } from '../game/src/ui/eras.ts';

// TICK as data (data/tick.ts): what he's doing becomes a pose, and every
// era's look draws every pose whole, without leftovers or misaligned lines.
// Checked here without a browser.

const calm: Doing = { talking: false, walking: false, look: 0, mood: 'calm' };
/** A moment when he isn't blinking. */
const OPEN = TICK.blink.for + 10;

test('his pose follows what he does: he blinks, talks, walks, looks and shows his mood', () => {
  assert.deepEqual(poseAt(calm, OPEN), AT_REST);
  assert.equal(poseAt(calm, TICK.blink.every * 3 + 5).eyes, 'blink');
  // Talking: his mouth runs through its shapes, one every TICK.talk.each ms.
  const mouths = TICK.talk.mouths.map((_, i) => poseAt({ ...calm, talking: true }, OPEN + i * TICK.talk.each).mouth);
  assert.equal(new Set(mouths).size, TICK.talk.mouths.length);
  // Walking: his feet step; standing, they don't.
  const feet = new Set([0, 1, 2, 3].map((i) => poseAt({ ...calm, walking: true }, OPEN + i * TICK.walk.each).feet));
  assert.ok(feet.has('left') && feet.has('right'));
  assert.equal(poseAt({ ...calm, look: -1 }, OPEN).eyes, 'left');
  assert.equal(poseAt({ ...calm, look: 1 }, OPEN).eyes, 'right');
  // Moods: a smile, a cheer (arms up), a worried frown; talking moves his mouth whatever the mood.
  assert.deepEqual(poseAt({ ...calm, mood: 'happy' }, OPEN), { eyes: 'happy', mouth: 'smile', arms: 'down', feet: 'stand' });
  assert.deepEqual(poseAt({ ...calm, mood: 'cheer' }, OPEN), { eyes: 'happy', mouth: 'smile', arms: 'up', feet: 'stand' });
  assert.deepEqual(poseAt({ ...calm, mood: 'worried' }, OPEN), { eyes: 'worried', mouth: 'frown', arms: 'down', feet: 'stand' });
  assert.notEqual(poseAt({ ...calm, mood: 'worried', talking: true }, OPEN).mouth, 'frown');
});

test('every pose is listed once, by its own name', () => {
  assert.equal(POSES.length, EYES.length * MOUTHS.length * ARMS.length * FEET.length);
  assert.equal(new Set(POSES.map(poseKey)).size, POSES.length);
});

/** Character sets: what the 8-bit terminal can show (printable ASCII), and what DOS can (code page 437). */
const ASCII = /^[\x20-\x7e]*$/;
const CP437_HIGH = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼';
const inCp437 = (line: string) => [...line].every((ch) => ASCII.test(ch) || CP437_HIGH.includes(ch));

test('in characters, every pose fills every slot, keeps every line the same width, and uses only its computer\'s characters', () => {
  const sheets: [string, CharacterSheet, (line: string) => boolean][] = [
    ['ascii', ASCII_TICK, (line) => ASCII.test(line)],
    ['cp437', CP437_TICK, inCp437],
  ];
  for (const [name, sheet, shows] of sheets) {
    const width = characterFrame(sheet, AT_REST)[0].length;
    for (const pose of POSES) {
      const frame = characterFrame(sheet, pose);
      assert.equal(frame.length, sheet.lines.length, name);
      for (const line of frame) {
        assert.equal(line.length, width, `${name} ${poseKey(pose)}: "${line}"`);
        assert.ok(!line.includes('{'), `${name}: a slot left unfilled`);
        assert.ok(shows(line), `${name}: "${line}" has a character its computer can't show`);
      }
      // The two layers, drawn over each other, make the whole frame.
      const { ink, accent } = characterLayers(sheet, pose);
      const merged = ink.map((line, row) => [...line].map((ch, i) => (accent[row][i] === ' ' ? ch : accent[row][i])).join(''));
      assert.deepEqual(merged, frame, name);
    }
    // Every line has something on it (his silhouette is drawn line by line).
    for (const line of characterFrame(sheet, AT_REST)) assert.ok(line.trim().length > 0, name);
  }
  // DOS draws his eyes in its accent color.
  assert.ok(characterLayers(CP437_TICK, AT_REST).accent[1].includes('•'));
  assert.ok(!characterLayers(CP437_TICK, AT_REST).ink[1].includes('•'));
});

/** Each part of a pose, changed on its own, shows: no two variants of a part draw the same. */
function eachPartShows(draw: (pose: Pose) => string) {
  const parts: [keyof Pose, readonly string[]][] = [['eyes', EYES], ['mouth', MOUTHS], ['arms', ARMS], ['feet', FEET]];
  for (const [part, variants] of parts) {
    const drawn = variants.map((variant) => draw({ ...AT_REST, [part]: variant }));
    assert.equal(new Set(drawn).size, variants.length, `${part}: two variants look the same`);
  }
}

test('every part of a pose shows in every look', () => {
  eachPartShows((pose) => characterFrame(ASCII_TICK, pose).join('\n'));
  eachPartShows((pose) => characterFrame(CP437_TICK, pose).join('\n'));
  eachPartShows((pose) => pixelFrame(PIXEL_TICK, pose).join('\n'));
  eachPartShows((pose) => JSON.stringify(vectorPose(pose)));
});

test('the pixel sprite: every pose is the same size, drawn only in its palette', () => {
  const [w, h] = [PIXEL_TICK.base[0].length, PIXEL_TICK.base.length];
  assert.deepEqual([w, h], [26, 32]);
  const letters = new Set([...Object.keys(PIXEL_TICK.palette), '.']);
  for (const pose of POSES) {
    const frame = pixelFrame(PIXEL_TICK, pose);
    assert.equal(frame.length, h);
    for (const row of frame) {
      assert.equal(row.length, w, poseKey(pose));
      for (const letter of row) assert.ok(letters.has(letter), `${letter} isn't in the palette`);
    }
  }
  // The 16 VGA colors only, as the 90s desktop had.
  const VGA = [0x000000, 0x000080, 0x008000, 0x008080, 0x800000, 0x800080, 0x808000, 0xc0c0c0, 0x808080, 0x0000ff, 0x00ff00, 0x00ffff, 0xff0000, 0xff00ff, 0xffff00, 0xffffff];
  for (const color of Object.values(PIXEL_TICK.palette)) assert.ok(VGA.includes(color), color.toString(16));
  // His arms, up or down, only draw beside him: over nothing, or his outline, never over his face or body.
  const { at, rightArm, rows } = PIXEL_TICK.arms;
  for (const arms of ARMS) {
    rows[arms].forEach((row, dy) =>
      [...row].forEach((letter, dx) => {
        if (letter === '.') return;
        const y = at[1] + dy;
        for (const x of [at[0] + dx, rightArm + row.length - 1 - dx]) {
          const under = PIXEL_TICK.base[y][x];
          assert.ok(under === '.' || under === 'k', `${arms} arm over his body at ${x}, ${y}`);
        }
      }),
    );
  }
});

test('in vector shapes, every pose is numbers in range', () => {
  for (const pose of POSES) {
    const v = vectorPose(pose);
    assert.ok(v.look >= -1 && v.look <= 1);
    for (const n of [v.eyesOpen, v.mouthOpen, v.armsUp, v.leftFoot, v.rightFoot]) assert.ok(n >= 0 && n <= 1, poseKey(pose));
    assert.ok(v.mouthCurve >= -1 && v.mouthCurve <= 1);
  }
});

test('every era draws him its own way, from a look that exists', () => {
  assert.deepEqual(ERAS.map((era) => era.tick), ['ascii', 'cp437', 'pixels', 'vector']);
  for (const era of ERAS) {
    assert.ok(TICK_LOOKS[era.tick], era.name);
    if (era.dark) assert.equal(era.dark.tick, era.tick);
  }
});
