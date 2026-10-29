import { cssColor, type Era } from './terminal.ts';

/**
 * A titled frame around a panel section, like a window on a terminal: a thin
 * border with the title set into its top edge. Returns the title, so callers
 * can make it clickable.
 */
export function panelBox(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  era: Era,
): Phaser.GameObjects.Text {
  scene.add.rectangle(x, y, width, height).setOrigin(0).setStrokeStyle(1, era.fg, 0.45);
  return scene.add
    .text(x + 10, y, ` ${title} `, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: cssColor(era.fg),
      backgroundColor: cssColor(era.bg), // hides the border behind the title
    })
    .setOrigin(0, 0.5)
    .setAlpha(0.85);
}
