// TICK, the guide, as data. A pose says what his eyes, mouth, arms and feet
// are doing; poseAt works it out from what he's doing (talking, walking,
// where he looks, his mood) and the time (blinking, his mouth as he talks,
// his feet as he walks). Each era draws the same poses its own way, as the
// computers of its time drew characters (TICK_LOOKS; the era names its look
// in ui/eras.ts): the 8-bit era in plain characters, DOS in the PC's own
// characters (boxes, blocks, bullets), the 90s desktop as a 16-color pixel
// sprite, the modern era in smooth vector shapes. visual/tickFigure.ts draws
// them; everything here is pure, so the tests check it in Node.
export const EYES = ['ahead', 'left', 'right', 'blink', 'happy', 'worried'];
export const MOUTHS = ['shut', 'open', 'wide', 'mid', 'smile', 'frown'];
export const ARMS = ['down', 'up'];
export const FEET = ['stand', 'left', 'right'];
/** Every pose he can take: every eyes, mouth, arms and feet together. */
export const POSES = EYES.flatMap((eyes) => MOUTHS.flatMap((mouth) => ARMS.flatMap((arms) => FEET.map((feet) => ({ eyes, mouth, arms, feet })))));
/** Standing still, looking ahead, mouth shut. */
export const AT_REST = { eyes: 'ahead', mouth: 'shut', arms: 'down', feet: 'stand' };
/** A name for a pose, the same for the same pose (so a drawing redraws only when it changes). */
export function poseKey(pose) {
    return `${pose.eyes}/${pose.mouth}/${pose.arms}/${pose.feet}`;
}
/** His timing (ms): how fast his words type out, when he blinks, his mouth as he talks, his feet as he walks. */
export const TICK = {
    charsPerSecond: 60,
    blink: { every: 3600, for: 130 },
    talk: { mouths: ['open', 'shut', 'wide', 'mid'], each: 90 },
    walk: { feet: ['left', 'stand', 'right', 'stand'], each: 110 },
};
const LOOKS = ['left', 'ahead', 'right'];
/** His pose `now`, from what he's doing. */
export function poseAt(doing, now) {
    const blinking = now % TICK.blink.every < TICK.blink.for;
    const happy = doing.mood === 'happy' || doing.mood === 'cheer';
    const eyes = blinking ? 'blink' : happy ? 'happy' : doing.mood === 'worried' ? 'worried' : LOOKS[doing.look + 1];
    const talk = TICK.talk.mouths;
    const mouth = doing.talking ? talk[Math.floor(now / TICK.talk.each) % talk.length] : happy ? 'smile' : doing.mood === 'worried' ? 'frown' : 'shut';
    const steps = TICK.walk.feet;
    const feet = doing.walking ? steps[Math.floor(now / TICK.walk.each) % steps.length] : 'stand';
    return { eyes, mouth, arms: doing.mood === 'cheer' ? 'up' : 'down', feet };
}
/** The 8-bit era's TICK: plain characters, as a terminal of the late 70s could show. */
export const ASCII_TICK = {
    lines: ['  .-^-.  ', ' [{eyes}] ', '  | {mouth} |  ', ' {left}|___|{right} ', '{feet}'],
    eyes: { ahead: ' o o ', left: 'o o  ', right: '  o o', blink: ' - - ', happy: ' ^ ^ ', worried: ' o O ' },
    mouth: { shut: '-', open: 'o', wide: 'O', mid: '=', smile: 'u', frown: 'n' },
    arms: { down: ['/', '\\'], up: ['\\', '/'] },
    feet: { stand: '  _| |_  ', left: '   | |_  ', right: '  _| |   ' },
};
/** DOS's TICK: the IBM PC's own characters, its box lines, blocks and bullets (code page 437). */
export const CP437_TICK = {
    lines: ['  ┌─┴─┐  ', ' ╞{eyes}╡ ', '  │ {mouth} │  ', ' {left}╞═══╡{right} ', '{feet}'],
    accent: ['eyes'],
    eyes: { ahead: ' • • ', left: '• •  ', right: '  • •', blink: ' ─ ─ ', happy: ' ^ ^ ', worried: ' ° ° ' },
    mouth: { shut: '─', open: 'o', wide: 'O', mid: '═', smile: 'u', frown: '∩' },
    arms: { down: ['/', '\\'], up: ['\\', '/'] },
    feet: { stand: '  ▄█ █▄  ', left: '   █ █▄  ', right: '  ▄█ █   ' },
};
/**
 * A pose in a character sheet: its lines, with its slots filled. `shows`
 * says which pieces to draw (a slot, or undefined for the sheet's own
 * characters); the rest become spaces, so layers drawn over each other line up.
 */
function filled(sheet, pose, shows) {
    const [left, right] = sheet.arms[pose.arms];
    const fill = { eyes: sheet.eyes[pose.eyes], mouth: sheet.mouth[pose.mouth], left, right, feet: sheet.feet[pose.feet] };
    return sheet.lines.map((line) => line
        .split(/(\{\w+\})/)
        .map((piece) => {
        const slot = /^\{(\w+)\}$/.exec(piece)?.[1];
        const text = slot ? fill[slot] : piece;
        return shows(slot) ? text : ' '.repeat(text.length);
    })
        .join(''));
}
/** A pose in a character sheet: its lines, slots filled. */
export function characterFrame(sheet, pose) {
    return filled(sheet, pose, () => true);
}
/** A pose in two layers drawn over each other: the sheet's ink, and its accent slots alone. */
export function characterLayers(sheet, pose) {
    const accent = new Set(sheet.accent ?? []);
    return {
        ink: filled(sheet, pose, (slot) => slot === undefined || !accent.has(slot)),
        accent: filled(sheet, pose, (slot) => slot !== undefined && accent.has(slot)),
    };
}
/**
 * The 90s desktop's TICK: a 26 x 32 sprite in the 16 VGA colors (drawn at 3x),
 * beveled like a Windows 95 button, light from the top left; a navy visor
 * with cyan eyes, a red antenna bulb, and a chest panel of status lights.
 */
export const PIXEL_TICK = {
    palette: { k: 0x000000, w: 0xffffff, l: 0xc0c0c0, g: 0x808080, n: 0x000080, c: 0x00ffff, r: 0xff0000, m: 0x800000, y: 0xffff00, e: 0x008000 },
    base: [
        '............kk............',
        '...........krrk...........',
        '...........kryk...........',
        '............kk............',
        '............kk............',
        '............kk............',
        '.....kkkkkkkkkkkkkkkk.....',
        '.....kwwwwwwwwwwwwwgk.....',
        '.....kwllllllllllllgk.....',
        '.....kwllllllllllllgk.....',
        '...kkkwllllllllllllgkkk...',
        '...kgkwllllllllllllgkgk...',
        '...kgkwllllllllllllgkgk...',
        '...kkkwllllllllllllgkkk...',
        '.....kwllllllllllllgk.....',
        '.....kwllllllllllllgk.....',
        '.....kggggggggggggggk.....',
        '.....kkkkkkkkkkkkkkkk.....',
        '...........kggk...........',
        '.......kkkkkkkkkkkk.......',
        '.......kwwwwwwwwwgk.......',
        '.......kwlkkkkkklgk.......',
        '.......kwlkrnyeklgk.......',
        '.......kwlkkkkkklgk.......',
        '.......kwllllllllgk.......',
        '.......kggggggggggk.......',
        '.......kkkkkkkkkkkk.......',
        '..........................',
        '..........................',
        '..........................',
        '..........................',
        '..........................',
    ],
    eyes: {
        at: [8, 9],
        rows: {
            ahead: ['kkkkkkkkkk', 'knccnnccnk', 'knccnnccnk', 'kkkkkkkkkk'],
            left: ['kkkkkkkkkk', 'kccnnccnnk', 'kccnnccnnk', 'kkkkkkkkkk'],
            right: ['kkkkkkkkkk', 'knnccnncck', 'knnccnncck', 'kkkkkkkkkk'],
            blink: ['kkkkkkkkkk', 'knnnnnnnnk', 'knccnnccnk', 'kkkkkkkkkk'],
            happy: ['kkkkkkkkkk', 'kncnnnncnk', 'kcncnncnck', 'kkkkkkkkkk'],
            worried: ['kkkkkkkkkk', 'kncnnnncnk', 'knccnnccnk', 'kkkkkkkkkk'],
        },
    },
    mouth: {
        at: [10, 14],
        rows: {
            shut: ['......', '.kkkk.'],
            open: ['..kk..', '..kk..'],
            wide: ['.kkkk.', '.kmmk.'],
            mid: ['.kkkk.', '......'],
            smile: ['.k..k.', '..kk..'],
            frown: ['..kk..', '.k..k.'],
        },
    },
    arms: {
        at: [0, 12],
        rightArm: 19,
        rows: {
            down: ['.......', '.......', '.......', '.......', '.......', '.......', '.......', '....kkk', '...klgk', '...klgk', '...klgk', '...klgk', '...kkk.'],
            up: ['.......', 'kk.....', 'kgk....', 'kgk....', '.kgk...', '.kgk...', '..kgk..', '...kgkk', '.......', '.......', '.......', '.......', '.......'],
        },
    },
    feet: {
        at: [6, 27],
        rows: {
            stand: ['...kgk..kgk...', '...kgk..kgk...', '...kgk..kgk...', '.kkkkk..kkkkk.', '.kggkk..kkggk.'],
            left: ['...kgk..kgk...', '..kkkkk.kgk...', '..kggkk.kgk...', '........kkkkk.', '........kkggk.'],
            right: ['...kgk..kgk...', '...kgk.kkkkk..', '...kgk.kkggk..', '.kkkkk........', '.kggkk........'],
        },
    },
};
/** A pose in a pixel sheet: its rows of letters, the parts drawn over the base. */
export function pixelFrame(sheet, pose) {
    const grid = sheet.base.map((row) => [...row]);
    const put = (rows, [x0, y0], mirror = false) => {
        rows.forEach((row, y) => {
            [...(mirror ? [...row].reverse().join('') : row)].forEach((letter, x) => {
                if (letter !== '.')
                    grid[y0 + y][x0 + x] = letter;
            });
        });
    };
    put(sheet.eyes.rows[pose.eyes], sheet.eyes.at);
    put(sheet.mouth.rows[pose.mouth], sheet.mouth.at);
    put(sheet.arms.rows[pose.arms], sheet.arms.at);
    put(sheet.arms.rows[pose.arms], [sheet.arms.rightArm, sheet.arms.at[1]], true);
    put(sheet.feet.rows[pose.feet], sheet.feet.at);
    return grid.map((row) => row.join(''));
}
const MOUTH_OPEN = { shut: 0, open: 0.6, wide: 1, mid: 0.3, smile: 0, frown: 0 };
const MOUTH_CURVE = { shut: 0, open: 0, wide: 0, mid: 0, smile: 1, frown: -1 };
export function vectorPose(pose) {
    const { eyes } = pose;
    return {
        look: eyes === 'left' ? -1 : eyes === 'right' ? 1 : 0,
        eyesOpen: eyes === 'blink' ? 0.1 : 1,
        eyeShape: eyes === 'happy' ? 'happy' : eyes === 'worried' ? 'worried' : 'round',
        mouthOpen: MOUTH_OPEN[pose.mouth],
        mouthCurve: MOUTH_CURVE[pose.mouth],
        armsUp: pose.arms === 'up' ? 1 : 0,
        leftFoot: pose.feet === 'left' ? 1 : 0,
        rightFoot: pose.feet === 'right' ? 1 : 0,
    };
}
// ---- the looks ----
/** Every look, by name: how each era draws him (an era names its look: ui/eras.ts `tick`). */
export const TICK_LOOKS = {
    ascii: { kind: 'characters', sheet: ASCII_TICK },
    cp437: { kind: 'characters', sheet: CP437_TICK },
    pixels: { kind: 'pixels', sheet: PIXEL_TICK, scale: 3 },
    vector: { kind: 'vector' },
};
//# sourceMappingURL=tick.js.map