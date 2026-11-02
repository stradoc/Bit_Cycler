import { banner } from '../data/menuFiles.js';
export const TONES = ['good', 'warn', 'bad', 'info', 'extra'];
/** The 8-bit terminal's: plain ASCII, a different character for each tone (its screen has one color). */
export const ASCII = {
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
export const CP437 = {
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
/** Builds an inked line a piece at a time. */
class InkedLine {
    text = '';
    inks = [];
    add(text, tone) {
        if (tone && text.length > 0) {
            const last = this.inks.at(-1);
            // A run continuing the last one in the same tone joins it.
            if (last && last.tone === tone && last.to === this.text.length)
                this.inks[this.inks.length - 1] = { ...last, to: last.to + text.length };
            else
                this.inks.push({ from: this.text.length, to: this.text.length + text.length, tone });
        }
        this.text += text;
        return this;
    }
    done() {
        return { text: this.text, inks: this.inks };
    }
}
/** A bar `width` characters wide: filled for `value` out of `max`, empty for the rest. */
export function bar(value, max, width, glyphs = ASCII) {
    const filled = max <= 0 ? 0 : Math.max(value > 0 ? 1 : 0, Math.min(width, Math.round((value / max) * width)));
    return glyphs.fill.good.repeat(filled) + glyphs.fill.empty.repeat(width - filled);
}
/**
 * Where a job's time lands against its deadline, between the bar's ends:
 * the deadline's mark two thirds of the way along, filled up to the job's
 * time (good before the deadline, bad past it). A job far past the deadline
 * runs off the end.
 */
export function deadlineBar(seconds, deadline, width, glyphs = ASCII) {
    const mark = Math.round((width * 2) / 3);
    const filled = Math.min(width, Math.max(seconds > 0 ? 1 : 0, Math.round((seconds / deadline) * mark)));
    const out = new InkedLine().add(glyphs.ends[0]);
    for (let i = 0; i < width; i++) {
        if (i === mark)
            out.add(glyphs.mark);
        else if (i < filled)
            out.add(glyphs.fill.good, i < mark ? 'good' : 'bad');
        else
            out.add(glyphs.fill.empty);
    }
    out.add(glyphs.ends[1]);
    if (seconds / deadline > 1.5)
        out.add(glyphs.over, 'bad');
    return out.done();
}
/**
 * A bar `width` characters wide in parts, one after another: each segment
 * in its tone for its share of `max`, empty for the rest. One that runs
 * past `max` is cut off, and the bar ends in the glyphs' `over`.
 */
export function stackedBar(segments, max, width, glyphs = ASCII) {
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
    if (total > max)
        out.add(glyphs.over);
    return out.done();
}
/** `text` centered in `width` characters (an odd space goes on the right). */
export function center(text, width) {
    const left = Math.max(0, Math.floor((width - text.length) / 2));
    return (' '.repeat(left) + text).padEnd(width);
}
/** `left` and `right` at the two ends of a line `width` characters wide. */
export function spread(left, right, width) {
    return left + ' '.repeat(Math.max(1, width - left.length - right.length)) + right;
}
/**
 * Lines in a frame: `null` draws a rule across. Square corners like a
 * printed card, or rounded ones like a paper page (where the glyphs have them).
 */
export function frame(rows, round = false, glyphs = ASCII) {
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
export function calendarPage(weekday, date) {
    const width = 11;
    return frame([center(weekday, width), null, center(date, width)], true);
}
/** A day's timecard: its date, when it started and ended, then its jobs and earnings. */
export function timecard(card) {
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
export const MONTH_GRID = { cellWidth: 8, cellLines: 2, headerLines: 2 };
/**
 * A month as a wall calendar: the weekdays across the top (Monday first),
 * then a box per day holding its lines (null: a blank box before the 1st
 * or after the last). A screen finds a day's box from MONTH_GRID.
 */
export function monthGrid(weeks, weekdays) {
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
/** A card's stamp in characters: its word in block letters, framed. */
export function stampLines(word, glyphs = ASCII) {
    return frame(banner(word), false, glyphs);
}
/** A card's rows as lines of characters, and which lines each part covers (first and last). */
export function cardLines(card, glyphs = ASCII) {
    const { width } = card;
    const lines = [];
    const parts = {};
    const plain = (text) => ({ text, inks: [] });
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
                    if (line.text.length > 0)
                        line.add('   ');
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
export function inkLayers(lines) {
    const base = lines.map((line) => [...line.text]);
    const tones = {};
    lines.forEach((line, row) => {
        for (const { from, to, tone } of line.inks) {
            const layer = (tones[tone] ??= lines.map((each) => [...' '.repeat(each.text.length)]));
            for (let i = from; i < to; i++) {
                layer[row][i] = line.text[i];
                base[row][i] = ' ';
            }
        }
    });
    const join = (layer) => layer.map((chars) => chars.join(''));
    return { base: join(base), tones: Object.fromEntries(Object.entries(tones).map(([tone, layer]) => [tone, join(layer)])) };
}
//# sourceMappingURL=asciiChart.js.map