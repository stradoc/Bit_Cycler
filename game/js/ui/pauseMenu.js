import { cue } from '../audio/cues.js';
import { HEIGHT, WIDTH } from '../visual/display.js';
import { cssColor } from './eras.js';
import { ListMenu } from './list.js';
import { ALPHA, TEXT } from './theme.js';
import { Box, eraText } from './widgets.js';
/** Over everything on the screen, the guide included. */
const DEPTH = 2000;
const WIDTH_BOX = 440;
const ROW_H = 30;
export class PauseMenu {
    scene;
    era;
    parts = [];
    menu;
    about;
    items = [];
    closed;
    constructor(scene, era) {
        this.scene = scene;
        this.era = era;
    }
    get isOpen() {
        return this.menu !== undefined;
    }
    /** Opens with RESUME and then `items`; `closed` runs when it goes, whatever was chosen. */
    open(items, closed) {
        if (this.menu)
            return;
        const { scene, era } = this;
        this.items = [{ label: 'RESUME', about: 'BACK TO WHERE YOU WERE.', run: () => { } }, ...items];
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
        const zones = this.items.map((_, i) => scene.add
            .zone(WIDTH / 2, this.menu?.rowY(i) ?? 0, WIDTH_BOX - 40, ROW_H)
            .setDepth(DEPTH + 4)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
            if (!this.menu || this.menu.busy)
                return;
            this.menu.selected = i;
            this.choose();
        }));
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
    key(key) {
        const menu = this.menu;
        if (!menu || menu.busy)
            return;
        if (key === 'ArrowUp' || key === 'ArrowDown') {
            menu.move(key === 'ArrowUp' ? -1 : 1);
            this.showAbout();
        }
        else if (key === 'Enter' || key === ' ') {
            this.choose();
        }
        else if (key === 'Escape' || key === 'Q') {
            cue(this.scene, 'back');
            this.close();
        }
    }
    /** Closes it without choosing anything (RESUME). */
    close() {
        if (!this.menu)
            return;
        this.menu.destroy();
        this.menu = undefined;
        for (const part of this.parts)
            part.destroy();
        this.parts = [];
        this.about = undefined;
        const closed = this.closed;
        this.closed = undefined;
        closed?.();
    }
    choose() {
        const menu = this.menu;
        if (!menu)
            return;
        const item = this.items[menu.selected];
        cue(this.scene, menu.selected === 0 ? 'back' : 'confirm');
        menu.press(() => {
            this.close();
            item.run();
        });
    }
    showAbout() {
        if (this.menu)
            this.about?.setText(this.items[this.menu.selected].about ?? '');
    }
}
//# sourceMappingURL=pauseMenu.js.map