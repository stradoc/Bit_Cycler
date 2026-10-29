import type { Era } from './terminal.ts';

// The 3D edges of a mid-90s desktop: light along the top and left and shadow
// along the bottom and right for something raised (a button, a window), the
// other way round for something sunken (a text field, a pressed button).

/** A desktop's colors: its edges' highlights and shadows, the face of windows and buttons, text fields, and selections. */
export type ClassicPalette = {
  readonly light: number;
  readonly soft: number;
  readonly face: number;
  readonly shadow: number;
  readonly dark: number;
  /** Inside a sunken text field. */
  readonly field: number;
  /** A selected item, and its text. */
  readonly select: number;
  readonly selectText: number;
};

/** Gray, as the 90s shipped it. */
export const CLASSIC: ClassicPalette = {
  light: 0xffffff, soft: 0xdfdfdf, face: 0xc0c0c0, shadow: 0x808080, dark: 0x000000,
  field: 0xffffff, select: 0x000080, selectText: 0xffffff,
};

/** The dark variant: charcoal, like the period's slate and high-contrast color schemes. */
export const CLASSIC_DARK: ClassicPalette = {
  light: 0x707070, soft: 0x555555, face: 0x3a3a3a, shadow: 0x222222, dark: 0x000000,
  field: 0x1a1a1a, select: 0x2d5a96, selectText: 0xffffff,
};

/** The 32-bit era (light or dark): a desktop window with 3D edges. */
export function isClassic(era: Era): boolean {
  return era.window?.style === 'classic';
}

/** The 16-bit era: a full-screen DOS app (double-line boxes, black drop shadows). */
export function isDos(era: Era): boolean {
  return era.window?.style === 'dos';
}

/** A DOS drop shadow: solid black strips along the right and bottom of a box (outside it, so drawing order doesn't matter). */
export function dropShadow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, depth = 6): Phaser.GameObjects.Graphics {
  return g.fillStyle(0x000000, 0.85).fillRect(x + w, y + depth, depth, h).fillRect(x + depth, y + h, w, depth);
}

/** The era's desktop colors (the light gray ones if it has none). */
export function palette(era: Era): ClassicPalette {
  return era.window?.palette ?? CLASSIC;
}

/** Draws two lines of 3D edges just inside the rectangle (x, y, w, h), in the era's colors. */
export function bevel(
  g: Phaser.GameObjects.Graphics,
  era: Era,
  x: number,
  y: number,
  w: number,
  h: number,
  raised: boolean,
): Phaser.GameObjects.Graphics {
  const p = palette(era);
  const [outerLight, outerDark, innerLight, innerDark] = raised ? [p.light, p.dark, p.soft, p.shadow] : [p.shadow, p.light, p.dark, p.soft];
  const edge = (inset: number, light: number, dark: number) => {
    const [left, top, right, bottom] = [x + inset, y + inset, x + w - inset, y + h - inset];
    g.lineStyle(1, light).lineBetween(left, bottom, left, top).lineBetween(left, top, right, top);
    g.lineStyle(1, dark).lineBetween(right, top, right, bottom).lineBetween(right, bottom, left, bottom);
  };
  edge(0.5, outerLight, outerDark);
  edge(1.5, innerLight, innerDark);
  return g;
}
