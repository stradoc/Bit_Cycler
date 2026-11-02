import { banner } from '../data/menuFiles.ts';

// Drawings in characters, so every era's monospace font draws them: plain
// ASCII on the 8-bit terminal, the IBM PC's own characters (code page 437:
// solid blocks, shades, double-line boxes) in DOS. Bars for the results and
// the job sheet, framed boxes, the calendar's page and timecard, and a card
// (a stamp, rows of text and bars, its keys) as lines of characters. The
// eras that draw with graphics draw the same card in ui/card.ts. Each
// returns text; screens only place it.

/**
 * What a mark in a chart means: work done, a wait, a loss, and two more
 * kinds. Each era gives each its color (`tones` in ui/eras.ts); the
 * character eras give each a character too.
 */
export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'extra';
export const TONES: readonly Tone[] = ['good', 'warn', 'bad', 'info', 'extra'];

/** A bar's mark: a tone, or the bar's empty part. */
export type Mark = Tone | 'empty';

/** The characters charts are drawn in. */
export type Glyphs = {
  /** What fills a bar for each tone, and its empty part. */
  readonly fill: Readonly<Record<Mark, string>>;
  /** The deadline's mark in a bar, a bar's two ends, and what shows a bar running off its end. */
  readonly mark: string;
  readonly ends: readonly [string, string];
  readonly over: string;
  /** A frame: its corners (top left, top right, bottom left, bottom right), rounded ones (a paper page), its sides, and a rule across it (left end, line, right end). */
  readonly corners: readonly [string, string, string, string];
  readonly rounded: readonly [string, string, string, string];
  readonly across: string;
  readonly down: string;
  readonly rule: readonly [string, string, string];
};

/** The 8-bit terminal's: plain ASCII, a different character for each tone (its screen has one color). */
export const ASCII: Glyphs = {
  fill: { good: '#', warn: '=', bad: 'x', info: '~', extra: '+', empty: '.' },
  mark: '|',
  ends: ['[', ']'],
  over: '>',
  corners: ['+', '+', '+', '+'],
  rounded: ['.', '.', "'", "'"],
  across: '-',
  down: '|',
  rule: ['|', '-', '|'],
};

/** DOS's: code page 437, as MS-DOS's own tools drew: solid blocks told apart by color, a light shade where it's empty, double-line frames. */
export const CP437: Glyphs = {
  fill: { good: '█', warn: '█', bad: '█', info: '█', extra: '█', empty: '░' },
  mark: '│',
  ends: ['', ''],
  over: '►',
  corners: ['╔', '╗', '╚', '╝'],
  rounded: ['╔', '╗', '╚', '╝'],
  across: '═',
  down: '║',
  rule: ['╟', '─', '╢'],
};

/** A run of a line's characters drawn in a tone's color. */
export type Ink = { readonly from: number; readonly to: number; readonly tone: Tone };

/** A line of characters, some of them in a tone's color. */
export type Inked = { readonly text: string; readonly inks: readonly Ink[] };

/** Builds an inked line a piece at a time. */
class InkedLine {
  text = '';
  inks: Ink[] = [];

  add(text: string, tone?: Tone): this {
    if (tone && text.length > 0) {
      const last = this.inks.at(-1);
      // A run continuing the last one in the same tone joins it.
      if (last && last.tone === tone && last.to === this.text.length) this.inks[this.inks.length - 1] = { ...last, to: last.to + text.length };
      else this.inks.push({ from: this.text.length, to: this.text.length + text.length, tone });
    }
    this.text += text;
    return this;
  }

  done(): Inked {
    return { text: this.text, inks: this.inks };
  }
}

/** A bar `width` characters wide: filled for `value` out of `max`, empty for the rest. */
export function bar(value: number, max: number, width: number, glyphs: Glyphs = ASCII): string {
  const filled = max <= 0 ? 0 : Math.max(value > 0 ? 1 : 0, Math.min(width, Math.round((value / max) * width)));
  return glyphs.fill.good.repeat(filled) + glyphs.fill.empty.repeat(width - filled);
}

/**
 * Where a job's time lands against its deadline, between the bar's ends:
 * the deadline's mark two thirds of the way along, filled up to the job's
 * time (good before the deadline, bad past it). A job far past the deadline
 * runs off the end.
 */
export function deadlineBar(seconds: number, deadline: number, width: number, glyphs: Glyphs = ASCII): Inked {
  const mark = Math.round((width * 2) / 3);
  const filled = Math.min(width, Math.max(seconds > 0 ? 1 : 0, Math.round((seconds / deadline) * mark)));
  const out = new InkedLine().add(glyphs.ends[0]);
  for (let i = 0; i < width; i++) {
    if (i === mark) out.add(glyphs.mark);
    else if (i < filled) out.add(glyphs.fill.good, i < mark ? 'good' : 'bad');
    else out.add(glyphs.fill.empty);
  }
  out.add(glyphs.ends[1]);
  if (seconds / deadline > 1.5) out.add(glyphs.over, 'bad');
  return out.done();
}

/** A part of a stacked bar: its value and its tone. */
export type Segment = { readonly value: number; readonly tone: Tone };

/**
 * A bar `width` characters wide in parts, one after another: each segment
 * in its tone for its share of `max`, empty for the rest. One that runs
 * past `max` is cut off, and the bar ends in the glyphs' `over`.
 */
export function stackedBar(segments: readonly Segment[], max: number, width: number, glyphs: Glyphs = ASCII): Inked {
  const out = new InkedLine();
  let total = 0;
  let drawn = 0;
  for (const { value, tone } of segments) {
    total += value;
    const end = Math.min(width, Math.round((Math.min(total, max) / max) * width));
    out.add(glyphs.fill[tone].repeat(Math.max(0, end - drawn)), tone);
    drawn = Math.max(drawn, end);
  }
  out.add(glyphs.fill.empty.repeat(width - drawn));
  if (total > max) out.add(glyphs.over);
  return out.done();
}

/** `text` centered in `width` characters (an odd space goes on the right). */
export function center(text: string, width: number): string {
  const left = Math.max(0, Math.floor((width - text.length) / 2));
  return (' '.repeat(left) + text).padEnd(width);
}

/** `left` and `right` at the two ends of a line `width` characters wide. */
export function spread(left: string, right: string, width: number): string {
  return left + ' '.repeat(Math.max(1, width - left.length - right.length)) + right;
}

/**
 * Lines in a frame: `null` draws a rule across. Square corners like a
 * printed card, or rounded ones like a paper page (where the glyphs have them).
 */
export function frame(rows: readonly (string | null)[], round = false, glyphs: Glyphs = ASCII): string[] {
  const width = Math.max(...rows.map((row) => row?.length ?? 0));
  const [topLeft, topRight, bottomLeft, bottomRight] = round ? glyphs.rounded : glyphs.corners;
  const [ruleLeft, ruleAcross, ruleRight] = glyphs.rule;
  const across = glyphs.across.repeat(width + 2);
  return [
    `${topLeft}${across}${topRight}`,
    ...rows.map((row) => (row === null ? `${ruleLeft}${ruleAcross.repeat(width + 2)}${ruleRight}` : `${glyphs.down} ${row.padEnd(width)} ${glyphs.down}`)),
    `${bottomLeft}${across}${bottomRight}`,
  ];
}

/** A tear-off calendar page: the weekday, a rule, the date ("NOV 3"). */
export function calendarPage(weekday: string, date: string): string[] {
  const width = 11;
  return frame([center(weekday, width), null, center(date, width)], true);
}

/** A day's timecard: its date, when it started and ended, then its jobs and earnings. */
export function timecard(card: { date: string; in: string; out: string; jobs: number; late: number; earned: string }): string[] {
  const width = 27;
  return frame([
    spread('TIMECARD', card.date, width),
    spread(`IN  ${card.in}`, `OUT ${card.out}`, width),
    null,
    spread('JOBS FINISHED', String(card.jobs), width),
    spread('ON TIME', String(card.jobs - card.late), width),
    spread('LATE (HALF PAY)', String(card.late), width),
    spread('EARNED', card.earned, width),
  ]);
}

/** How a month grid's cells are laid out: their width and height in characters, and the lines above the first week. */
export const MONTH_GRID = { cellWidth: 8, cellLines: 2, headerLines: 2 } as const;

/**
 * A month as a wall calendar: the weekdays across the top (Monday first),
 * then a box per day holding its lines (null: a blank box before the 1st
 * or after the last). A screen finds a day's box from MONTH_GRID.
 */
export function monthGrid(weeks: readonly (readonly (readonly string[] | null)[])[], weekdays: readonly string[]): string[] {
  const { cellWidth, cellLines } = MONTH_GRID;
  const rule = `+${Array(7).fill('-'.repeat(cellWidth)).join('+')}+`;
  const header = ` ${weekdays.map((day) => center(day.slice(0, 3), cellWidth)).join(' ')} `;
  const lines = [header, rule];
  for (const week of weeks) {
    for (let line = 0; line < cellLines; line++) {
      lines.push(`|${week.map((cell) => (cell?.[line] ?? '').slice(0, cellWidth).padEnd(cellWidth)).join('|')}|`);
    }
    lines.push(rule);
  }
  return lines;
}

// ---- cards ----

/**
 * A card's row: a line of text (`right` at its far end), a gap, the time
 * against a deadline, a stacked bar, or a key to a bar's tones. `part` names
 * what the row is about, for TICK to point at.
 */
export type CardRow = { readonly part?: string } & (
  | { readonly kind: 'line'; readonly left: string; readonly right?: string }
  | { readonly kind: 'gap' }
  | { readonly kind: 'deadline'; readonly seconds: number; readonly deadline: number }
  | { readonly kind: 'stack'; readonly segments: readonly Segment[]; readonly total: number }
  | { readonly kind: 'legend'; readonly entries: readonly { readonly mark: Mark; readonly text: string }[] }
);

/**
 * A card any era can draw (ui/card.ts): a stamp in big letters (a verdict),
 * its rows, and the keys under it; `width` is how wide its rows are, in characters.
 */
export type Card = {
  readonly stamp?: { readonly word: string; readonly tone: Tone; readonly part?: string };
  readonly rows: readonly CardRow[];
  readonly keys?: string;
  readonly width: number;
};

/** A card's stamp in characters: its word in block letters, framed. */
export function stampLines(word: string, glyphs: Glyphs = ASCII): string[] {
  return frame(banner(word), false, glyphs);
}

/** A card's rows as lines of characters, and which lines each part covers (first and last). */
export function cardLines(card: Card, glyphs: Glyphs = ASCII): { lines: Inked[]; parts: Partial<Record<string, { first: number; last: number }>> } {
  const { width } = card;
  const lines: Inked[] = [];
  const parts: Partial<Record<string, { first: number; last: number }>> = {};
  const plain = (text: string): Inked => ({ text, inks: [] });
  // Bars sit between their ends, which DOS doesn't draw.
  const inner = width - glyphs.ends[0].length - glyphs.ends[1].length;
  for (const row of card.rows) {
    const first = lines.length;
    switch (row.kind) {
      case 'line':
        lines.push(plain(row.right === undefined ? row.left : spread(row.left, row.right, width)));
        break;
      case 'gap':
        lines.push(plain(''));
        break;
      case 'deadline':
        lines.push(deadlineBar(row.seconds, row.deadline, inner, glyphs));
        break;
      case 'stack': {
        const body = stackedBar(row.segments, row.total, inner, glyphs);
        const start = glyphs.ends[0].length;
        lines.push({ text: glyphs.ends[0] + body.text.slice(0, inner) + glyphs.ends[1] + body.text.slice(inner), inks: body.inks.map((ink) => ({ ...ink, from: ink.from + start, to: ink.to + start })) });
        break;
      }
      case 'legend': {
        // Its entries in a row, wrapped to the card's width.
        let line = new InkedLine();
        for (const { mark, text } of row.entries) {
          const entry = 2 + text.length;
          if (line.text.length > 0 && line.text.length + 3 + entry > width) {
            lines.push(line.done());
            line = new InkedLine();
          }
          if (line.text.length > 0) line.add('   ');
          line.add(glyphs.fill[mark], mark === 'empty' ? undefined : mark).add(` ${text}`);
        }
        lines.push(line.done());
        break;
      }
    }
    if (row.part) {
      const known = parts[row.part];
      parts[row.part] = { first: known?.first ?? first, last: lines.length - 1 };
    }
  }
  return { lines, parts };
}

/**
 * Inked lines as layers drawn over each other (one color each, as a
 * screen's text is): the lines with their inked runs blanked, and for each
 * tone used, only its runs. Every layer's lines are as long as the lines'.
 */
export function inkLayers(lines: readonly Inked[]): { base: string[]; tones: Partial<Record<Tone, string[]>> } {
  const base = lines.map((line) => [...line.text]);
  const tones: Partial<Record<Tone, string[][]>> = {};
  lines.forEach((line, row) => {
    for (const { from, to, tone } of line.inks) {
      const layer = (tones[tone] ??= lines.map((each) => [...' '.repeat(each.text.length)]));
      for (let i = from; i < to; i++) {
        layer[row][i] = line.text[i];
        base[row][i] = ' ';
      }
    }
  });
  const join = (layer: string[][]) => layer.map((chars) => chars.join(''));
  return { base: join(base), tones: Object.fromEntries(Object.entries(tones).map(([tone, layer]) => [tone, join(layer)])) };
}
