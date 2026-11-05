import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, VGA } from '../game/src/data/pixelArt.ts';
import { ERAS } from '../game/src/ui/eras.ts';
import { ASCII, bar, cardLines, CP437, deadlineBar, frame, inkLayers, stackedBar, stampLines, TONES, type Card, type Glyphs } from '../game/src/visual/asciiChart.ts';

// Charts and cards in characters (visual/asciiChart.ts): plain ASCII on the
// 8-bit terminal, code page 437 in DOS, with their tones' colors as runs. The
// eras that draw cards with graphics (ui/card.ts) are checked by eye.

test('bars fill in proportion, and anything above zero shows at least one mark', () => {
  assert.equal(bar(5, 10, 10), '#####.....');
  assert.equal(bar(10, 10, 4), '####');
  assert.equal(bar(0, 10, 4), '....');
  assert.equal(bar(1, 1000, 4), '#...');
  assert.equal(bar(5, 10, 4, CP437), '██░░');
});

test('the deadline bar marks the deadline two thirds along and shows a late job running off the end', () => {
  assert.equal(deadlineBar(1, 2, 9).text, '[###...|..]'); // half the deadline
  assert.equal(deadlineBar(2, 2, 9).text, '[######|..]'); // exactly on it
  assert.equal(deadlineBar(100, 2, 9).text, '[######|##]>'); // far past it
  assert.equal(deadlineBar(0.001, 100, 9).text, '[#.....|..]'); // tiny, but it shows
  // In DOS: blocks, no ends; good up to the deadline, bad past it (and running off the end).
  const late = deadlineBar(100, 2, 9, CP437);
  assert.equal(late.text, '██████│██►');
  assert.deepEqual(late.inks, [{ from: 0, to: 6, tone: 'good' }, { from: 7, to: 10, tone: 'bad' }]);
});

test('a stacked bar colors each part in its tone, joining a tone\'s run', () => {
  const stack = stackedBar([{ value: 2, tone: 'good' }, { value: 1, tone: 'good' }, { value: 3, tone: 'bad' }], 8, 8, CP437);
  assert.equal(stack.text, '██████░░');
  assert.deepEqual(stack.inks, [{ from: 0, to: 3, tone: 'good' }, { from: 3, to: 6, tone: 'bad' }]);
});

test('frames: plain ASCII, or DOS\'s double lines with a single rule', () => {
  assert.deepEqual(frame(['AB', null, 'C']), ['+----+', '| AB |', '|----|', '| C  |', '+----+']);
  assert.deepEqual(frame(['AB', null], false, CP437), ['╔════╗', '║ AB ║', '╟────╢', '╚════╝']);
  assert.ok(stampLines('LATE', CP437)[0].startsWith('╔═'));
});

const card: Card = {
  stamp: { word: 'ON TIME', tone: 'good', part: 'verdict' },
  rows: [
    { kind: 'line', left: 'BAKERY', right: 'PAID $40', part: 'verdict' },
    { kind: 'deadline', seconds: 3, deadline: 4, part: 'verdict' },
    { kind: 'gap' },
    { kind: 'stack', segments: [{ value: 6, tone: 'good' }, { value: 2, tone: 'warn' }], total: 10, part: 'cycles' },
    { kind: 'legend', entries: [{ mark: 'good', text: '6 FINISHED' }, { mark: 'warn', text: '2 STALLED' }, { mark: 'empty', text: '2 FILLING' }, { mark: 'bad', text: '0 OTHER THINGS' }], part: 'cycles' },
  ],
  keys: '[ENTER] OK',
  width: 30,
};

test("a card's rows in characters: as wide as the card, its key wrapped, and each part's lines found", () => {
  for (const glyphs of [ASCII, CP437] as Glyphs[]) {
    const { lines, parts } = cardLines(card, glyphs);
    assert.equal(lines[0].text, 'BAKERY                PAID $40');
    for (const line of lines) assert.ok(line.text.length <= card.width, `"${line.text}" runs off the card`);
    // The bars run the card's whole width, with or without ends.
    assert.equal(lines[1].text.length, 30);
    assert.equal(lines[3].text.length, 30);
    assert.deepEqual(parts, { verdict: { first: 0, last: 1 }, cycles: { first: 3, last: lines.length - 1 } });
    assert.ok(lines.length >= 6, 'the key wraps onto a second line');
  }
  assert.ok(cardLines(card, ASCII).lines[4].text.startsWith('# 6 FINISHED   = 2 STALLED'));
});

test('inked lines split into layers that add up to the lines, one color each', () => {
  const { lines } = cardLines(card, CP437);
  const { base, tones } = inkLayers(lines);
  lines.forEach((line, row) => {
    const merged = [...base[row]].map((ch, i) => Object.values(tones).find((layer) => layer[row][i] !== ' ')?.[row][i] ?? ch).join('');
    assert.equal(merged, line.text);
    for (const layer of Object.values(tones)) assert.equal(layer[row].length, line.text.length);
  });
  assert.deepEqual(Object.keys(tones).sort(), ['bad', 'good', 'warn']);
});

test('every era colors every tone, and the 90s icons are 16 x 16 in the VGA colors', () => {
  for (const era of [...ERAS, ...ERAS.flatMap((each) => (each.dark ? [each.dark] : []))]) {
    for (const tone of TONES) assert.ok(Number.isInteger(era.tones[tone]), `${era.name} ${tone}`);
  }
  for (const [name, rows] of Object.entries(ICONS)) {
    assert.equal(rows.length, 16, name);
    for (const row of rows) {
      assert.equal(row.length, 16, name);
      for (const letter of row) assert.ok(letter === '.' || letter in VGA, `${name}: ${letter}`);
    }
  }
});
