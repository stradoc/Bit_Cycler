import { playMenuMusic, toggleMenuMusic, uiSound } from '../audio/menu.ts';
import { downloadText, pickTextFile } from '../files.ts';
import { formatMhz, formatMoney, formatSavedAt } from '../format.ts';
import { folderPath } from '../data/menuFiles.ts';
import { keyOf, onKeyDown } from '../input/keys.ts';
import { getSettings } from '../settings.ts';
import { activeSlot, CAMPAIGN_SLOTS, deleteSlot, exportSlot, importSlot, loadSlot, newGame, slotName, switchSlot, type SlotId } from '../save.ts';
import { ratedMhz, tierOf } from '../sim/progress.ts';
import { ListMenu, type MenuRow } from '../visual/listMenu.ts';
import { cssColor, currentEra, TerminalLook } from '../visual/terminal.ts';
import { textBase, WIDTH } from '../visual/display.ts';

/** Loading a save, or choosing where a new campaign goes. */
type Mode = 'load' | 'new';
/** An action that erases a save waits for its key a second time. */
type Pending = { readonly action: 'erase' | 'delete' | 'import'; readonly slot: SlotId };

/**
 * The save slots: play one, start a new campaign in one, export a save to a
 * file, import one (from another computer, or a teammate's), or delete one.
 * The game saves by itself as you play, into the slot you're playing.
 */
export class SavesScene extends Phaser.Scene {
  private look!: TerminalLook;
  private menu!: ListMenu;
  private mode: Mode = 'load';
  private pending: Pending | undefined;
  private message!: Phaser.GameObjects.Text;
  private about!: Phaser.GameObjects.Text;

  constructor() {
    super('saves');
  }

  init(data?: { mode?: Mode }): void {
    this.mode = data?.mode ?? 'load';
    this.pending = undefined;
  }

  create(): void {
    this.look = new TerminalLook(this, currentEra());
    this.text(WIDTH / 2, 40, folderPath(getSettings().eraIndex, ['SAVES']), 24).setFontStyle('bold');
    const subtitle = this.mode === 'new' ? 'NEW CAMPAIGN: CHOOSE A SLOT FOR IT.' : 'THE GAME SAVES AS YOU PLAY, INTO THE SLOT YOU PLAY.';
    this.text(WIDTH / 2, 76, subtitle, 14).setAlpha(0.6);
    this.menu = new ListMenu(this, this.look, 110, 140, 740, 44, 16);
    const start = CAMPAIGN_SLOTS.indexOf(activeSlot());
    this.menu.setRows(this.rows(), Math.max(0, start));
    this.about = this.text(WIDTH / 2, 372, '', 15).setAlpha(0.85);
    this.message = this.text(WIDTH / 2, 420, '', 15).setColor(cssColor(this.look.era.fire[1]));
    this.text(WIDTH / 2, 490, '[UP/DOWN] CHOOSE    [ENTER] SELECT    [E] EXPORT    [I] IMPORT    [X] DELETE    [Q] BACK', 14).setAlpha(0.6);
    this.showAbout();
    this.bindKeys();
    playMenuMusic(this);
  }

  update(): void {
    this.look.update();
  }

  private text(x: number, y: number, content: string, size: number): Phaser.GameObjects.Text {
    return this.add.text(x, y, content, { ...textBase(), fontSize: `${size}px`, color: cssColor(this.look.era.fg) }).setOrigin(0.5);
  }

  /** The slot under the selection, or undefined on BACK. */
  private slot(): SlotId | undefined {
    return CAMPAIGN_SLOTS[this.menu.selected];
  }

  private rows(): MenuRow[] {
    const slots = CAMPAIGN_SLOTS.map((slot): MenuRow => {
      const saved = loadSlot(slot);
      const name = `${slotName(slot)}${slot === activeSlot() ? ' (CURRENT)' : ''}`;
      if (!saved) return { label: `${name}: EMPTY`, dim: true };
      const tier = tierOf(saved.progress);
      return {
        label: `${name}: TIER ${tier.number} ${tier.name}, ${formatMhz(ratedMhz(saved.progress))}, ${formatMoney(saved.progress.money)}`,
        value: saved.savedAt > 0 ? formatSavedAt(saved.savedAt) : '',
      };
    });
    return [...slots, { label: 'BACK' }];
  }

  private refresh(): void {
    this.menu.setRows(this.rows());
    this.showAbout();
  }

  private showAbout(): void {
    const slot = this.slot();
    const full = slot !== undefined && loadSlot(slot) !== null;
    this.about.setText(
      slot === undefined
        ? 'BACK TO THE MAIN MENU.'
        : !full
          ? 'EMPTY: [ENTER] STARTS A NEW CAMPAIGN HERE.'
          : this.mode === 'new'
            ? '[ENTER] ERASES THIS SAVE AND STARTS A NEW CAMPAIGN HERE.'
            : '[ENTER] PLAYS THIS SAVE.',
    );
  }

  private say(message: string, sound: 'confirm' | 'error' | 'buy' = 'confirm'): void {
    this.message.setText(message);
    uiSound(this, sound);
  }

  /** Asks for the same key again before erasing anything; true once it's been asked. */
  private confirmed(action: Pending['action'], slot: SlotId, question: string): boolean {
    if (this.pending?.action === action && this.pending.slot === slot) {
      this.pending = undefined;
      return true;
    }
    this.pending = { action, slot };
    this.say(question, 'error');
    return false;
  }

  private bindKeys(): void {
    onKeyDown(this, (event) => {
      if (this.menu.busy) return;
      const key = keyOf(event);
      const slot = this.slot();
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        this.pending = undefined;
        this.message.setText('');
        this.menu.move(key === 'ArrowUp' ? -1 : 1);
        this.showAbout();
      } else if (key === 'Enter' || key === ' ') {
        this.menu.press(() => this.choose());
      } else if (key === 'E' && slot) {
        this.exportSave(slot);
      } else if (key === 'I' && slot) {
        this.importSave(slot);
      } else if ((key === 'X' || key === 'Delete' || key === 'Backspace') && slot) {
        this.deleteSave(slot);
      } else if (key === 'M') {
        toggleMenuMusic(this);
      } else if (key === 'Escape' || key === 'Q') {
        this.back();
      }
    });
  }

  private back(): void {
    uiSound(this, 'back');
    this.scene.start('title', { selected: this.mode === 'new' ? 'new' : 'saves' });
  }

  private choose(): void {
    const slot = this.slot();
    if (!slot) return this.back();
    const full = loadSlot(slot) !== null;
    if (full && this.mode === 'load') {
      uiSound(this, 'confirm');
      switchSlot(slot);
      this.scene.start('board');
      return;
    }
    if (full && !this.confirmed('erase', slot, `PRESS ENTER AGAIN TO ERASE ${slotName(slot)} AND START OVER.`)) return;
    uiSound(this, 'confirm');
    newGame(slot);
    this.scene.start('board');
  }

  private exportSave(slot: SlotId): void {
    const text = exportSlot(slot);
    if (!text) return this.say('NOTHING TO EXPORT: THIS SLOT IS EMPTY.', 'error');
    const name = `bit-cycler-slot-${slot}.json`;
    downloadText(name, text);
    this.say(`${slotName(slot)} SAVED TO YOUR DOWNLOADS AS ${name}`);
  }

  private importSave(slot: SlotId): void {
    if (loadSlot(slot) !== null && !this.confirmed('import', slot, `PRESS I AGAIN TO REPLACE ${slotName(slot)} WITH A SAVE FILE.`)) return;
    this.pending = undefined;
    this.say('CHOOSE A SAVE FILE...');
    void pickTextFile().then((text) => {
      const imported = text !== null && importSlot(slot, text);
      if (!this.sys.isActive()) return;
      if (text === null) return this.say('NO FILE CHOSEN.', 'error');
      if (!imported) return this.say("THAT FILE ISN'T A BIT CYCLER SAVE.", 'error');
      this.refresh();
      this.say(`IMPORTED INTO ${slotName(slot)}.`, 'buy');
    });
  }

  private deleteSave(slot: SlotId): void {
    if (loadSlot(slot) === null) return this.say('THIS SLOT IS ALREADY EMPTY.', 'error');
    if (!this.confirmed('delete', slot, `PRESS X AGAIN TO DELETE ${slotName(slot)}. THIS CAN'T BE UNDONE.`)) return;
    deleteSlot(slot);
    this.refresh();
    this.say(`${slotName(slot)} DELETED.`);
  }
}
