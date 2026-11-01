import { cue } from '../audio/cues.js';
import { startHum, toggleHum } from '../audio/hum.js';
import { loadSounds } from '../audio/samples.js';
import { keyOf, onKeyDown } from '../input/keys.js';
import { WIDTH } from '../visual/display.js';
import { TerminalLook } from '../visual/terminal.js';
import { cssColor, currentEra } from './eras.js';
import { PauseMenu } from './pauseMenu.js';
import { ALPHA, colorsOf, LAYOUT, TEXT } from './theme.js';
import { eraText } from './widgets.js';
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
export class Screen extends Phaser.Scene {
    look;
    /** The menus' hum, and the M key that turns it on and off. */
    humming = true;
    pauseMenu;
    /** The era this screen is drawn in. */
    get era() {
        return this.look.era;
    }
    /**
     * The era has changed since this screen was drawn (a new chip, another
     * save), so it should be drawn again: restart it with what it needs to carry on.
     */
    eraChanged() {
        return currentEra() !== this.era;
    }
    /** The era's colors by what they're for (text, accent, warn, danger...). */
    get colors() {
        return colorsOf(this.look.era);
    }
    /** Call first in create(): the era's look before any text (texts take its font), the hum, the keys. */
    setUp(options = {}) {
        const era = currentEra();
        this.look = new TerminalLook(this, era, options.windowed ?? true);
        if (options.glow)
            this.look.glow(options.glow === 'menu' ? era.screen.menuGlow : era.screen.bootGlow);
        this.humming = options.hum ?? true;
        if (this.humming)
            startHum(this);
        loadSounds(this);
        this.pauseMenu = undefined;
        onKeyDown(this, (event) => {
            const key = keyOf(event);
            if (this.pauseMenu?.isOpen) {
                event.preventDefault();
                this.pauseMenu.key(key);
                return;
            }
            if ((key === 'Escape' || key === 'Q') && this.openPauseMenu())
                return;
            if (this.onKey(key, event))
                return;
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
    onKey(_key, _event) { }
    /** After M toggled the hum: a screen that shows the setting redraws it. */
    humToggled() { }
    /** What this screen's pause menu offers after RESUME (Screen.go makes the usual places); none: Esc / Q go to onKey. */
    pauseItems() {
        return undefined;
    }
    /** The pause menu opened (true) or closed (false): a song stops and starts its clock. */
    onPause(_open) { }
    /** The pause menu is open: the screen waits. */
    get pausing() {
        return this.pauseMenu?.isOpen ?? false;
    }
    /** Opens the pause menu, if this screen has one (Esc / Q, or a click on its hint). Returns whether it did. */
    openPauseMenu() {
        const items = this.pauseItems();
        if (!items || this.pausing)
            return false;
        this.pauseMenu ??= new PauseMenu(this, this.era);
        this.pauseMenu.open(items, () => this.onPause(false));
        this.onPause(true);
        return true;
    }
    /** A pause menu item that goes to another screen. */
    go(label, scene, about, data) {
        return { label, about, run: () => this.scene.start(scene, data) };
    }
    /**
     * The places the pause menu offers in the game: the board, the shop, the
     * settings (which come back to the board or the shop) and the main menu,
     * leaving out the screen you're on. `note` goes after each one's line
     * (leaving a song: what happens to it).
     */
    places(note = '') {
        const here = this.scene.key;
        const settingsBack = here === 'shop' ? 'shop' : 'board';
        return [
            ...(here === 'board' ? [] : [this.go('CONTRACT BOARD', 'board', `PICK A JOB FOR YOUR CPU.${note}`)]),
            ...(here === 'calendar' ? [] : [this.go('CALENDAR', 'calendar', `THE MONTH: YOUR DAYS SO FAR, AND WHAT'S COMING.${note}`)]),
            ...(here === 'shop' ? [] : [this.go('SHOP', 'shop', `BUY PARTS THAT MAKE YOUR CPU FASTER.${note}`)]),
            this.go('SETTINGS', 'settings', `SOUND, TIMING AND LOOKS.${note}`, { returnTo: settingsBack }),
            this.go('MAIN MENU', 'title', `YOUR PROGRESS IS SAVED AS YOU GO.${note}`),
        ];
    }
    update(_time, _delta) {
        this.look.update();
    }
    /** Text in the era's font and color, centered on (x, y). */
    text(x, y, content, size = TEXT.body) {
        return eraText(this, this.era, x, y, content, size).setOrigin(0.5);
    }
    /** The same with its top-left corner at (x, y): columns, listings, lines of a log. */
    textAt(x, y, content, size = TEXT.body) {
        return eraText(this, this.era, x, y, content, size);
    }
    /** The screen's name at the top (bold, in the accent color: a path, a board's name), and a dimmer line under it. */
    header(title, subtitle) {
        const heading = this.text(WIDTH / 2, LAYOUT.title, title, TEXT.title).setFontStyle('bold').setColor(cssColor(this.era.accent));
        const under = subtitle === undefined ? undefined : this.text(WIDTH / 2, LAYOUT.subtitle, subtitle, TEXT.subtitle).setAlpha(ALPHA.subtitle);
        return { title: heading, subtitle: under };
    }
    /** Something at the top right (the money). */
    corner(content) {
        return this.text(LAYOUT.right, LAYOUT.title, content, TEXT.title - 2).setOrigin(1, 0.5);
    }
    /** The line about the chosen item. */
    aboutLine() {
        return this.text(WIDTH / 2, LAYOUT.about, '', TEXT.small + 1).setAlpha(ALPHA.about).setAlign('center').setWordWrapWidth(880);
    }
    /** The line for warnings and results, in the warning color. */
    messageLine() {
        return this.text(WIDTH / 2, LAYOUT.message, '', TEXT.small + 1).setColor(cssColor(this.colors.warn));
    }
    /** The key hints at the bottom: hints('[UP/DOWN] CHOOSE', '[ENTER] SELECT', '[Q] BACK'). */
    hints(...keys) {
        return this.text(WIDTH / 2, LAYOUT.hints, keys.join('    '), TEXT.hint).setAlpha(ALPHA.hint);
    }
    /** Plays a sound (audio/cues.ts). */
    cue(name, ...options) {
        cue(this, name, ...options);
    }
    /** Back to another screen (the main menu unless given), with the back sound. */
    back(scene = 'title', data) {
        this.cue('back');
        this.scene.start(scene, data);
    }
}
//# sourceMappingURL=screen.js.map