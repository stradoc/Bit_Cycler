import { box, ModelView, norm } from './model3d.js';
/** Half the full badge's height (model units): every box is built this far down, so the badge turns about its middle and fits its area at every rank. */
const MIDDLE = 24;
/** A box from one corner to the other, with its heights measured from the plinth's bottom. */
const at = (min, max, material) => box([min[0], min[1] - MIDDLE, min[2]], [max[0], max[1] - MIDDLE, max[2]], material);
/** The badge for a rank (0: the first, REPUTATION.levels' index): each rank's parts added to the ones before. */
export function buildBadge(rank) {
    const parts = [at([-14, 0, -14], [14, 6, 14], 'base')];
    if (rank >= 1)
        parts.push(at([-5, 6, -5], [5, 20, 5], 'base'));
    if (rank >= 2)
        parts.push(at([-11, 20, -3], [11, 40, 3], 'medal'));
    if (rank >= 3)
        parts.push(at([-19, 26, -2], [-11, 34, 2], 'medal'), at([11, 26, -2], [19, 34, 2], 'medal'));
    if (rank >= 4) {
        parts.push(at([-10, 40, -2], [-6, 46, 2], 'trim'), at([-2, 40, -2], [2, 49, 2], 'trim'), at([6, 40, -2], [10, 46, 2], 'trim'), at([-3, 27, -5], [3, 33, -3], 'trim'));
    }
    return parts;
}
/** A grey plinth, a gold medal, its crown and gem in the era's accent. */
const BADGE_LOOK = {
    color: (material, era) => (material === 'trim' ? era.accent : material === 'medal' ? 0xd4a017 : 0x8c8c8c),
    luma: { base: 0.55, medal: 0.85, trim: 1 },
    shiny: new Set(['medal', 'trim']),
    ega: { medal: 0xffff55, base: 0xaaaaaa },
    light: norm([-0.45, 0.6, -0.65]),
};
/** The camera: how far away, and looking down a little (radians). */
export const BADGE_CAMERA = { distance: 300, tilt: -0.3, unitPx: 1.3 };
/** The area the badge is drawn in, around its middle (px). */
export const BADGE_SIZE = { w: 110, h: 84 };
/** The status badge, turning slowly. Call update() every frame. */
export class RankBadge {
    view;
    constructor(scene, era, x, y, rank) {
        this.view = new ModelView(scene, era, x, y, BADGE_LOOK, { ...BADGE_SIZE, distance: BADGE_CAMERA.distance, unitPx: BADGE_CAMERA.unitPx });
        this.view.setParts(buildBadge(rank));
    }
    /** Turns it to where it is at `timeMs` (the scene's clock) and redraws it. */
    update(timeMs) {
        this.view.draw({ yaw: (timeMs / 1000) * 0.6, tilt: BADGE_CAMERA.tilt, turn: 0 });
    }
}
//# sourceMappingURL=badge3d.js.map