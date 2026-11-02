// Every animation in the game, as data (the plan: ROADMAP.md item 0). A
// recipe names what changes on an object (its position, size, angle or
// alpha), as keyframes over a time, with an easing, an optional delay, a
// stagger between several objects, and whether it loops. Each era moves in its
// own way (ui/eras.ts `motion`): the green CRT jumps but lets fading things
// glow off like phosphor, DOS moves in whole character cells a few times a
// second, the 90s desktop slides plainly, the modern era eases. An era can
// also play any recipe its own way (`variants`), and a recipe can move one
// way in every era (`style`: TICK is smooth everywhere). visual/motion.ts
// plays them; everything here is pure, so the tests check it in Node.

/** What a recipe can change on an object. */
export type Prop = 'x' | 'y' | 'alpha' | 'scale' | 'scaleX' | 'scaleY' | 'angle';
export const PROPS: readonly Prop[] = ['x', 'y', 'alpha', 'scale', 'scaleX', 'scaleY', 'angle'];

/**
 * How one property moves, as keyframes spread evenly over the recipe's time:
 * - numbers: those values
 * - { by }: offsets from the value it had when the motion started (a shake, rising in)
 * - { times }: multiples of that value (fading in to the alpha it had)
 * - 'goal': from where it is to the value the motion is given (the list's bar to the chosen row)
 */
export type Track = readonly number[] | { readonly by: readonly number[] } | { readonly times: readonly number[] } | 'goal';

/** Easings, by how they start and end. */
export type Ease = 'linear' | 'in' | 'out' | 'inOut';

export type Recipe = {
  readonly tracks: Readonly<Partial<Record<Prop, Track>>>;
  /** How long one pass takes (ms). */
  readonly duration: number;
  /** The easing in an era that eases (others move their own way); 'out' unless given. */
  readonly ease?: Ease;
  /** Before it starts (ms), and between one object and the next when several are given. */
  readonly delay?: number;
  readonly stagger?: number;
  /** Plays over and over: from the first keyframe again, or back and forth. */
  readonly loop?: 'restart' | 'yoyo';
  /** Moves this way in every era, whatever the era's own style (REDUCED MOTION still wins). */
  readonly style?: MotionStyle;
  /** Gameplay needs it to move, so REDUCED MOTION leaves it moving. */
  readonly essential?: boolean;
};

/** Every animation, by name. A new one is an entry here; an era's own version goes in its `motion.variants`. */
export const MOTIONS = {
  /** Something new arriving: it fades in, rising a little (a results card). */
  'glide-in': { tracks: { alpha: { times: [0, 1] }, y: { by: [14, 0] } }, duration: 260, ease: 'out' },
  /** The list's highlight sliding to the chosen row. */
  'list-select': { tracks: { y: 'goal' }, duration: 160, ease: 'out' },
  // TICK moves smoothly in every era, not the period's way: easier on the eyes (the user's choice).
  /** TICK swaying up and down as he waits (keyframes along a sine wave). */
  'tick-bob': { tracks: { y: { by: [0, -2.1, -3, -2.1, 0, 2.1, 3, 2.1, 0] } }, duration: 2400, ease: 'linear', loop: 'restart', style: 'ease' },
  /** TICK bobbing faster while he talks. */
  'tick-bob-talk': { tracks: { y: { by: [0, -2.8, -4, -2.8, 0, 2.8, 4, 2.8, 0] } }, duration: 880, ease: 'linear', loop: 'restart', style: 'ease' },
  /** TICK walking over to where he'll stand (his feet step while he's on his way). */
  'tick-walk': { tracks: { x: 'goal', y: 'goal' }, duration: 450, ease: 'out', style: 'ease' },
  /** The frame around what TICK points at, pulsing. */
  'tick-spotlight': { tracks: { alpha: [1, 0.6] }, duration: 470, ease: 'inOut', loop: 'yoyo', style: 'ease' },
} as const satisfies Readonly<Record<string, Recipe>>;

export type MotionName = keyof typeof MOTIONS;

/**
 * How an era moves things:
 * - cut: no in-betweens; each keyframe is reached at once (a fade down glows off over `afterglow` ms, like phosphor)
 * - step: in-betweens drawn `fps` times a second, moving in whole character cells (`cell`)
 * - tween: plain, even slides
 * - ease: smooth, eased (each recipe's easing)
 * - still: stays on its first keyframe while it plays (what REDUCED MOTION makes of a loop)
 */
export type MotionStyle = 'cut' | 'step' | 'tween' | 'ease' | 'still';

export type EraMotion = {
  readonly style: MotionStyle;
  readonly fps?: number;
  readonly cell?: { readonly x: number; readonly y: number };
  readonly afterglow?: number;
  /** This era's own versions of recipes (replacing what they name). */
  readonly variants?: Readonly<Partial<Record<MotionName, Partial<Recipe>>>>;
};

/** The recipe `name` as an era plays it (its variant laid over the recipe). */
export function recipeFor(name: MotionName, motion: EraMotion): Recipe {
  return { ...MOTIONS[name], ...motion.variants?.[name] };
}

/**
 * How a recipe moves in an era: the era's way, or the recipe's own `style`.
 * With REDUCED MOTION on, everything jumps (no afterglow) and nothing loops, except what gameplay needs.
 */
export function styleFor(motion: EraMotion, recipe: Recipe, reduced: boolean): EraMotion {
  if (reduced && !recipe.essential) return { style: recipe.loop ? 'still' : 'cut' };
  return recipe.style ? { style: recipe.style } : motion;
}

/** Where an easing is at `t` (0-1). */
export function eased(ease: Ease, t: number): number {
  switch (ease) {
    case 'linear':
      return t;
    case 'in':
      return t ** 3;
    case 'out':
      return 1 - (1 - t) ** 3;
    case 'inOut':
      return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  }
}

/** A track's keyframes as values, from the value it started at (`rest`) and the motion's goal. */
export function keyframes(track: Track, rest: number, goal: number | undefined): number[] {
  if (track === 'goal') return [rest, goal ?? rest];
  if ('by' in track) return track.by.map((offset) => rest + offset);
  if ('times' in track) return track.times.map((factor) => rest * factor);
  return [...track];
}

/**
 * Where one pass of a recipe is at `elapsed` ms (0-1; loops wrap), whether
 * it's on the way back (a yoyo's second half), and whether it has finished.
 */
export function passAt(recipe: Recipe, elapsed: number): { at: number; back: boolean; done: boolean } {
  const t = Math.max(0, elapsed) / recipe.duration;
  if (!recipe.loop) return { at: Math.min(1, t), back: false, done: t >= 1 };
  const inCycle = t % (recipe.loop === 'yoyo' ? 2 : 1);
  return inCycle <= 1 ? { at: inCycle, back: false, done: false } : { at: 2 - inCycle, back: true, done: false };
}

/**
 * A property's value `elapsed` ms into a recipe, the way `motion` moves:
 * the keyframes (from `rest` and `goal`), the era's style, and its easing.
 * `axis`: for an x or y, which DOS moves in whole character cells.
 */
export function valueAt(recipe: Recipe, track: Track, rest: number, goal: number | undefined, elapsed: number, motion: EraMotion, axis?: 'x' | 'y'): number {
  const frames = keyframes(track, rest, goal);
  // Not its turn yet (a delay, a stagger): where it starts.
  if (frames.length === 1 || elapsed < 0) return frames[0];
  const segments = frames.length - 1;
  // Finished: exactly on its last keyframe, whatever the style.
  if (passAt(recipe, elapsed).done) return frames[segments];
  const { style } = motion;
  if (style === 'still') return frames[0];
  // DOS draws a few times a second: time moves in steps.
  const fps = style === 'step' ? (motion.fps ?? 10) : 0;
  const time = fps > 0 ? Math.floor(Math.max(0, elapsed) / (1000 / fps)) * (1000 / fps) : elapsed;
  const { at, back } = passAt(recipe, time);
  const position = at * segments;
  const index = Math.min(segments - 1, Math.floor(position));
  const [from, to] = [frames[index], frames[index + 1]];
  if (style === 'cut') {
    // No in-betweens: the keyframe it's heading for is reached as its part begins. A fall in alpha glows off instead, like phosphor.
    const [leaving, heading] = back ? [to, from] : [from, to];
    const afterglow = motion.afterglow ?? 0;
    if (heading < leaving && afterglow > 0 && !axis) {
      const since = ((back ? index + 1 - position : position - index) * recipe.duration) / segments;
      return heading + (leaving - heading) * Math.exp((-4 * since) / afterglow);
    }
    return heading;
  }
  const local = position - index;
  const shaped = style === 'ease' ? eased(recipe.ease ?? 'out', local) : local;
  const value = from + (to - from) * shaped;
  if (style === 'step' && axis && motion.cell) {
    // Whole character cells: the distance from where it ends up is rounded to cells.
    const size = motion.cell[axis];
    return frames[segments] + Math.round((value - frames[segments]) / size) * size;
  }
  return value;
}
