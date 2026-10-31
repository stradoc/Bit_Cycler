import { isSmooth, textBase } from '../visual/display.ts';
import { cssColor, palette, type Era } from './eras.ts';
import { TEXT } from './theme.ts';

// The pieces screens are built from, each drawn the way its era's computer
// drew it (era.kind): text, framed boxes, titled panels and buttons. Screens
// ask for a box or a button; how the green terminal, DOS, the 90s desktop or
// the modern terminal draws one is decided here, not in each screen.

type Faded = Phaser.GameObjects.GameObject & { alpha: number; y: number };

/** Text in the era's font and color (and its size; Phaser's default origin, top-left). */
export function eraText(scene: Phaser.Scene, era: Era, x: number, y: number, content: string, size: number = TEXT.body): Phaser.GameObjects.Text {
  return scene.add.text(x, y, content, { ...textBase(), fontSize: `${size}px`, color: cssColor(era.fg) });
}

/**
 * Two lines of 3D edges just inside the rectangle (x, y, w, h), in the era's
 * colors: light along the top and left and shadow along the bottom and right
 * for something raised (a button, a window), the other way round for
 * something sunken (a text field, a pressed button).
 */
export function bevel(g: Phaser.GameObjects.Graphics, era: Era, x: number, y: number, w: number, h: number, raised: boolean): Phaser.GameObjects.Graphics {
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

/** A DOS drop shadow: solid black strips along the right and bottom of a box (outside it, so drawing order doesn't matter). */
export function dropShadow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, depth = 6): Phaser.GameObjects.Graphics {
  return g.fillStyle(0x000000, 0.85).fillRect(x + w, y + depth, depth, h).fillRect(x + depth, y + h, w, depth);
}

/**
 * A titled frame around a section, its title set into the top edge: a
 * sunken white field on the 90s desktop, a double line in DOS, a thin frame
 * on the terminals. (x, y) is its top-left corner. Returns the title, so it
 * can be made clickable.
 */
export function panel(scene: Phaser.Scene, era: Era, x: number, y: number, w: number, h: number, title: string): Phaser.GameObjects.Text {
  if (era.kind === 'desktop') bevel(scene.add.graphics().fillStyle(palette(era).field).fillRect(x, y, w, h), era, x, y, w, h, false);
  else if (era.kind === 'dos') scene.add.graphics().lineStyle(1, era.accent, 0.9).strokeRect(x, y, w, h).strokeRect(x + 3, y + 3, w - 6, h - 6);
  else scene.add.rectangle(x, y, w, h).setOrigin(0).setStrokeStyle(1, era.accent, 0.45);
  return scene.add
    .text(x + 10, y, ` ${title} `, {
      ...textBase(),
      fontSize: `${TEXT.small}px`,
      color: cssColor(era.accent),
      backgroundColor: cssColor(era.bg), // hides the frame behind the title
    })
    .setOrigin(0, 0.5)
    // Opaque and above the box's contents, so nothing moving inside (the sliding listing) shows through it.
    .setDepth(5);
}

/**
 * A button that presses in: the 90s desktop's, 3D edges at (left, top) around
 * a face of `fill` (null: edges only, over something drawn already). The
 * other eras have no buttons (create() gives undefined): their labels are
 * plain text, and selections are drawn other ways.
 */
export class PressButton {
  readonly edges: Phaser.GameObjects.Graphics;
  pressed = false;
  /** Its label, nudged down and right as it presses in. */
  texts: Phaser.GameObjects.Text[] = [];
  private readonly era: Era;
  private readonly fill: number | null;
  private readonly rect: { x: number; y: number; w: number; h: number };

  private constructor(scene: Phaser.Scene, era: Era, x: number, y: number, w: number, h: number, fill: number | null) {
    this.era = era;
    this.fill = fill;
    this.rect = { x, y, w, h };
    this.edges = scene.add.graphics();
    this.draw();
  }

  static create(scene: Phaser.Scene, era: Era, left: number, top: number, w: number, h: number, fill: number | null = era.bg): PressButton | undefined {
    return era.kind === 'desktop' ? new PressButton(scene, era, left, top, w, h, fill) : undefined;
  }

  /** Pressed in or let up, its label moving with it. */
  press(down: boolean): void {
    if (down === this.pressed) return;
    this.pressed = down;
    this.draw();
    const nudge = down ? 1 : -1;
    for (const text of this.texts) text.setPosition(text.x + nudge, text.y + nudge);
  }

  private draw(): void {
    const { x, y, w, h } = this.rect;
    this.edges.clear();
    if (this.fill !== null) this.edges.fillStyle(this.fill).fillRect(x, y, w, h);
    bevel(this.edges, this.era, x, y, w, h, !this.pressed);
  }
}

export type BoxOptions = {
  /** Filled with this (the era's background unless given); null: see-through. */
  readonly fill?: number | null;
  /** The frame's color (the era's text color unless given); null: no frame. */
  readonly stroke?: number | null;
  readonly strokeAlpha?: number;
  readonly strokeWidth?: number;
  /** DOS's drop shadow, this deep (8 unless given). */
  readonly shadow?: number;
};

/**
 * A framed box (a callout, a dialog, the results, a card), drawn as its era
 * drew one: raised with 3D edges on the 90s desktop (and it can press in),
 * a double line with a black drop shadow in DOS, a plain frame on the
 * terminals. Centered on (x, y), or on the container it's added to.
 */
export class Box {
  /** Its parts, back to front: add them to a container, or set their depth. */
  readonly parts: Phaser.GameObjects.GameObject[] = [];
  /** The box itself (its fill and frame), to light up or make clickable. */
  readonly body: Phaser.GameObjects.Rectangle;
  /** The 90s desktop's raised edges. */
  private readonly button: PressButton | undefined;

  constructor(scene: Phaser.Scene, era: Era, x: number, y: number, w: number, h: number, options: BoxOptions = {}) {
    const [left, top] = [x - w / 2, y - h / 2];
    const fill = options.fill === undefined ? era.bg : options.fill;
    const stroke = options.stroke === undefined ? era.fg : options.stroke;
    if (era.kind === 'dos') this.parts.push(dropShadow(scene.add.graphics(), left, top, w, h, options.shadow ?? 8));
    const body = scene.add.rectangle(x, y, w, h, fill ?? 0, fill === null ? 0 : 1);
    if (stroke !== null) body.setStrokeStyle(options.strokeWidth ?? 1, stroke, options.strokeAlpha ?? 1);
    this.body = body;
    this.parts.push(body);
    if (era.kind === 'dos' && stroke !== null) {
      this.parts.push(scene.add.graphics().lineStyle(1, stroke, (options.strokeAlpha ?? 1) * 0.9).strokeRect(left + 3, top + 3, w - 6, h - 6));
    }
    this.button = PressButton.create(scene, era, left, top, w, h, null);
    if (this.button) this.parts.push(this.button.edges);
  }

  /** It presses in (the 90s desktop's raised boxes do). */
  get canPress(): boolean {
    return this.button !== undefined;
  }

  setDepth(depth: number): this {
    for (const part of this.parts) (part as Phaser.GameObjects.Graphics).setDepth(depth);
    return this;
  }

  /** On the 90s desktop: pressed in (or out again), with `texts` nudged down and right as a pressed button's label is. */
  press(down: boolean, texts: readonly Phaser.GameObjects.Text[] = []): void {
    if (!this.button) return;
    this.button.texts = [...texts];
    this.button.press(down);
  }
}

/** The modern era eases things onto the screen (fading in, rising a little); the retro eras just show them. */
export function glideIn(scene: Phaser.Scene, targets: readonly Faded[], rise = 14): void {
  if (!isSmooth()) return;
  for (const target of targets) {
    const { alpha, y } = target;
    target.alpha = 0;
    target.y = y + rise;
    scene.tweens.add({ targets: target, alpha, y, duration: 260, ease: 'Cubic.Out' });
  }
}
