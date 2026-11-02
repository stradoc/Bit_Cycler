// Draws pixel art (data/pixelArt.ts: one letter a pixel, '.' clear) into a
// Graphics, each pixel a `scale`-sized square: one rectangle per run of a
// color along a row, so a sprite is a few dozen rectangles. TICK's 90s
// sprite and the results card's icons are drawn this way.
/** Draws `rows` with their top-left corner at (x, y). */
export function drawPixels(g, rows, palette, x, y, scale) {
    rows.forEach((row, py) => {
        for (let px = 0; px < row.length;) {
            let end = px + 1;
            while (end < row.length && row[end] === row[px])
                end++;
            if (row[px] !== '.')
                g.fillStyle(palette[row[px]], 1).fillRect(x + px * scale, y + py * scale, (end - px) * scale, scale);
            px = end;
        }
    });
    return g;
}
//# sourceMappingURL=pixels.js.map