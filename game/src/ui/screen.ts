import { cue, type Cue, type CueArgs } from '../audio/cues.ts';
import { startHum, toggleHum } from '../audio/hum.ts';
import { loadSounds } from '../audio/samples.ts';
import { keyOf, onKeyDown } from '../input/keys.ts';
import { WIDTH } from '../visual/display.ts';
import { TerminalLook } from '../visual/terminal.ts';
import { activeSlot } from '../save.ts';
import { cssColor, currentEra, type Era } from './eras.ts';
import { PauseMenu, type PauseItem } from './pauseMenu.ts';
import { ALPHA, colorsOf, LAYOUT, TEXT } from './theme.ts';
import { eraText } from './widgets.ts';

export type ScreenOptions = {
  /** The computer's hum plays (the menus); a song has its own music. */
  readonly hum?: boolean;
  /** The extra glow of a dark screen: 'menu' (the main menu), 'boot' (the intro), or none. */
  readonly glow?: 'menu' | 'boot';
  /** The era's window or DOS bars around the screen (not on the intro, before the program starts). */
  readonly windowed?: boolean;
};

/**
 * What every screen shares: the era's look (visual/terminal.ts), the hum,
 * text in the era's font, and the standard parts laid out the same way on
 * every screen (ui/theme.ts): a title and the line under it at the top, a
 * line about the chosen item, a message line for warnings and results, and
 * the key hints at the bottom. A screen extends this, calls setUp() first in
 * create(), and handles its keys in onKey(); M (the hum) works everywhere. A
 * screen in the game (not the main menu's own screens) offers a pause menu on
 * Esc / Q by returning its places from pauseItems().
 */
export abstract class Screen extends Phaser.Scene {
  protected look!: TerminalLook;
  /** The menus' hum, and the M key that turns it on and off. */
  private humming = true;
  private pauseMenu: PauseMenu | undefined;

  /** The era this screen is drawn in. */
  protected get era(): Era {
    return this.look.era;
  }

  /**
   * The era has changed since this screen was drawn (a new chip, another
   * save), so it should be drawn again: restart it with what it needs to carry on.
   */
  protected eraChanged(): boolean {
    return currentEra() !== this.era;
  }

  /** The era's colors by what they're for (text, accent, warn, danger...). */
  protected get colors(): ReturnType<typeof colorsOf> {
    return colorsOf(this.look.era);
  }

  /** Call first in create(): the era's look before any text (texts take its font), the hum, the keys. */
  protected setUp(options: ScreenOptions = {}): void {
    const era = currentEra();
    this.look = new TerminalLook(this, era, options.windowed ?? true);
    if (options.glow) this.look.glow(options.glow === 'menu' ? era.screen.menuGlow : era.screen.bootGlow);
    this.humming = options.hum ?? true;
    if (this.humming) startHum(this);
    loadSounds(this);
    this.pauseMenu = undefined;
    onKeyDown(this, (event) => {
      const key = keyOf(event);
      if (this.pauseMenu?.isOpen) {
        event.preventDefault();
        this.pauseMenu.key(key);
        return;
      }
      if ((key === 'Escape' || key === 'Q') && this.openPauseMenu()) return;
      if (this.onKey(key, event)) return;
      if (key === 'M' && this.humming) {
        toggleHum(this);
        this.humToggled();
      }
    });
    // Phaser starts a scene with its last data when given none, as every "back to the menu" is: forget it,
    // so the screen opens fresh next time (a restart passes its data again).
    this.sys.settings.data = {};
  }

  /** A key was pressed (the name from keyOf). Return true if it's been handled (M then doesn't toggle the hum). */
  protected onKey(_key: string, _event: KeyboardEvent): boolean | void {}

  /** After M toggled the hum: a screen that shows the setting redraws it. */
  protected humToggled(): void {}

  /** What this screen's pause menu offers after RESUME (Screen.go makes the usual places); none: Esc / Q go to onKey. */
  protected pauseItems(): PauseItem[] | undefined {
    return undefined;
  }

  /** The pause menu opened (true) or closed (false): a song stops and starts its clock. */
  protected onPause(_open: boolean): void {}

  /** The pause menu is open: the screen waits. */
  protected get pausing(): boolean {
    return this.pauseMenu?.isOpen ?? false;
  }

  /** Opens the pause menu, if this screen has one (Esc / Q, or a click on its hint). Returns whether it did. */
  protected openPauseMenu(): boolean {
    const items = this.pauseItems();
    if (!items || this.pausing) return false;
    this.pauseMenu ??= new PauseMenu(this, this.era);
    this.pauseMenu.open(items, () => this.onPause(false));
    this.onPause(true);
    return true;
  }

  /** A pause menu item that goes to another screen. */
  protected go(label: string, scene: string, about: string, data?: object): PauseItem {
    return { label, about, run: () => this.scene.start(scene, data) };
  }

  /**
   * The places the pause menu offers in the game: the board, the shop, the
   * settings (which come back to the board or the shop) and the main menu,
   * leaving out the screen you're on, and the developer screen while you play
   * its save. `note` goes after each one's line (leaving a song: what happens to it).
   */
  protected places(note = ''): PauseItem[] {
    const here = this.scene.key;
    const settingsBack = here === 'shop' ? 'shop' : 'board';
    return [
      ...(here === 'board' ? [] : [this.go('CONTRACT BOARD', 'board', `PICK A JOB FOR YOUR CPU.${note}`)]),
      ...(here === 'calendar' ? [] : [this.go('CALENDAR', 'calendar', `THE MONTH: YOUR DAYS SO FAR, AND WHAT'S COMING.${note}`)]),
      ...(here === 'shop' ? [] : [this.go('SHOP', 'shop', `BUY PARTS THAT MAKE YOUR CPU FASTER.${note}`)]),
      this.go('SETTINGS', 'settings', `SOUND, TIMING AND LOOKS.${note}`, { returnTo: settingsBack }),
      this.go('MAIN MENU', 'title', `YOUR PROGRESS IS SAVED AS YOU GO.${note}`),
      ...(activeSlot() === 'dev' ? [this.go('DEVELOPER MODE', 'dev', `BACK TO THE DEVELOPER SCREEN.${note}`)] : []),
    ];
  }

  update(_time?: number, _delta?: number): void {
    this.look.update();
  }

  /** Text in the era's font and color, centered on (x, y). */
  protected text(x: number, y: number, content: string, size: number = TEXT.body): Phaser.GameObjects.Text {
    return eraText(this, this.era, x, y, content, size).setOrigin(0.5);
  }

  /** The same with its top-left corner at (x, y): columns, listings, lines of a log. */
  protected textAt(x: number, y: number, content: string, size: number = TEXT.body): Phaser.GameObjects.Text {
    return eraText(this, this.era, x, y, content, size);
  }

  /** The screen's name at the top (bold, in the accent color: a path, a board's name), and a dimmer line under it. */
  protected header(title: string, subtitle?: string): { title: Phaser.GameObjects.Text; subtitle?: Phaser.GameObjects.Text } {
    const heading = this.text(WIDTH / 2, LAYOUT.title, title, TEXT.title).setFontStyle('bold').setColor(cssColor(this.era.accent));
    const under = subtitle === undefined ? undefined : this.text(WIDTH / 2, LAYOUT.subtitle, subtitle, TEXT.subtitle).setAlpha(ALPHA.subtitle);
    return { title: heading, subtitle: under };
  }

  /** Something at the top right (the money). */
  protected corner(content: string): Phaser.GameObjects.Text {
    return this.text(LAYOUT.right, LAYOUT.title, content, TEXT.title - 2).setOrigin(1, 0.5);
  }

  /** The line about the chosen item. */
  protected aboutLine(): Phaser.GameObjects.Text {
    return this.text(WIDTH / 2, LAYOUT.about, '', TEXT.small + 1).setAlpha(ALPHA.about).setAlign('center').setWordWrapWidth(880);
  }

  /** The line for warnings and results, in the warning color. */
  protected messageLine(): Phaser.GameObjects.Text {
    return this.text(WIDTH / 2, LAYOUT.message, '', TEXT.small + 1).setColor(cssColor(this.colors.warn));
  }

  /** The key hints at the bottom: hints('[UP/DOWN] CHOOSE', '[ENTER] SELECT', '[Q] BACK'). */
  protected hints(...keys: string[]): Phaser.GameObjects.Text {
    return this.text(WIDTH / 2, LAYOUT.hints, keys.join('    '), TEXT.hint).setAlpha(ALPHA.hint);
  }

  /** Plays a sound (audio/cues.ts). */
  protected cue<N extends Cue>(name: N, ...options: CueArgs<N>): void {
    cue(this, name, ...options);
  }

  /** Back to another screen (the main menu unless given), with the back sound. */
  protected back(scene = 'title', data?: object): void {
    this.cue('back');
    this.scene.start(scene, data);
  }
}
