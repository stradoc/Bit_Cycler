import { recipeFor, styleFor, valueAt, passAt, type EraMotion, type MotionName, type Prop, type Recipe } from '../data/motions.ts';
import { getSettings } from '../settings.ts';
import { currentEra } from '../ui/eras.ts';

// Plays the animations in data/motions.ts on a screen's objects, the way the
// era moves (its `motion` in ui/eras.ts) and as REDUCED MOTION asks. One
// player per scene (motionOf), driven by Screen.update on performance.now(),
// so a slow frame never leaves a motion behind, and cleared when the scene
// shuts down. Screens only name what should happen:
//   motionOf(this).play('glide-in', [box, text]);

/** Anything with a position, size, angle and alpha (Phaser's game objects); `active` false once destroyed. */
export type Moving = { [P in Prop]?: number } & { readonly active?: boolean };

/** What a property is when an object doesn't say (a fresh object's). */
const DEFAULTS: Readonly<Record<Prop, number>> = { x: 0, y: 0, alpha: 1, scale: 1, scaleX: 1, scaleY: 1, angle: 0 };

type Running = {
  readonly target: Moving;
  readonly recipe: Recipe;
  /** How it moves: the era's way, or every era's jump with REDUCED MOTION. */
  readonly motion: EraMotion;
  /** Each property's value when it started, and where a 'goal' track heads. */
  readonly rest: Partial<Record<Prop, number>>;
  readonly goal: Partial<Record<Prop, number>>;
  readonly start: number;
  readonly done?: () => void;
};

export class MotionPlayer {
  private running: Running[] = [];

  /**
   * Plays recipe `name` on `targets` (each `stagger` ms after the one
   * before); `goal`: where its 'goal' tracks head; `done`: once the last has
   * finished. A property already moving is taken over from where it is.
   */
  play(name: MotionName, targets: Moving | readonly Moving[], options: { goal?: Partial<Record<Prop, number>>; done?: () => void } = {}): void {
    const era = currentEra();
    const recipe = recipeFor(name, era.motion);
    const motion = styleFor(era.motion, recipe, getSettings().reducedMotion);
    const list: readonly Moving[] = Array.isArray(targets) ? targets : [targets as Moving];
    const props = Object.keys(recipe.tracks) as Prop[];
    const now = performance.now();
    list.forEach((target, i) => {
      this.stop(target, props);
      const rest = Object.fromEntries(props.map((prop) => [prop, target[prop] ?? DEFAULTS[prop]]));
      const start = now + (recipe.delay ?? 0) + i * (recipe.stagger ?? 0);
      const entry: Running = { target, recipe, motion, rest, goal: options.goal ?? {}, start, done: i === list.length - 1 ? options.done : undefined };
      this.running.push(entry);
      // Straight to its first frame, so nothing shows where it shouldn't before its turn.
      this.apply(entry, now);
    });
  }

  /** Stops what's moving `target` (only `props`, if given), leaving it where it is. */
  stop(target: Moving, props?: readonly Prop[]): void {
    this.running = this.running.filter((entry) => entry.target !== target || (props !== undefined && !props.some((prop) => prop in entry.recipe.tracks)));
  }

  /** Every frame (Screen.update): moves everything on, and finishes what's done. */
  update(now: number): void {
    const finished: Running[] = [];
    this.running = this.running.filter((entry) => {
      if (entry.target.active === false) return false;
      this.apply(entry, now);
      if (!passAt(entry.recipe, now - entry.start).done) return true;
      finished.push(entry);
      return false;
    });
    for (const entry of finished) entry.done?.();
  }

  /** Everything stops (the scene is shutting down). */
  clear(): void {
    this.running = [];
  }

  private apply(entry: Running, now: number): void {
    const { target, recipe, motion, rest, goal } = entry;
    for (const [prop, track] of Object.entries(recipe.tracks) as [Prop, NonNullable<Recipe['tracks'][Prop]>][]) {
      const axis = prop === 'x' || prop === 'y' ? prop : undefined;
      target[prop] = valueAt(recipe, track, rest[prop] ?? DEFAULTS[prop], goal[prop], now - entry.start, motion, axis);
    }
  }
}

const players = new WeakMap<Phaser.Scene, MotionPlayer>();

/** The scene's motion player (made the first time it's asked for). */
export function motionOf(scene: Phaser.Scene): MotionPlayer {
  let player = players.get(scene);
  if (!player) {
    const made = new MotionPlayer();
    players.set(scene, made);
    // A scene is one object reused by every start and restart: what was moving stops with it.
    scene.events.on('shutdown', () => made.clear());
    player = made;
  }
  return player;
}
