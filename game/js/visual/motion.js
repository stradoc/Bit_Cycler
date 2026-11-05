import { recipeFor, styleFor, timed, valueAt, passAt } from '../data/motions.js';
import { getSettings } from '../settings.js';
import { currentEra } from '../ui/eras.js';
/** What a property is when an object doesn't say (a fresh object's). */
const DEFAULTS = { x: 0, y: 0, alpha: 1, scale: 1, scaleX: 1, scaleY: 1, angle: 0, progress: 0 };
export class MotionPlayer {
    running = [];
    /**
     * Plays recipe `name` on `targets` (each `stagger` ms after the one
     * before), as `options` say. A property already moving is taken over from where it is.
     */
    play(name, targets, options = {}) {
        const era = currentEra();
        const recipe = timed(recipeFor(name, era.motion), options);
        const motion = styleFor(era.motion, recipe, getSettings().reducedMotion);
        const list = Array.isArray(targets) ? targets : [targets];
        const props = Object.keys(recipe.tracks);
        const now = options.now ?? performance.now();
        list.forEach((target, i) => {
            this.stop(target, props);
            const rest = Object.fromEntries(props.map((prop) => [prop, target[prop] ?? DEFAULTS[prop]]));
            const start = now + (recipe.delay ?? 0) + i * (recipe.stagger ?? 0);
            const last = i === list.length - 1;
            const entry = { target, recipe, motion, rest, goal: options.goal ?? {}, start, done: last ? options.done : undefined, remove: options.remove };
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
        for (const entry of finished) {
            if (entry.remove)
                entry.target.destroy?.();
            entry.done?.();
        }
    }
    /** Whether anything is moving `target`. */
    moving(target) {
        return this.running.some((entry) => entry.target === target);
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
const views = new WeakMap();
/**
 * The scene's view (its main camera) as something a recipe can move: its x
 * and y shift what's shown (a jolt), and offsets come back to where it was.
 * One per camera, so a second jolt takes over from the first instead of adding to it.
 */
export function viewOf(scene) {
    const camera = scene.cameras.main;
    const known = views.get(camera);
    if (known)
        return known;
    const view = {
        get x() {
            return camera.scrollX;
        },
        set x(value) {
            camera.scrollX = value;
        },
        get y() {
            return camera.scrollY;
        },
        set y(value) {
            camera.scrollY = value;
        },
    };
    views.set(camera, view);
    return view;
}
//# sourceMappingURL=motion.js.map