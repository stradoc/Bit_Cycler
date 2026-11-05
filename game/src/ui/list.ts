import { cue } from '../audio/cues.ts';
import { textBase } from '../visual/display.ts';
import { motionOf } from '../visual/motion.ts';
import { cssColor, palette, type Era } from './eras.ts';
import { ALPHA, TEXT } from './theme.ts';
import { PressButton } from './widgets.ts';

/**
 * One line of a list: a label, a value on the right (a setting's state), and
 * optionally a second column just left of it (a price). Dimmed when it can't
 * be chosen now, or drawn at its own `alpha` when not selected. `group`
 * starts a new group of rows, with this heading above it.
 */
export type MenuRow = {
  readonly label: string;
  readonly value?: string;
  readonly middle?: string;
  readonly dim?: boolean;
  readonly alpha?: number;
  readonly group?: string;
};

export type ListOptions = {
  /** The labels' left edge, the first row's middle, and the width to the values' right edge. */
  readonly x: number;
  readonly top: number;
  readonly width: number;
  readonly rowHeight?: number;
  readonly size?: number;
  /** How far left of the right edge the middle column's right edge is. */
  readonly middle?: number;
  /** Drawn at this depth (a menu over the screen, like the pause menu); the modern era's bar just under it. */
  readonly depth?: number;
  /** Room above a group's first row for its heading (layout pixels; 0.7 of a row unless given). */
  readonly heading?: number;
  /** The lowest a row's middle may be drawn: a longer list scrolls to keep the chosen row in view, with ^ and v at its ends. */
  readonly bottom?: number;
};

/** The 90s desktop's selected button stays pressed in this long (ms) before it acts, like a real button on release. */
const PRESS_MS = 130;
/** A group's heading: the room it takes above its first row, and more before every group but the first. */
const GROUP_HEADING = 0.7;
const GROUP_GAP = 4;

/**
 * A list to choose from, highlighted the way each era's computer did it
 * (era.kind): reverse video on the green terminal, a solid bar in DOS, a
 * raised button that Enter presses in on the 90s desktop, an outlined bar
 * that glides to the chosen row on the modern terminal. The screen reads the
 * keys and calls move() and press().
 */
export class ListMenu {
  selected = 0;
  /** A button is pressed in and about to act: ignore keys until it does. */
  busy = false;
  private readonly scene: Phaser.Scene;
  private readonly era: Era;
  private readonly x: number;
  private readonly top: number;
  private readonly width: number;
  readonly rowHeight: number;
  private readonly size: number;
  private readonly middle: number;
  private readonly depth: number | undefined;
  private readonly heading: number;
  private readonly bottom: number;
  /** How far the list has scrolled up (layout pixels), when it's longer than its room. */
  private scrolled = 0;
  private rows: readonly MenuRow[] = [];
  /** Each row's middle, worked out from the groups. */
  private ys: number[] = [];
  private parts: Phaser.GameObjects.GameObject[] = [];
  /** The modern era's highlight bar: kept across redraws, so it can glide. */
  private bar: Phaser.GameObjects.Rectangle | undefined;
  /** The 90s desktop's selected row: a raised button that Enter presses in. */
  private button: PressButton | undefined;
  /** Rows drawn so far, while the menu reveals itself a row at a time. */
  private shown = Number.POSITIVE_INFINITY;

  constructor(scene: Phaser.Scene, era: Era, options: ListOptions) {
    this.scene = scene;
    this.era = era;
    this.x = options.x;
    this.top = options.top;
    this.width = options.width;
    this.rowHeight = options.rowHeight ?? 28;
    this.size = options.size ?? 18;
    this.middle = options.middle ?? 70;
    this.depth = options.depth;
    this.heading = options.heading ?? this.rowHeight * GROUP_HEADING;
    this.bottom = options.bottom ?? Number.POSITIVE_INFINITY;
  }

  /** Shows these rows, keeping the selection (or moving it to `selected`). */
  setRows(rows: readonly MenuRow[], selected = this.selected): void {
    this.rows = rows;
    this.selected = Phaser.Math.Clamp(selected, 0, Math.max(0, rows.length - 1));
    let y = this.top;
    this.ys = rows.map((row, i) => {
      if (row.group !== undefined) y += this.heading + (i > 0 ? GROUP_GAP : 0);
      const at = y;
      y += this.rowHeight;
      return at;
    });
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
    cue(this.scene, 'move');
    this.render();
  }

  /** Enter: on the 90s desktop the button presses in and `action` runs as it comes back up; elsewhere at once. */
  press(action: () => void): void {
    if (this.busy) return;
    const { button } = this;
    if (!button) {
      action();
      return;
    }
    this.busy = true;
    button.press(true);
    this.scene.time.delayedCall(PRESS_MS, () => {
      this.busy = false;
      action();
    });
  }

  /** The middle of row `index` as drawn (scrolled), for drawing beside it. */
  rowY(index: number): number {
    return (this.ys[index] ?? this.top + index * this.rowHeight) - this.scrolled;
  }

  /** Scrolls just enough to show the chosen row (and its group's heading), if the list is longer than its room. */
  private scrollToSelected(): void {
    const y = this.ys[this.selected];
    if (y === undefined) return;
    const above = this.rows[this.selected]?.group !== undefined ? this.heading : 0;
    if (y - this.scrolled > this.bottom) this.scrolled = y - this.bottom;
    if (y - above - this.scrolled < this.top - this.heading) this.scrolled = Math.max(0, y - above - this.top + this.heading);
    if (this.selected === 0) this.scrolled = 0;
  }

  private render(): void {
    for (const part of this.parts) part.destroy();
    this.parts = [];
    this.button = undefined;
    this.scrollToSelected();
    const inView = (i: number) => this.rowY(i) >= this.top - 0.5 && this.rowY(i) <= this.bottom + 0.5;
    this.rows.forEach((row, i) => {
      if (i >= this.shown || !inView(i)) return;
      if (row.group !== undefined) this.drawHeading(row.group, this.rowY(i) - this.heading);
      this.drawRow(row, i === this.selected, this.rowY(i));
    });
    // Marks for rows out of view above and below.
    const more = (y: number, mark: string) => this.parts.push(this.scene.add.text(this.x + this.width + 14, y, mark, { ...textBase(), fontSize: `${this.size}px`, color: cssColor(this.era.fg) }).setOrigin(0.5).setAlpha(0.6));
    if (this.rows.some((_, i) => i < this.shown && this.rowY(i) < this.top - 0.5)) more(this.top, '^');
    if (this.rows.some((_, i) => i < this.shown && this.rowY(i) > this.bottom + 0.5)) more(this.bottom, 'v');
    // The modern era's bar outlives redraws: hide it while its row isn't shown.
    this.bar?.setVisible(this.selected < this.shown);
    if (this.depth !== undefined) for (const part of this.parts) (part as Phaser.GameObjects.Text).setDepth(this.depth);
  }

  /** Removes the list from the screen. */
  destroy(): void {
    for (const part of this.parts) part.destroy();
    this.parts = [];
    this.bar?.destroy();
    this.bar = undefined;
  }

  private drawHeading(name: string, y: number): void {
    const style = { ...textBase(), fontSize: `${TEXT.small - 1}px`, color: cssColor(this.era.accent) };
    this.parts.push(this.scene.add.text(this.x, y, name, style).setOrigin(0, 0.5).setAlpha(0.7));
  }

  private drawRow(row: MenuRow, selected: boolean, y: number): void {
    const { era } = this;
    const [left, w, h] = [this.x - 8, this.width + 16, this.rowHeight - 4];
    if (selected && era.kind === 'modern') {
      // The modern era's highlight is one bar that slides from row to row (the 'list-select' recipe).
      if (!this.bar) {
        this.bar = this.scene.add.rectangle(left + w / 2, y, w, h, era.accent, 0.1).setStrokeStyle(1, era.accent, 0.8).setDepth((this.depth ?? 0) - 1);
      }
      motionOf(this.scene).play('list-select', this.bar, { goal: { y } });
    } else if (selected && era.kind === 'desktop') {
      // A raised button in the selection color (Enter presses it in).
      this.button = PressButton.create(this.scene, era, left, y - (h + 4) / 2, w, h + 4, palette(era).select);
      if (this.button) this.parts.push(this.button.edges);
    } else if (selected && era.kind === 'dos') {
      this.parts.push(this.scene.add.rectangle(left + w / 2, y, w, h, palette(era).select));
    } else if (selected && era.kind === 'terminal') {
      // Reverse video: a phosphor bar with dark text (not full strength, so its glow doesn't drown the text).
      this.parts.push(this.scene.add.rectangle(left + w / 2, y, w, h, era.fg, 0.8));
    } else if (selected) {
      this.parts.push(this.scene.add.rectangle(left + w / 2, y, w, h, era.accent, 0.1).setStrokeStyle(1, era.accent, 0.8));
    }
    const solid = selected && (era.kind === 'desktop' || era.kind === 'dos');
    const reverse = selected && era.kind === 'terminal';
    const ink = reverse ? era.bg : solid ? palette(era).selectText : era.fg;
    const style = { ...textBase(), fontSize: `${this.size}px`, color: cssColor(ink) };
    const alpha = selected ? 1 : row.dim ? ALPHA.dim : (row.alpha ?? 0.9);
    const right = this.x + this.width;
    const texts = [this.scene.add.text(this.x, y, `${selected ? '>' : ' '} ${row.label}`, style).setOrigin(0, 0.5).setAlpha(alpha)];
    if (row.middle !== undefined) texts.push(this.scene.add.text(right - this.middle, y, row.middle, style).setOrigin(1, 0.5).setAlpha(alpha));
    if (row.value !== undefined) texts.push(this.scene.add.text(right, y, row.value, style).setOrigin(1, 0.5).setAlpha(alpha));
    this.parts.push(...texts);
    if (selected && this.button) this.button.texts = texts;
  }
}
