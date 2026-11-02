import { recipeFor, styleFor, valueAt, passAt } from '../data/motions.js';
import { getSettings } from '../settings.js';
import { currentEra } from '../ui/eras.js';
/** What a property is when an object doesn't say (a fresh object's). */
const DEFAULTS = { x: 0, y: 0, alpha: 1, scale: 1, scaleX: 1, scaleY: 1, angle: 0 };
export class MotionPlayer {
    running = [];
    /**
     * Plays recipe `name` on `targets` (each `stagger` ms after the one
     * before); `goal`: where its 'goal' tracks head; `done`: once the last has
     * finished. A property already moving is taken over from where it is.
     */
    play(name, targets, options = {}) {
        const era = currentEra();
        const recipe = recipeFor(name, era.motion);
        const motion = styleFor(era.motion, recipe, getSettings().reducedMotion);
        const list = Array.isArray(targets) ? targets : [targets];
        const props = Object.keys(recipe.tracks);
        const now = performance.now();
        list.forEach((target, i) => {
            this.stop(target, props);
            const rest = Object.fromEntries(props.map((prop) => [prop, target[prop] ?? DEFAULTS[prop]]));
            const start = now + (recipe.delay ?? 0) + i * (recipe.stagger ?? 0);
            const entry = { target, recipe, motion, rest, goal: options.goal ?? {}, start, done: i === list.length - 1 ? options.done : undefined };
            this.running.push(entry);
            // Straight to its first frame, so nothing shows where it shouldn't before its turn.
            this.apply(entry, now);
        });
    }
    /** Stops what's moving `target` (only `props`, if given), leaving it where it is. */
    stop(target, props) {
        this.running = this.running.filter((entry) => entry.target !== target || (props !== undefined && !props.some((prop) => prop in entry.recipe.tracks)));
    }
    /** Every frame (Screen.update): moves everything on, and finishes what's done. */
    update(now) {
        const finished = [];
        this.running = this.running.filter((entry) => {
            if (entry.target.active === false)
                return false;
            this.apply(entry, now);
            if (!passAt(entry.recipe, now - entry.start).done)
                return true;
            finished.push(entry);
            return false;
        });
        for (const entry of finished)
            entry.done?.();
    }
    /** Everything stops (the scene is shutting down). */
    clear() {
        this.running = [];
    }
    apply(entry, now) {
        const { target, recipe, motion, rest, goal } = entry;
        for (const [prop, track] of Object.entries(recipe.tracks)) {
            const axis = prop === 'x' || prop === 'y' ? prop : undefined;
            target[prop] = valueAt(recipe, track, rest[prop] ?? DEFAULTS[prop], goal[prop], now - entry.start, motion, axis);
        }
    }
}
const players = new WeakMap();
/** The scene's motion player (made the first time it's asked for). */
export function motionOf(scene) {
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
//# sourceMappingURL=motion.js.map