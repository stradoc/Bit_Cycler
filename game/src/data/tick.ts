import { VGA } from './pixelArt.ts';

// TICK, the guide, as data. A pose says what his eyes, mouth, arms and feet
// are doing; poseAt works it out from what he's doing (talking, walking,
// where he looks, his mood) and the time (blinking, his mouth as he talks,
// his feet as he walks). Each era draws the same poses its own way, as the
// computers of its time drew characters (TICK_LOOKS; the era names its look
// in ui/eras.ts): the 8-bit era in plain characters, DOS in the PC's own
// characters (boxes, blocks, bullets), the 90s desktop as a 16-color pixel
// sprite, the modern era in smooth vector shapes. visual/tickFigure.ts draws
// them; everything here is pure, so the tests check it in Node.

export type Eyes = 'ahead' | 'left' | 'right' | 'blink' | 'happy' | 'worried';
export type Mouth = 'shut' | 'open' | 'wide' | 'mid' | 'smile' | 'frown';
export type Arms = 'down' | 'up';
export type Feet = 'stand' | 'left' | 'right';
export type Pose = { readonly eyes: Eyes; readonly mouth: Mouth; readonly arms: Arms; readonly feet: Feet };

export const EYES: readonly Eyes[] = ['ahead', 'left', 'right', 'blink', 'happy', 'worried'];
export const MOUTHS: readonly Mouth[] = ['shut', 'open', 'wide', 'mid', 'smile', 'frown'];
export const ARMS: readonly Arms[] = ['down', 'up'];
export const FEET: readonly Feet[] = ['stand', 'left', 'right'];

/** Every pose he can take: every eyes, mouth, arms and feet together. */
export const POSES: readonly Pose[] = EYES.flatMap((eyes) => MOUTHS.flatMap((mouth) => ARMS.flatMap((arms) => FEET.map((feet) => ({ eyes, mouth, arms, feet })))));

/** Standing still, looking ahead, mouth shut. */
export const AT_REST: Pose = { eyes: 'ahead', mouth: 'shut', arms: 'down', feet: 'stand' };

/** A name for a pose, the same for the same pose (so a drawing redraws only when it changes). */
export function poseKey(pose: Pose): string {
  return `${pose.eyes}/${pose.mouth}/${pose.arms}/${pose.feet}`;
}

/** How he feels about what he's saying: calm, happy (smiling), cheering (arms up too) or worried. */
export type Mood = 'calm' | 'happy' | 'cheer' | 'worried';

/** What he's doing: talking (his words still typing out), walking (on his way somewhere), which way he looks, how he feels. */
export type Doing = { readonly talking: boolean; readonly walking: boolean; readonly look: -1 | 0 | 1; readonly mood: Mood };

/** His timing (ms): how fast his words type out, when he blinks, his mouth as he talks, his feet as he walks. */
export const TICK = {
  charsPerSecond: 60,
  blink: { every: 3600, for: 130 },
  talk: { mouths: ['open', 'shut', 'wide', 'mid'] as const, each: 90 },
  walk: { feet: ['left', 'stand', 'right', 'stand'] as const, each: 110 },
};

const LOOKS: readonly Eyes[] = ['left', 'ahead', 'right'];

/** His pose `now`, from what he's doing. */
export function poseAt(doing: Doing, now: number): Pose {
  const blinking = now % TICK.blink.every < TICK.blink.for;
  const happy = doing.mood === 'happy' || doing.mood === 'cheer';
  const eyes: Eyes = blinking ? 'blink' : happy ? 'happy' : doing.mood === 'worried' ? 'worried' : LOOKS[doing.look + 1];
  const talk = TICK.talk.mouths;
  const mouth: Mouth = doing.talking ? talk[Math.floor(now / TICK.talk.each) % talk.length] : happy ? 'smile' : doing.mood === 'worried' ? 'frown' : 'shut';
  const steps = TICK.walk.feet;
  const feet: Feet = doing.walking ? steps[Math.floor(now / TICK.walk.each) % steps.length] : 'stand';
  return { eyes, mouth, arms: doing.mood === 'cheer' ? 'up' : 'down', feet };
}

// ---- drawn in characters ----

/** The slots in a character sheet's lines: the parts that change. */
export type Slot = 'eyes' | 'mouth' | 'left' | 'right' | 'feet';

/**
 * A look drawn in characters: its lines, with slots for the parts that
 * change ({eyes}, {mouth}, {left} and {right} arms, {feet}), and what fills
 * each slot in each pose. Every pose's lines are the same width. The slots
 * in `accent` are drawn in the era's accent color (DOS's cyan eyes).
 */
export type CharacterSheet = {
  readonly lines: readonly string[];
  readonly accent?: readonly Slot[];
  readonly eyes: Readonly<Record<Eyes, string>>;
  readonly mouth: Readonly<Record<Mouth, string>>;
  readonly arms: Readonly<Record<Arms, readonly [string, string]>>;
  readonly feet: Readonly<Record<Feet, string>>;
};

/** The 8-bit era's TICK: plain characters, as a terminal of the late 70s could show. */
export const ASCII_TICK: CharacterSheet = {
  lines: ['  .-^-.  ', ' [{eyes}] ', '  | {mouth} |  ', ' {left}|___|{right} ', '{feet}'],
  eyes: { ahead: ' o o ', left: 'o o  ', right: '  o o', blink: ' - - ', happy: ' ^ ^ ', worried: ' o O ' },
  mouth: { shut: '-', open: 'o', wide: 'O', mid: '=', smile: 'u', frown: 'n' },
  arms: { down: ['/', '\\'], up: ['\\', '/'] },
  feet: { stand: '  _| |_  ', left: '   | |_  ', right: '  _| |   ' },
};

/** DOS's TICK: the IBM PC's own characters, its box lines, blocks and bullets (code page 437). */
export const CP437_TICK: CharacterSheet = {
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
function filled(sheet: CharacterSheet, pose: Pose, shows: (slot: Slot | undefined) => boolean): string[] {
  const [left, right] = sheet.arms[pose.arms];
  const fill: Readonly<Record<Slot, string>> = { eyes: sheet.eyes[pose.eyes], mouth: sheet.mouth[pose.mouth], left, right, feet: sheet.feet[pose.feet] };
  return sheet.lines.map((line) =>
    line
      .split(/(\{\w+\})/)
      .map((piece) => {
        const slot = /^\{(\w+)\}$/.exec(piece)?.[1] as Slot | undefined;
        const text = slot ? fill[slot] : piece;
        return shows(slot) ? text : ' '.repeat(text.length);
      })
      .join(''),
  );
}

/** A pose in a character sheet: its lines, slots filled. */
export function characterFrame(sheet: CharacterSheet, pose: Pose): string[] {
  return filled(sheet, pose, () => true);
}

/** A pose in two layers drawn over each other: the sheet's ink, and its accent slots alone. */
export function characterLayers(sheet: CharacterSheet, pose: Pose): { ink: string[]; accent: string[] } {
  const accent = new Set(sheet.accent ?? []);
  return {
    ink: filled(sheet, pose, (slot) => slot === undefined || !accent.has(slot)),
    accent: filled(sheet, pose, (slot) => slot !== undefined && accent.has(slot)),
  };
}

// ---- drawn in pixels ----

/** Parts of a pixel sprite: each variant's rows, and where its top-left corner goes. */
type PixelPart<K extends string> = { readonly at: readonly [number, number]; readonly rows: Readonly<Record<K, readonly string[]>> };

/**
 * A look drawn in pixels: one letter a pixel ('.' clear), each letter a
 * color from its palette; the base, and the parts that change drawn over it
 * ('.' in a part leaves the base showing). Arms are drawn on the left and
 * mirrored to the right at `rightArm`.
 */
export type PixelSheet = {
  readonly palette: Readonly<Record<string, number>>;
  readonly base: readonly string[];
  readonly eyes: PixelPart<Eyes>;
  readonly mouth: PixelPart<Mouth>;
  readonly arms: PixelPart<Arms> & { readonly rightArm: number };
  readonly feet: PixelPart<Feet>;
};

/**
 * The 90s desktop's TICK: a 26 x 32 sprite in the 16 VGA colors (drawn at 3x),
 * beveled like a Windows 95 button, light from the top left; a navy visor
 * with cyan eyes, a red antenna bulb, and a chest panel of status lights.
 */
export const PIXEL_TICK: PixelSheet = {
  palette: VGA,
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
export function pixelFrame(sheet: PixelSheet, pose: Pose): string[] {
  const grid = sheet.base.map((row) => [...row]);
  const put = (rows: readonly string[], [x0, y0]: readonly [number, number], mirror = false) => {
    rows.forEach((row, y) => {
      [...(mirror ? [...row].reverse().join('') : row)].forEach((letter, x) => {
        if (letter !== '.') grid[y0 + y][x0 + x] = letter;
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

// ---- drawn in vector shapes ----

/**
 * The modern era's TICK as numbers the drawing eases toward (visual/tickFigure.ts):
 * where his eyes look (-1 to 1), how open they are, whether they're happy
 * arcs or worried, how open his mouth is and how it curves (-1 frown to 1
 * smile), how far his arms are raised, and how far each foot is lifted.
 */
export type VectorPose = {
  readonly look: number;
  readonly eyesOpen: number;
  readonly eyeShape: 'round' | 'happy' | 'worried';
  readonly mouthOpen: number;
  readonly mouthCurve: number;
  readonly armsUp: number;
  readonly leftFoot: number;
  readonly rightFoot: number;
};

const MOUTH_OPEN: Readonly<Record<Mouth, number>> = { shut: 0, open: 0.6, wide: 1, mid: 0.3, smile: 0, frown: 0 };
const MOUTH_CURVE: Readonly<Record<Mouth, number>> = { shut: 0, open: 0, wide: 0, mid: 0, smile: 1, frown: -1 };

export function vectorPose(pose: Pose): VectorPose {
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
} as const;

export type TickLook = keyof typeof TICK_LOOKS;
