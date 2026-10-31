import { folderPath } from '../data/menuFiles.js';
import { downloadText, pickTextFile } from '../files.js';
import { formatMoney, formatSavedAt } from '../format.js';
import { activeSlot, CAMPAIGN_SLOTS, deleteSlot, exportSlot, importSlot, loadSlot, newGame, slotName, switchSlot } from '../save.js';
import { cpuLine } from '../sim/progress.js';
import { ListMenu } from '../ui/list.js';
import { Screen } from '../ui/screen.js';
/**
 * The save slots: play one, start a new campaign in one, export a save to a
 * file, import one (from another computer, or a teammate's), or delete one.
 * The game saves by itself as you play, into the slot you're playing.
 */
export class SavesScene extends Screen {
    menu;
    mode = 'load';
    pending;
    message;
    about;
    constructor() {
        super('saves');
    }
    init(data) {
        this.mode = data?.mode ?? 'load';
        this.pending = undefined;
    }
    create() {
        this.setUp();
        const subtitle = this.mode === 'new' ? 'NEW CAMPAIGN: CHOOSE A SLOT FOR IT.' : 'THE GAME SAVES AS YOU PLAY, INTO THE SLOT YOU PLAY.';
        this.header(folderPath(this.era, ['SAVES']), subtitle);
        this.menu = new ListMenu(this, this.era, { x: 110, top: 140, width: 740, rowHeight: 44, size: 16 });
        const start = CAMPAIGN_SLOTS.indexOf(activeSlot());
        this.menu.setRows(this.rows(), Math.max(0, start));
        this.about = this.aboutLine();
        this.message = this.messageLine();
        this.hints('[UP/DOWN] CHOOSE', '[ENTER] SELECT', '[E] EXPORT', '[I] IMPORT', '[X] DELETE', '[Q] BACK');
        this.showAbout();
    }
    /** The slot under the selection, or undefined on BACK. */
    slot() {
        return CAMPAIGN_SLOTS[this.menu.selected];
    }
    rows() {
        const slots = CAMPAIGN_SLOTS.map((slot) => {
            const saved = loadSlot(slot);
            const name = `${slotName(slot)}${slot === activeSlot() ? ' (CURRENT)' : ''}`;
            if (!saved)
                return { label: `${name}: EMPTY`, dim: true };
            return {
                label: `${name}: ${cpuLine(saved.progress)}, ${formatMoney(saved.progress.money)}`,
                value: saved.savedAt > 0 ? formatSavedAt(saved.savedAt) : '',
            };
        });
        return [...slots, { label: 'BACK' }];
    }
    refresh() {
        this.menu.setRows(this.rows());
        this.showAbout();
    }
    showAbout() {
        const slot = this.slot();
        const full = slot !== undefined && loadSlot(slot) !== null;
        this.about.setText(slot === undefined
            ? 'BACK TO THE MAIN MENU.'
            : !full
                ? 'EMPTY: [ENTER] STARTS A NEW CAMPAIGN HERE.'
                : this.mode === 'new'
                    ? '[ENTER] ERASES THIS SAVE AND STARTS A NEW CAMPAIGN HERE.'
                    : '[ENTER] PLAYS THIS SAVE.');
    }
    say(message, sound = 'confirm') {
        this.message.setText(message);
        this.cue(sound);
    }
    /** Asks for the same key again before erasing anything; true once it's been asked. */
    confirmed(action, slot, question) {
        if (this.pending?.action === action && this.pending.slot === slot) {
            this.pending = undefined;
            return true;
        }
        this.pending = { action, slot };
        this.say(question, 'error');
        return false;
    }
    onKey(key) {
        if (this.menu.busy)
            return true;
        const slot = this.slot();
        if (key === 'ArrowUp' || key === 'ArrowDown') {
            this.pending = undefined;
            this.message.setText('');
            this.menu.move(key === 'ArrowUp' ? -1 : 1);
            this.showAbout();
        }
        else if (key === 'Enter' || key === ' ') {
            this.menu.press(() => this.choose());
        }
        else if (key === 'E' && slot) {
            this.exportSave(slot);
        }
        else if (key === 'I' && slot) {
            this.importSave(slot);
        }
        else if ((key === 'X' || key === 'Delete' || key === 'Backspace') && slot) {
            this.deleteSave(slot);
        }
        else if (key === 'Escape' || key === 'Q') {
            this.leave();
        }
        else
            return false;
        return true;
    }
    leave() {
        this.back('title', { selected: this.mode === 'new' ? 'new' : 'saves' });
    }
    choose() {
        const slot = this.slot();
        if (!slot)
            return this.leave();
        const full = loadSlot(slot) !== null;
        if (full && this.mode === 'load') {
            this.cue('confirm');
            switchSlot(slot);
            this.scene.start('board');
            return;
        }
        if (full && !this.confirmed('erase', slot, `PRESS ENTER AGAIN TO ERASE ${slotName(slot)} AND START OVER.`))
            return;
        this.cue('confirm');
        newGame(slot);
        this.scene.start('board');
    }
    exportSave(slot) {
        const text = exportSlot(slot);
        if (!text)
            return this.say('NOTHING TO EXPORT: THIS SLOT IS EMPTY.', 'error');
        const name = `bit-cycler-slot-${slot}.json`;
        downloadText(name, text);
        this.say(`${slotName(slot)} SAVED TO YOUR DOWNLOADS AS ${name}`);
    }
    importSave(slot) {
        if (loadSlot(slot) !== null && !this.confirmed('import', slot, `PRESS I AGAIN TO REPLACE ${slotName(slot)} WITH A SAVE FILE.`))
            return;
        this.pending = undefined;
        this.say('CHOOSE A SAVE FILE...');
        void pickTextFile().then((text) => {
            const imported = text !== null && importSlot(slot, text);
            if (!this.sys.isActive())
                return;
            if (text === null)
                return this.say('NO FILE CHOSEN.', 'error');
            if (!imported)
                return this.say("THAT FILE ISN'T A BIT CYCLER SAVE.", 'error');
            this.refresh();
            this.say(`IMPORTED INTO ${slotName(slot)}.`, 'buy');
        });
    }
    deleteSave(slot) {
        if (loadSlot(slot) === null)
            return this.say('THIS SLOT IS ALREADY EMPTY.', 'error');
        if (!this.confirmed('delete', slot, `PRESS X AGAIN TO DELETE ${slotName(slot)}. THIS CAN'T BE UNDONE.`))
            return;
        deleteSlot(slot);
        this.refresh();
        this.say(`${slotName(slot)} DELETED.`);
    }
}
//# sourceMappingURL=SavesScene.js.map