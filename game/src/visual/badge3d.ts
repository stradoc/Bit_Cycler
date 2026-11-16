import type { Era } from '../ui/eras.ts';
import { box, ModelView, norm, type Look, type Part } from './model3d.ts';

// Smallware's status badge (the inbox's company profile): a small trophy in
// 3D, drawn by our own renderer in each era's style, that gains a part at each
// reputation rank: a plinth, then a column, a medal plate, wings, and at the
// top rank a crown and a gem. It turns slowly. Boxes never overlap (touching
// is fine), so they draw in order from every side (tests/model3d.test.ts).

type Material = 'base' | 'medal' | 'trim';

/** The badge for a rank (0: the first, REPUTATION.levels' index): each rank's parts added to the ones before. */
export function buildBadge(rank: number): Part<Material>[] {
  const parts: Part<Material>[] = [box([-14, 0, -14], [14, 6, 14], 'base')];
  if (rank >= 1) parts.push(box([-5, 6, -5], [5, 20, 5], 'base'));
  if (rank >= 2) parts.push(box([-11, 20, -3], [11, 40, 3], 'medal'));
  if (rank >= 3) parts.push(box([-19, 26, -2], [-11, 34, 2], 'medal'), box([11, 26, -2], [19, 34, 2], 'medal'));
  if (rank >= 4) {
    parts.push(
      box([-10, 40, -2], [-6, 46, 2], 'trim'),
      box([-2, 40, -2], [2, 49, 2], 'trim'),
      box([6, 40, -2], [10, 46, 2], 'trim'),
      box([-3, 27, -5], [3, 33, -3], 'trim'),
    );
  }
  return parts;
}

/** A grey plinth, a gold medal, its crown and gem in the era's accent. */
const BADGE_LOOK: Look<Material> = {
  color: (material, era) => (material === 'trim' ? era.accent : material === 'medal' ? 0xd4a017 : 0x8c8c8c),
  luma: { base: 0.55, medal: 0.85, trim: 1 },
  shiny: new Set<Material>(['medal', 'trim']),
  ega: { medal: 0xffff55, base: 0xaaaaaa },
  light: norm([-0.45, 0.6, -0.65]),
};

/** The camera: how far away, and looking down a little (radians). */
export const BADGE_CAMERA = { distance: 300, tilt: -0.3 } as const;

/** The status badge, turning slowly. Call update() every frame. */
export class RankBadge {
  private readonly view: ModelView<Material>;

  constructor(scene: Phaser.Scene, era: Era, x: number, y: number, rank: number) {
    this.view = new ModelView(scene, era, x, y, BADGE_LOOK, { w: 120, h: 110, distance: BADGE_CAMERA.distance, unitPx: 1.6 });
    this.view.setParts(buildBadge(rank));
  }

  /** Turns it to where it is at `timeMs` (the scene's clock) and redraws it. */
  update(timeMs: number): void {
    this.view.draw({ yaw: (timeMs / 1000) * 0.6, tilt: BADGE_CAMERA.tilt, turn: 0 });
  }
}
