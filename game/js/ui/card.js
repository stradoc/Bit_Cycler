import { ICONS, VGA } from '../data/pixelArt.js';
import { ASCII, CP437, cardLines, inkLayers, stampLines } from '../visual/asciiChart.js';
import { drawPixels } from '../visual/pixels.js';
import { cssColor, palette } from './eras.js';
import { TEXT } from './theme.js';
import { bevel, Box, eraText } from './widgets.js';
/** Text sizes on a card: its rows, and its keys. */
const SIZE = TEXT.body;
const KEYS_SIZE = TEXT.small;
/** Room inside the frame: at the sides, above and below; and between the stamp, the rows and the keys. */
const SIDE = 28;
const END = 24;
const GAP = 18;
/** How tall a graphic card's rows are: a line of text, a gap, a bar, a line of its key; and a key's swatch. */
const LINE_H = 22;
const GAP_H = 10;
const BAR_H = 26;
const LEGEND_H = 22;
const SWATCH = 11;
/** Draws `card` centered on `at`. */
export function drawCard(scene, era, card, at) {
    const kit = KITS[era.kind];
    return 'glyphs' in kit ? textCard(scene, era, card, at, kit.glyphs) : graphicCard(scene, era, card, at, kit.painter);
}
/** Where each part is: its rows' lines across the card (and the stamp, for its part), a little room around them. */
function areasOf(card, spans, stamp, left, width) {
    const all = { ...spans };
    const part = card.stamp?.part;
    if (part && stamp)
        all[part] = { top: Math.min(stamp.top, all[part]?.top ?? Infinity), bottom: Math.max(stamp.bottom, all[part]?.bottom ?? -Infinity) };
    const areas = {};
    for (const [name, span] of Object.entries(all))
        if (span)
            areas[name] = { x: left + 10, y: span.top - 4, w: width - 20, h: span.bottom - span.top + 8 };
    return areas;
}
// ---- in characters: the 8-bit terminal and DOS ----
function textCard(scene, era, card, at, glyphs) {
    const text = (content, size) => eraText(scene, era, 0, 0, content, size).setOrigin(0.5);
    // The stamp closes up (no line spacing) so the block letters' half blocks join.
    const stamp = card.stamp ? text(stampLines(card.stamp.word, glyphs).join('\n'), SIZE).setLineSpacing(0).setColor(cssColor(era.tones[card.stamp.tone])) : undefined;
    // The rows: the text, and each tone's characters over it in its color.
    const { lines, parts } = cardLines(card, glyphs);
    const { base, tones } = inkLayers(lines);
    const layer = (rows, color) => text(rows.join('\n'), SIZE).setAlign('left').setLineSpacing(5).setColor(cssColor(color));
    const body = layer(base, era.fg);
    const inks = Object.entries(tones).map(([tone, rows]) => layer(rows, era.tones[tone]));
    const keys = card.keys ? text(card.keys, KEYS_SIZE).setAlpha(0.7) : undefined;
    const width = Math.max(stamp?.width ?? 0, body.width, keys?.width ?? 0) + 2 * SIDE;
    const height = 2 * END + (stamp ? stamp.height + GAP : 0) + body.height + (keys ? GAP + keys.height : 0);
    let y = at.y - height / 2 + END;
    const stampSpan = stamp ? { top: y - 10, bottom: y + stamp.height } : undefined;
    if (stamp) {
        stamp.setPosition(at.x, y + stamp.height / 2);
        y += stamp.height + GAP;
    }
    const bodyTop = y;
    for (const each of [body, ...inks])
        each.setPosition(at.x, bodyTop + body.height / 2);
    keys?.setPosition(at.x, bodyTop + body.height + GAP + keys.height / 2);
    const box = new Box(scene, era, at.x, at.y, width, height);
    const lineH = body.height / Math.max(1, lines.length);
    const spans = Object.fromEntries(Object.entries(parts).map(([name, range]) => [name, range && { top: bodyTop + range.first * lineH, bottom: bodyTop + (range.last + 1) * lineH }]));
    const view = scene.add.container(0, 0, [...box.parts, ...(stamp ? [stamp] : []), body, ...inks, ...(keys ? [keys] : [])]);
    return { view, areas: areasOf(card, spans, stampSpan, at.x - width / 2, width) };
}
function graphicCard(scene, era, card, at, painter) {
    // As wide as the card's rows would be in characters.
    const probe = eraText(scene, era, 0, 0, '0'.repeat(20), SIZE);
    const inner = Math.round((probe.width / 20) * card.width);
    probe.destroy();
    // The rows, top to bottom, in their own container from (0, 0), placed once the card's size is known.
    const g = scene.add.graphics();
    const rows = scene.add.container(0, 0, [g]);
    const spans = {};
    let y = 0;
    for (const row of card.rows) {
        const h = paintRow(scene, era, painter, g, rows, row, y, inner);
        if (row.part)
            spans[row.part] = { top: spans[row.part]?.top ?? y, bottom: y + h };
        y += h;
    }
    const rowsH = y;
    const stamp = card.stamp ? painter.stamp(scene, era, card.stamp) : undefined;
    const keys = card.keys ? eraText(scene, era, 0, 0, card.keys, KEYS_SIZE).setOrigin(0.5).setAlpha(0.7) : undefined;
    const width = Math.max(inner, stamp?.width ?? 0, keys?.width ?? 0) + 2 * SIDE;
    const height = 2 * END + (stamp ? stamp.height + GAP : 0) + rowsH + (keys ? GAP + keys.height : 0);
    let cursor = at.y - height / 2 + END;
    const stampSpan = stamp ? { top: cursor - 10, bottom: cursor + stamp.height } : undefined;
    if (stamp) {
        stamp.view.setPosition(at.x, cursor + stamp.height / 2);
        cursor += stamp.height + GAP;
    }
    const rowsTop = cursor;
    rows.setPosition(at.x - inner / 2, rowsTop);
    keys?.setPosition(at.x, rowsTop + rowsH + GAP + keys.height / 2);
    const box = new Box(scene, era, at.x, at.y, width, height);
    const placed = Object.fromEntries(Object.entries(spans).map(([name, span]) => [name, span && { top: rowsTop + span.top, bottom: rowsTop + span.bottom }]));
    const view = scene.add.container(0, 0, [...box.parts, ...(stamp ? [stamp.view] : []), rows, ...(keys ? [keys] : [])]);
    return { view, areas: areasOf(card, placed, stampSpan, at.x - width / 2, width) };
}
/** Draws one row at y, across w; returns its height. */
function paintRow(scene, era, painter, g, into, row, y, w) {
    const label = (x, top, content, originX = 0) => {
        const text = eraText(scene, era, x, top, content, SIZE).setOrigin(originX, 0);
        into.add(text);
        return text;
    };
    switch (row.kind) {
        case 'line':
            label(0, y + 3, row.left);
            if (row.right !== undefined)
                label(w, y + 3, row.right, 1);
            return LINE_H;
        case 'gap':
            return GAP_H;
        case 'deadline':
            return painter.deadline(g, era, y, w, row.seconds, row.deadline);
        case 'stack':
            return painter.stack(g, era, y, w, row.segments, row.total);
        case 'legend': {
            // Swatch and words for each entry, in a row, wrapped to the card's width.
            let [x, line] = [0, 0];
            for (const { mark, text } of row.entries) {
                const words = label(0, 0, text);
                const entryW = SWATCH + 6 + words.width;
                if (x > 0 && x + entryW > w)
                    [x, line] = [0, line + 1];
                const top = y + line * LEGEND_H;
                painter.swatch(g, era, x, top + LEGEND_H / 2, mark);
                words.setPosition(x + SWATCH + 6, top + (LEGEND_H - words.height) / 2);
                x += entryW + 20;
            }
            return (line + 1) * LEGEND_H;
        }
    }
}
/** Where a stacked bar's segments run, across w: each segment's start and end (cut off at `total`). */
function segmentsAcross(segments, total, w) {
    let sum = 0;
    let at = 0;
    return segments.flatMap(({ value, tone }) => {
        sum += value;
        const to = Math.min(w, (Math.min(sum, total) / Math.max(1, total)) * w);
        const piece = { from: at, to, tone };
        at = Math.max(at, to);
        return piece.to - piece.from > 0 ? [piece] : [];
    });
}
// ---- the 90s desktop: a Windows 98 dialog ----
/** The message-box icon each tone stamps with. */
const STAMP_ICONS = { good: 'check', warn: 'warning', bad: 'warning', info: 'info', extra: 'info' };
/** A progress bar's blocks, and the space between them. */
const BLOCK = 7;
const BLOCK_GAP = 2;
/** A sunken white field, as text boxes and progress bars sat in. */
function sunken(g, era, x, y, w, h) {
    bevel(g.fillStyle(palette(era).field, 1).fillRect(x, y, w, h), era, x, y, w, h, false);
}
const CLASSIC = {
    stamp(scene, era, { word, tone }) {
        const scale = 2;
        const icon = 16 * scale;
        const label = eraText(scene, era, 0, 0, word, 26).setOrigin(0, 0.5);
        const width = icon + 12 + label.width;
        const g = drawPixels(scene.add.graphics(), ICONS[STAMP_ICONS[tone]], VGA, -width / 2, -icon / 2, scale);
        label.setX(-width / 2 + icon + 12);
        return { view: scene.add.container(0, 0, [g, label]), width, height: icon };
    },
    deadline(g, era, y, w, seconds, deadline) {
        const field = { y: y + 5, h: 18 };
        sunken(g, era, 0, field.y, w, field.h);
        const [left, top, inside, high] = [3, field.y + 3, w - 6, field.h - 6];
        const mark = left + (inside * 2) / 3;
        const filled = seconds > 0 ? left + Math.min(inside, (seconds / deadline) * (inside * 2) / 3) : left;
        // Whole blocks, as its progress bars drew: in the good tone (navy) up to the deadline, the bad tone past it.
        for (let x = left; x < filled && x + BLOCK <= left + inside; x += BLOCK + BLOCK_GAP)
            g.fillStyle(era.tones[x < mark ? 'good' : 'bad'], 1).fillRect(x, top, BLOCK, high);
        g.fillStyle(era.fg, 1).fillRect(Math.round(mark) - 1, field.y - 4, 2, field.h + 8);
        return BAR_H;
    },
    stack(g, era, y, w, segments, total) {
        const field = { y: y + 5, h: 18 };
        sunken(g, era, 0, field.y, w, field.h);
        const [left, top, inside, high] = [2, field.y + 2, w - 4, field.h - 4];
        const pieces = segmentsAcross(segments, total, inside);
        for (const { from, to, tone } of pieces)
            g.fillStyle(era.tones[tone], 1).fillRect(left + from, top, to - from, high);
        // A dark line between parts, as the period's charts drew them.
        for (const { to } of pieces)
            if (to < inside)
                g.fillStyle(era.fg, 1).fillRect(left + to, top, 1, high);
        return BAR_H;
    },
    swatch(g, era, x, cy, mark) {
        const top = Math.round(cy - SWATCH / 2);
        g.fillStyle(mark === 'empty' ? palette(era).field : era.tones[mark], 1).fillRect(x, top, SWATCH, SWATCH);
        g.lineStyle(1, era.fg, 1).strokeRect(x + 0.5, top + 0.5, SWATCH - 1, SWATCH - 1);
    },
};
// ---- the modern era: flat and rounded ----
/** A rounded bar from x across w, its ends rounded only where asked (one bar in several parts). */
function pill(g, x, y, w, h, ends) {
    if (w <= 0)
        return;
    const r = Math.min(h / 2, w / 2);
    g.fillRoundedRect(x, y, w, h, { tl: ends.left ? r : 0, bl: ends.left ? r : 0, tr: ends.right ? r : 0, br: ends.right ? r : 0 });
}
/** The sign inside the pill's dot: a check, a "!", or an "i". */
function sign(g, tone, cx, cy, color) {
    if (tone === 'good') {
        g.lineStyle(2.5, color, 1).strokePoints([{ x: cx - 4.5, y: cy + 0.5 }, { x: cx - 1.5, y: cy + 3.5 }, { x: cx + 4.5, y: cy - 3.5 }]);
    }
    else if (tone === 'warn' || tone === 'bad') {
        g.fillStyle(color, 1).fillRoundedRect(cx - 1.25, cy - 6, 2.5, 7.5, 1.2).fillCircle(cx, cy + 4.5, 1.5);
    }
    else {
        g.fillStyle(color, 1).fillCircle(cx, cy - 4.5, 1.5).fillRoundedRect(cx - 1.25, cy - 1.5, 2.5, 7.5, 1.2);
    }
}
const FLAT = {
    stamp(scene, era, { word, tone }) {
        const color = era.tones[tone];
        const [h, dot, pad] = [38, 10, 14];
        const label = eraText(scene, era, 0, 0, word, 18).setColor(cssColor(color)).setOrigin(0, 0.5);
        const width = pad + 2 * dot + 10 + label.width + pad + 4;
        const g = scene.add.graphics();
        g.fillStyle(color, 0.12).fillRoundedRect(-width / 2, -h / 2, width, h, h / 2);
        g.lineStyle(1.5, color, 0.55).strokeRoundedRect(-width / 2, -h / 2, width, h, h / 2);
        const cx = -width / 2 + pad + dot;
        g.fillStyle(color, 1).fillCircle(cx, 0, dot);
        sign(g, tone, cx, 0, era.bg);
        label.setX(cx + dot + 10);
        return { view: scene.add.container(0, 0, [g, label]), width, height: h };
    },
    deadline(g, era, y, w, seconds, deadline) {
        const [top, h] = [y + 9, 8];
        g.fillStyle(era.dim, 1);
        pill(g, 0, top, w, h, { left: true, right: true });
        const mark = (w * 2) / 3;
        const filled = seconds > 0 ? Math.max(h, Math.min(w, (seconds / deadline) * mark)) : 0;
        const late = filled > mark;
        g.fillStyle(era.tones.good, 1);
        pill(g, 0, top, Math.min(filled, mark), h, { left: true, right: !late });
        if (late) {
            g.fillStyle(era.tones.bad, 1);
            pill(g, mark, top, filled - mark, h, { left: false, right: true });
        }
        g.fillStyle(era.fg, 0.9).fillRoundedRect(mark - 1, top - 6, 2, h + 12, 1);
        return BAR_H;
    },
    stack(g, era, y, w, segments, total) {
        const [top, h] = [y + 8, 10];
        g.fillStyle(era.dim, 1);
        pill(g, 0, top, w, h, { left: true, right: true });
        // Flush parts with a thin gap between them, the bar's ends rounded.
        for (const { from, to, tone } of segmentsAcross(segments, total, w)) {
            const [x0, x1] = [from + (from > 0 ? 1 : 0), to - (to < w ? 1 : 0)];
            g.fillStyle(era.tones[tone], 1);
            pill(g, x0, top, x1 - x0, h, { left: from <= 0, right: to >= w });
        }
        return BAR_H;
    },
    swatch(g, era, x, cy, mark) {
        g.fillStyle(mark === 'empty' ? era.dim : era.tones[mark], 1).fillCircle(x + SWATCH / 2, cy, SWATCH / 2 - 0.5);
    },
};
/** How each kind of era draws cards. */
const KITS = {
    terminal: { glyphs: ASCII },
    dos: { glyphs: CP437 },
    desktop: { painter: CLASSIC },
    modern: { painter: FLAT },
};
//# sourceMappingURL=card.js.map