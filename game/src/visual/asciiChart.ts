// Drawings in plain characters, so every era's monospace font draws them:
// bars for the results and the job sheet, framed boxes, and the calendar's
// page and timecard (the board). Each returns text; screens only place it.

/** A bar `width` characters wide: '#' for `value` out of `max`, '.' for the rest. */
export function bar(value: number, max: number, width: number): string {
  const filled = max <= 0 ? 0 : Math.max(value > 0 ? 1 : 0, Math.min(width, Math.round((value / max) * width)));
  return '#'.repeat(filled) + '.'.repeat(width - filled);
}

/**
 * Where a job's time lands against its deadline: '|' marks the deadline,
 * two thirds of the way along; '#' fills up to the job's time. A job far past
 * the deadline runs off the end ('>').
 */
export function deadlineBar(seconds: number, deadline: number, width: number): string {
  const mark = Math.round((width * 2) / 3);
  const filled = Math.min(width, Math.max(seconds > 0 ? 1 : 0, Math.round((seconds / deadline) * mark)));
  let out = '';
  for (let i = 0; i < width; i++) out += i === mark ? '|' : i < filled ? '#' : '.';
  return `[${out}]${seconds / deadline > 1.5 ? '>' : ''}`;
}

/**
 * A bar `width` characters wide in parts, one after another: each segment
 * drawn in its own character for its share of `max`, '.' for the rest. One
 * that runs past `max` is cut off, and the bar ends in '>'.
 */
export function stackedBar(segments: readonly { readonly value: number; readonly char: string }[], max: number, width: number): string {
  let out = '';
  let total = 0;
  for (const { value, char } of segments) {
    total += value;
    const end = Math.min(width, Math.round((Math.min(total, max) / max) * width));
    out += char.repeat(Math.max(0, end - out.length));
  }
  return out.padEnd(width, '.') + (total > max ? '>' : '');
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
 * Lines in a frame: `null` draws a rule across. Square corners (+) like a
 * printed card, or round ones (. and ') like a paper page.
 */
export function frame(rows: readonly (string | null)[], round = false): string[] {
  const width = Math.max(...rows.map((row) => row?.length ?? 0));
  const [top, bottom] = round ? ['.', "'"] : ['+', '+'];
  const edge = (corner: string) => `${corner}${'-'.repeat(width + 2)}${corner}`;
  return [edge(top), ...rows.map((row) => (row === null ? `|${'-'.repeat(width + 2)}|` : `| ${row.padEnd(width)} |`)), edge(bottom)];
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
