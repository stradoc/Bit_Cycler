import { uiSound } from '../audio/menu.ts';
import { bevel, isClassic, isDos, palette } from './bevel.ts';
import { isSmooth, textBase } from './display.ts';
import { cssColor, type TerminalLook } from './terminal.ts';

/** One line of a menu: a label, a value on the right (a setting's state), dimmed when it can't be chosen now. */
export type MenuRow = { readonly label: string; readonly value?: string; readonly dim?: boolean };

/** The classic desktop's selected button stays pressed in this long (ms) before it acts, like a real button on release. */
const PRESS_MS = 130;

/**
 * A list to choose from, highlighted the way each era's computers did it: a
 * bar that glides to the chosen row (modern terminal), a raised button that
 * Enter presses in (90s desktop), a solid bar (DOS), reverse video (green CRT).
 * The scene reads the keys and calls move() and press().
 */
export class ListMenu {
  selected = 0;
  private readonly scene: Phaser.Scene;
  private readonly look: TerminalLook;
  private readonly x: number;
  private readonly top: number;
  private readonly width: number;
  private readonly rowHeight: number;
  private readonly size: number;
  private rows: readonly MenuRow[] = [];
  private parts: Phaser.GameObjects.GameObject[] = [];
  /** The modern era's highlight bar: kept across redraws, so it can glide. */
  private bar: Phaser.GameObjects.Rectangle | undefined;
  private button: { edges: Phaser.GameObjects.Graphics; x: number; y: number; w: number; h: number; texts: Phaser.GameObjects.Text[] } | undefined;
  /** A button is pressed in and about to act: ignore keys until it does. */
  busy = false;
  /** Rows drawn so far, while the menu reveals itself a row at a time. */
  private shown = Number.POSITIVE_INFINITY;

  constructor(scene: Phaser.Scene, look: TerminalLook, x: number, top: number, width: number, rowHeight = 28, size = 18) {
    this.scene = scene;
    this.look = look;
    this.x = x;
    this.top = top;
    this.width = width;
    this.rowHeight = rowHeight;
    this.size = size;
  }

  /** Shows these rows, keeping the selection (or moving it to `selected`). */
  setRows(rows: readonly MenuRow[], selected = this.selected): void {
    this.rows = rows;
    this.selected = Phaser.Math.Clamp(selected, 0, Math.max(0, rows.length - 1));
    this.render();
  }

  /** Draws only the first `count` rows (the menu arriving a row at a time); Infinity shows them all. */
  showRows(count: number): void {
    this.shown = count;
    this.render();
  }

  /** Up or down one row, wrapping around. */
  move(delta: number): void {
    if (this.busy || this.rows.length === 0) return;
    this.selected = Phaser.Math.Wrap(this.selected + delta, 0, this.rows.length);
    uiSound(this.scene, 'move');
    this.render();
  }

  /** Enter: on the classic desktop the button presses in and `action` runs as it comes back up; elsewhere at once. */
  press(action: () => void): void {
    if (this.busy) return;
    const { button } = this;
    if (!button || !isClassic(this.look.era)) {
      action();
      return;
    }
    this.busy = true;
    const { edges, x, y, w, h, texts } = button;
    edges.clear().fillStyle(palette(this.look.era).select).fillRect(x, y, w, h);
    bevel(edges, this.look.era, x, y, w, h, false);
    for (const text of texts) text.setPosition(text.x + 1, text.y + 1);
    this.scene.time.delayedCall(PRESS_MS, () => {
      this.busy = false;
      action();
    });
  }

  /** The middle of row `index`, for drawing beside it. */
  rowY(index: number): number {
    return this.top + index * this.rowHeight;
  }

  private render(): void {
    for (const part of this.parts) part.destroy();
    this.parts = [];
    this.button = undefined;
    this.rows.forEach((row, i) => {
      if (i < this.shown) this.drawRow(row, i === this.selected, this.rowY(i));
    });
    // The modern era's bar outlives redraws: hide it while its row isn't shown.
    this.bar?.setVisible(this.selected < this.shown);
  }

  private drawRow(row: MenuRow, selected: boolean, y: number): void {
    const { era } = this.look;
    const [left, w, h] = [this.x - 8, this.width + 16, this.rowHeight - 4];
    if (selected && isSmooth()) {
      if (!this.bar) {
        this.bar = this.scene.add.rectangle(left + w / 2, y, w, h, era.accent, 0.1).setStrokeStyle(1, era.accent, 0.8).setDepth(-1);
      }
      this.scene.tweens.killTweensOf(this.bar);
      this.scene.tweens.add({ targets: this.bar, y, duration: 160, ease: 'Cubic.Out' });
    } else if (selected && isClassic(era)) {
      // The classic desktop: a raised button in the selection color (Enter presses it in).
      const [top, tall] = [y - (h + 4) / 2, h + 4];
      const edges = this.scene.add.graphics().fillStyle(palette(era).select).fillRect(left, top, w, tall);
      bevel(edges, era, left, top, w, tall, true);
      this.parts.push(edges);
      this.button = { edges, x: left, y: top, w, h: tall, texts: [] };
    } else if (selected && isDos(era)) {
      this.parts.push(this.scene.add.rectangle(left + w / 2, y, w, h, palette(era).select));
    } else if (selected && !era.window) {
      // A green-screen terminal: reverse video, a phosphor bar with dark text (not full strength, so its glow doesn't drown the text).
      this.parts.push(this.scene.add.rectangle(left + w / 2, y, w, h, era.fg, 0.8));
    } else if (selected) {
      this.parts.push(this.scene.add.rectangle(left + w / 2, y, w, h, era.accent, 0.1).setStrokeStyle(1, era.accent, 0.8));
    }
    const solid = selected && (isClassic(era) || isDos(era));
    const reverse = selected && !era.window;
    const ink = reverse ? era.bg : solid ? palette(era).selectText : era.fg;
    const style = { ...textBase(), fontSize: `${this.size}px`, color: cssColor(ink) };
    const alpha = selected ? 1 : row.dim ? 0.45 : 0.9;
    const texts = [this.scene.add.text(this.x, y, `${selected ? '>' : ' '} ${row.label}`, style).setOrigin(0, 0.5).setAlpha(alpha)];
    if (row.value !== undefined) texts.push(this.scene.add.text(this.x + this.width, y, row.value, style).setOrigin(1, 0.5).setAlpha(alpha));
    this.parts.push(...texts);
    if (selected && this.button) this.button.texts = texts;
  }
}
