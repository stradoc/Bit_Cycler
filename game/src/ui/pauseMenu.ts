import { cue } from '../audio/cues.ts';
import { HEIGHT, WIDTH } from '../visual/display.ts';
import { cssColor, type Era } from './eras.ts';
import { ListMenu } from './list.ts';
import { ALPHA, TEXT } from './theme.ts';
import { Box, eraText } from './widgets.ts';

// The pause menu: Esc (or Q) on the board, in the shop or in a song
// opens a box over the dimmed screen with RESUME first and the places you
// can go from there. The screen says what it offers (Screen.pauseItems) and
// what pausing means for it (a song stops its clock); this draws it and
// reads its keys.

/** One thing the pause menu offers: its name, a line about it, and what it does. */
export type PauseItem = { readonly label: string; readonly about?: string; readonly run: () => void };

/** Over everything on the screen, the guide included. */
const DEPTH = 2000;
const WIDTH_BOX = 440;
const ROW_H = 30;

export class PauseMenu {
  private readonly scene: Phaser.Scene;
  private readonly era: Era;
  private parts: Phaser.GameObjects.GameObject[] = [];
  private menu: ListMenu | undefined;
  private about: Phaser.GameObjects.Text | undefined;
  private items: readonly PauseItem[] = [];
  private closed: (() => void) | undefined;

  constructor(scene: Phaser.Scene, era: Era) {
    this.scene = scene;
    this.era = era;
  }

  get isOpen(): boolean {
    return this.menu !== undefined;
  }

  /** Opens with RESUME and then `items`; `closed` runs when it goes, whatever was chosen. */
  open(items: readonly PauseItem[], closed?: () => void): void {
    if (this.menu) return;
    const { scene, era } = this;
    this.items = [{ label: 'RESUME', about: 'BACK TO WHERE YOU WERE.', run: () => {} }, ...items];
    this.closed = closed;
    const boxH = 92 + this.items.length * ROW_H + 40;
    const top = HEIGHT / 2 - boxH / 2;
    // The screen dims, and clicks on it go nowhere.
    const shade = scene.add.rectangle(0, 0, WIDTH, HEIGHT, era.bg, 0.75).setOrigin(0).setDepth(DEPTH).setInteractive();
    const box = new Box(scene, era, WIDTH / 2, HEIGHT / 2, WIDTH_BOX, boxH, { strokeWidth: 2 }).setDepth(DEPTH + 1);
    const title = eraText(scene, era, WIDTH / 2, top + 26, 'PAUSED', TEXT.title).setOrigin(0.5).setFontStyle('bold').setColor(cssColor(era.accent)).setDepth(DEPTH + 3);
    const listTop = top + 70;
    this.menu = new ListMenu(scene, era, { x: WIDTH / 2 - WIDTH_BOX / 2 + 40, top: listTop, width: WIDTH_BOX - 80, rowHeight: ROW_H, size: TEXT.body + 1, depth: DEPTH + 3 });
    this.menu.setRows(this.items.map((item) => ({ label: item.label })), 0);
    // Rows can be clicked: a click chooses and does it.
    const zones = this.items.map((_, i) =>
      scene.add
        .zone(WIDTH / 2, this.menu?.rowY(i) ?? 0, WIDTH_BOX - 40, ROW_H)
        .setDepth(DEPTH + 4)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (!this.menu || this.menu.busy) return;
          this.menu.selected = i;
          this.choose();
        }),
    );
    const aboutY = listTop + this.items.length * ROW_H + 4;
    this.about = eraText(scene, era, WIDTH / 2, aboutY, '', TEXT.small).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(WIDTH_BOX - 40).setAlpha(ALPHA.about).setDepth(DEPTH + 3);
    const hint = eraText(scene, era, WIDTH / 2, top + boxH - 18, '[UP/DOWN] CHOOSE    [ENTER] SELECT    [ESC] RESUME', TEXT.hint - 1)
      .setOrigin(0.5)
      .setAlpha(ALPHA.hint)
      .setDepth(DEPTH + 3);
    this.parts = [shade, ...box.parts, title, ...zones, this.about, hint];
    this.showAbout();
    cue(scene, 'confirm');
  }

  /** A key while it's open: it takes them all. */
  key(key: string): void {
    const menu = this.menu;
    if (!menu || menu.busy) return;
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      menu.move(key === 'ArrowUp' ? -1 : 1);
      this.showAbout();
    } else if (key === 'Enter' || key === ' ') {
      this.choose();
    } else if (key === 'Escape' || key === 'Q') {
      cue(this.scene, 'back');
      this.close();
    }
  }

  /** Closes it without choosing anything (RESUME). */
  close(): void {
    if (!this.menu) return;
    this.menu.destroy();
    this.menu = undefined;
    for (const part of this.parts) part.destroy();
    this.parts = [];
    this.about = undefined;
    const closed = this.closed;
    this.closed = undefined;
    closed?.();
  }

  private choose(): void {
    const menu = this.menu;
    if (!menu) return;
    const item = this.items[menu.selected];
    cue(this.scene, menu.selected === 0 ? 'back' : 'confirm');
    menu.press(() => {
      this.close();
      item.run();
    });
  }

  private showAbout(): void {
    if (this.menu) this.about?.setText(this.items[this.menu.selected].about ?? '');
  }
}
