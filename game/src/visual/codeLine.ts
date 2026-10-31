import type { Token } from '../sim/isa.ts';
import { cssColor, type SyntaxColors } from '../ui/eras.ts';
import { textBase } from './display.ts';

type CodeLineOptions = {
  size?: number;
  /** Shrink the font (down to 10px) until the line fits this width. */
  maxWidth?: number;
  /** Center the line on x instead of starting at x. */
  center?: boolean;
  /** Vertical origin of each token: 0 = top, 0.5 = middle. */
  originY?: number;
};

/**
 * Draws syntax-highlighted code: one Text per token (Phaser text has a single
 * color), laid out side by side in a container.
 */
export function codeLine(
  scene: Phaser.Scene,
  x: number,
  y: number,
  parts: readonly Token[],
  colors: SyntaxColors,
  { size = 16, maxWidth, center = false, originY = 0.5 }: CodeLineOptions = {},
): Phaser.GameObjects.Container {
  const texts = parts.map((token) =>
    scene.add
      .text(0, 0, token.text, {
        ...textBase(),
        fontSize: `${size}px`,
        fontStyle: token.kind === 'op' ? 'bold' : '',
        color: cssColor(colors[token.kind]),
      })
      .setOrigin(0, originY),
  );

  const layout = () => {
    let cursor = 0;
    for (const text of texts) {
      text.x = cursor;
      cursor += text.width;
    }
    return cursor;
  };

  let width = layout();
  for (let s = size - 1; maxWidth !== undefined && width > maxWidth && s >= 10; s--) {
    for (const text of texts) text.setFontSize(s);
    width = layout();
  }
  if (center) for (const text of texts) text.x -= width / 2;

  return scene.add.container(x, y, texts);
}
