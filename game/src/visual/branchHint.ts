import type { Era } from './terminal.ts';

/** The hint color for an outcome: the color of the key that guesses it (J not taken, K taken). */
export function hintColor(era: Era, taken: boolean): number {
  return taken ? era.taken : era.notTaken;
}

/**
 * A branch note's hint, centered on (0, 0) around a `width` x `height` note: a
 * glowing ring in the color of its guess (the key that makes that guess), a badge on
 * its top-right corner (a loop arrow for taken, a down arrow for not taken) so
 * the hint never relies on color alone. Dimmer when the hint isn't sure: no
 * history yet (tier 4), or a 2-bit predictor in a weak state.
 */
export function branchHint(
  scene: Phaser.Scene,
  width: number,
  height: number,
  taken: boolean,
  sure: boolean,
  era: Era,
): Phaser.GameObjects.Container {
  const color = hintColor(era, taken);
  const halo = scene.add.rectangle(0, 0, width + 10, height + 10).setStrokeStyle(6, color, 0.22);
  const ring = scene.add.rectangle(0, 0, width + 4, height + 4).setStrokeStyle(2, color, 1);

  const [bx, by] = [width / 2 - 10, -height / 2 - 2];
  const badge = scene.add.rectangle(bx, by, 18, 16, era.bg).setStrokeStyle(1.5, color, 1);
  const arrow = scene.add.graphics().lineStyle(1.5, color, 1).fillStyle(color, 1);
  if (taken) {
    // Round and back to the top: three quarters of a circle, arrowhead heading up.
    arrow.beginPath().arc(bx, by, 4, -Math.PI / 2, Math.PI, false).strokePath();
    arrow.fillTriangle(bx - 4, by - 4, bx - 7, by + 1, bx - 1, by + 1);
  } else {
    // Straight on down to the next instruction.
    arrow.lineBetween(bx, by - 5, bx, by + 2);
    arrow.fillTriangle(bx, by + 6, bx - 4, by + 1, bx + 4, by + 1);
  }
  return scene.add.container(0, 0, [halo, ring, badge, arrow]).setAlpha(sure ? 1 : 0.55);
}
