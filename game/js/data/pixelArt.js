// Pixel art for the 90s desktop, as data: one letter a pixel ('.' clear),
// each letter one of the 16 VGA colors. TICK's sprite (data/tick.ts) and the
// message-box icons the results card stamps with (ui/card.ts) are drawn from
// these by visual/pixels.ts.
/** The 16 VGA colors, by letter. */
export const VGA = {
    k: 0x000000, // black
    m: 0x800000, // maroon
    e: 0x008000, // green
    o: 0x808000, // olive
    n: 0x000080, // navy
    p: 0x800080, // purple
    t: 0x008080, // teal
    l: 0xc0c0c0, // silver (light gray)
    g: 0x808080, // gray
    r: 0xff0000, // red
    a: 0x00ff00, // lime
    y: 0xffff00, // yellow
    b: 0x0000ff, // blue
    f: 0xff00ff, // fuchsia
    c: 0x00ffff, // aqua (cyan)
    w: 0xffffff, // white
};
/**
 * 16 x 16 icons in the style of the period's message boxes (drawn at 2x): a
 * white check in a green circle, a warning triangle with "!", and an "i" for
 * information.
 */
export const ICONS = {
    check: [
        '.....kkkkkk.....',
        '...kkeeeeeekk...',
        '..keeeeeeeeeek..',
        '.keeeeeeeeeeeek.',
        '.keeeeeeeeewwek.',
        'keeeeeeeeewweeek',
        'keeeeeeeewweeeek',
        'keewweeewweeeeek',
        'keeewwewweeeeeek',
        'keeeewwweeeeeeek',
        'keeeeeweeeeeeeek',
        '.keeeeeeeeeeeek.',
        '.keeeeeeeeeeeek.',
        '..keeeeeeeeeek..',
        '...kkeeeeeekk...',
        '.....kkkkkk.....',
    ],
    warning: [
        '.......kk.......',
        '......kyyk......',
        '......kyyk......',
        '.....kyyyyk.....',
        '.....kyyyyk.....',
        '....kyyyyyyk....',
        '....kyykkyyk....',
        '...kyyykkyyyk...',
        '...kyyykkyyyk...',
        '..kyyyykkyyyyk..',
        '..kyyyykkyyyyk..',
        '.kyyyyyyyyyyyyk.',
        '.kyyyyykkyyyyyk.',
        'kyyyyyykkyyyyyyk',
        'kyyyyyyyyyyyyyyk',
        'kkkkkkkkkkkkkkkk',
    ],
    info: [
        '.....kkkkkk.....',
        '...kkbbbbbbkk...',
        '..kbbbbbbbbbbk..',
        '.kbbbbbwwbbbbbk.',
        '.kbbbbbwwbbbbbk.',
        'kbbbbbbbbbbbbbbk',
        'kbbbbbwwwbbbbbbk',
        'kbbbbbbwwbbbbbbk',
        'kbbbbbbwwbbbbbbk',
        'kbbbbbbwwbbbbbbk',
        'kbbbbbbwwbbbbbbk',
        '.kbbbbbwwbbbbbk.',
        '.kbbbbwwwwbbbbk.',
        '..kbbbbbbbbbbk..',
        '...kkbbbbbbkk...',
        '.....kkkkkk.....',
    ],
};
//# sourceMappingURL=pixelArt.js.map