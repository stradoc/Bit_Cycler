import { powerOff, stopHum } from '../audio/sound.ts';
import { programListing } from '../data/boot.ts';
import { LESSONS } from '../data/lessons.ts';
import { banner, commandLine, CREDITS, listCommand, listingFooter, listingLine, readCommand, README, type TextFile } from '../data/menuFiles.ts';
import { formatMhz, formatMoney } from '../format.ts';
import { activeSlot, CAMPAIGN_SLOTS, getProgress, hasSave, newGame, slotName } from '../save.ts';
import { getSettings, updateSettings } from '../settings.ts';
import { ratedMhz, tierOf } from '../sim/progress.ts';
import { cssColor, ERAS } from '../ui/eras.ts';
import { ListMenu } from '../ui/list.ts';
import { Screen } from '../ui/screen.ts';
import { ALPHA, LAYOUT } from '../ui/theme.ts';
import { HEIGHT, WIDTH } from '../visual/display.ts';

/** What a file on the menu's disk does when opened. */
type Action = 'continue' | 'new' | 'practice' | 'saves' | 'briefings' | 'settings' | 'readme' | 'credits' | 'shutdown' | 'up' | 'lesson';

/** One file or folder in a listing (a folder has no extension). */
type Entry = {
  readonly action: Action;
  readonly name: string;
  readonly ext: string;
  readonly note: string;
  readonly about: string;
  /** For a lesson: its id. */
  readonly lessonId?: string;
  /** Shown on the right (a lesson's READ / NEW / LOCKED). */
  readonly value?: string;
  readonly locked?: boolean;
};

type Folder = 'root' | 'briefings';
const FOLDER_PATH: Readonly<Record<Folder, readonly string[]>> = { root: [], briefings: ['BRIEFS'] };

const LIST_X = 230;
const LIST_TOP = 172;
const ROW_H = 26;
/** The code in the margins scrolls up this fast (layout pixels a second). */
const CODE_SPEED = 14;
/** The margins' code columns: their left edges, and the band they show in. */
const CODE_COLUMNS = [24, 740];
const CODE_TOP = 24;
const CODE_BOTTOM = 430;
const CODE_WIDTH = 196;

/**
 * The main menu, as the game's own disk: programs to run (continue, a new
 * campaign, practice, shut down), folders to open (saves, briefings), the
 * settings file and text files to read, listed the way each era listed files
 * (data/menuFiles.ts). The backquote key opens the developer screen, which
 * isn't listed.
 */
export class TitleScene extends Screen {
  private menu!: ListMenu;
  private folder: Folder = 'root';
  private entries: Entry[] = [];
  private prompt!: Phaser.GameObjects.Text;
  private footer!: Phaser.GameObjects.Text;
  private about!: Phaser.GameObjects.Text;
  private viewer!: Phaser.GameObjects.Text;
  /** An open text file's title, in big block letters. */
  private viewerTitle!: Phaser.GameObjects.Text;
  /** The save's line and the key hints, hidden while a text file is open (it needs the room). */
  private lower: Phaser.GameObjects.Text[] = [];
  /** The text file open in the viewer, and its page. */
  private reading: TextFile | undefined;
  private page = 0;
  /** Shutting down: ignore keys. */
  private off = false;
  /** Arrived from the intro: the title types itself and the listing appears a line at a time. */
  private fromBoot = false;
  /** The arrival's timers, so a key press can skip to the end. */
  private arrival: Phaser.Time.TimerEvent[] = [];
  /** Skips the arrival to its end; undefined once it's over. */
  private finishArrival: (() => void) | undefined;

  constructor() {
    super('title');
  }

  init(data?: { fromBoot?: boolean }): void {
    this.fromBoot = data?.fromBoot ?? false;
    this.entries = [];
    this.arrival = [];
    this.finishArrival = undefined;
    this.reading = undefined;
    this.off = false;
  }

  create(data?: { selected?: string; folder?: Folder }): void {
    this.setUp({ glow: 'menu' });
    const { era } = this;
    this.scrollingCode();
    const title = this.text(WIDTH / 2, 62, 'BIT CYCLER', 52).setColor(cssColor(era.accent));
    const tagline = this.text(WIDTH / 2, 102, 'A CPU TYCOON WHERE EVERY BEAT IS ONE CLOCK CYCLE', 13).setAlpha(ALPHA.subtitle);
    this.prompt = this.text(LIST_X, 138, '', 15).setOrigin(0, 0.5);
    this.menu = new ListMenu(this, era, { x: LIST_X, top: LIST_TOP, width: 500, rowHeight: ROW_H, size: 16 });
    // Block letters close up (no line spacing), so their half blocks join into whole letters.
    this.viewerTitle = this.textAt(LIST_X, LIST_TOP - 18, '', 16).setLineSpacing(0).setColor(cssColor(era.accent)).setVisible(false);
    this.viewer = this.textAt(LIST_X, LIST_TOP + 46, '', 16).setLineSpacing(6).setVisible(false);
    this.footer = this.text(LIST_X, 446, '', 14).setOrigin(0, 0.5).setAlpha(0.7);
    this.about = this.aboutLine();
    const status = this.text(WIDTH / 2, LAYOUT.message, this.statusLine(), 14).setAlpha(0.65);
    const hints = this.hints('[UP/DOWN] CHOOSE', '[ENTER] OPEN', '[ESC] BACK', '[M] COMPUTER HUM');
    this.lower = [status, hints];
    this.openFolder(data?.folder ?? 'root', data?.selected);

    if (this.fromBoot) {
      this.cameras.main.fadeIn(300, 0, 0, 0);
      this.arrive(title, tagline, [this.footer, this.about, status, hints]);
    }
  }

  private statusLine(): string {
    if (!hasSave()) return 'NO SAVE YET: RUN NEWGAME';
    const progress = getProgress();
    const tier = tierOf(progress);
    return `${slotName(activeSlot())}: ${formatMoney(progress.money)}   TIER ${tier.number} ${tier.name} AT ${formatMhz(ratedMhz(progress))}`;
  }

  // ---- the disk ----

  private rootEntries(): Entry[] {
    const progress = getProgress();
    const tier = tierOf(progress);
    const used = CAMPAIGN_SLOTS.filter((slot) => hasSave(slot)).length;
    const read = Object.keys(LESSONS).filter((id) => progress.seenLessons.includes(id)).length;
    return [
      ...(hasSave()
        ? [{ action: 'continue', name: 'CONTINUE', ext: 'EXE', note: `${slotName(activeSlot())}, TIER ${tier.number}`, about: 'BACK TO THE CONTRACT BOARD WITH YOUR SAVE.' } as const]
        : []),
      { action: 'new', name: 'NEWGAME', ext: 'EXE', note: 'A NEW CAMPAIGN', about: 'START A NEW CAMPAIGN: AN 8-BIT SINGLE-CYCLE CPU AND NO MONEY.' },
      { action: 'practice', name: 'PRACTICE', ext: 'EXE', note: `TIER ${tier.number}: ${tier.name}`, about: 'PRACTICE YOUR CPU: NOTES WAIT FOR YOU.' },
      { action: 'saves', name: 'SAVES', ext: '', note: `${used} OF ${CAMPAIGN_SLOTS.length} SLOTS USED`, about: 'LOAD A SAVE, OR EXPORT, IMPORT AND DELETE SAVES.' },
      { action: 'briefings', name: 'BRIEFS', ext: '', note: `${read} OF ${Object.keys(LESSONS).length} READ`, about: 'REREAD A BRIEFING YOU HAVE FINISHED.' },
      { action: 'settings', name: 'SETTINGS', ext: 'CFG', note: 'RELAXED MODE, SOUND, SCREEN', about: 'RELAXED MODE, AUDIO CALIBRATION, VOLUME, SCREEN EFFECTS AND THE ERA.' },
      { action: 'readme', name: 'README', ext: 'TXT', note: 'HOW TO PLAY', about: 'HOW TO PLAY, A PAGE AT A TIME.' },
      { action: 'credits', name: 'CREDITS', ext: 'TXT', note: 'MADE BY, FONTS, LICENSES', about: 'WHO MADE WHAT.' },
      { action: 'shutdown', name: 'SHUTDOWN', ext: 'EXE', note: 'POWER OFF', about: 'TURN THE COMPUTER OFF.' },
    ];
  }

  /** Every briefing, as a text file: the ones you've finished, and your CPU's own, can be read. */
  private briefingEntries(): Entry[] {
    const progress = getProgress();
    const current = tierOf(progress).lessonId;
    const lessons = Object.values(LESSONS).map((lesson): Entry => {
      const read = progress.seenLessons.includes(lesson.id);
      const open = read || lesson.id === current;
      return {
        action: 'lesson',
        lessonId: lesson.id,
        name: lesson.id.toUpperCase().slice(0, 8),
        ext: 'TXT',
        note: lesson.title.replace(/^LESSON \d+: /, '').slice(0, 26),
        value: read ? 'READ' : open ? 'NEW' : 'LOCKED',
        locked: !open,
        about: open ? `OPEN ${lesson.title}.` : 'LOCKED: BUY THE PART IT EXPLAINS FIRST.',
      };
    });
    return [{ action: 'up', name: '..', ext: '', note: 'BACK', about: 'BACK TO THE MAIN FOLDER.' }, ...lessons];
  }

  /** Lists a folder, the cursor on `selected` (an action or lesson id) if it's there. */
  private openFolder(folder: Folder, selected?: string): void {
    this.folder = folder;
    this.reading = undefined;
    this.viewer.setVisible(false);
    this.viewerTitle.setVisible(false);
    for (const text of this.lower) text.setVisible(true);
    this.entries = folder === 'root' ? this.rootEntries() : this.briefingEntries();
    const { era } = this;
    this.prompt.setText(commandLine(era, FOLDER_PATH[folder], listCommand(era)));
    const start = this.entries.findIndex((entry) => entry.action === selected || entry.lessonId === selected);
    this.menu.setRows(
      this.entries.map((entry) => ({ label: listingLine(entry.name, entry.ext, entry.note, era), value: entry.value, dim: entry.locked })),
      Math.max(0, start),
    );
    this.footer.setText(listingFooter(era, this.entries.length));
    this.about.setY(LAYOUT.about);
    this.showAbout();
  }

  /** Prints a text file in place of the listing, as TYPE or cat would: its title in block letters, then a page at a time. */
  private openText(file: TextFile): void {
    this.reading = file;
    this.page = 0;
    const { era } = this;
    this.prompt.setText(commandLine(era, FOLDER_PATH[this.folder], readCommand(era, file.title, 'TXT')));
    this.menu.showRows(0);
    this.viewerTitle.setText(banner(file.title).join('\n')).setVisible(true);
    this.viewer.setVisible(true);
    this.footer.setText('');
    for (const text of this.lower) text.setVisible(false);
    // The page line takes the hints' place.
    this.about.setY(LAYOUT.hints);
    this.showPage();
  }

  private showPage(): void {
    const file = this.reading;
    if (!file) return;
    const pages = file.pages.length;
    this.viewer.setText(file.pages[this.page].join('\n'));
    this.about.setText(pages > 1 ? `PAGE ${this.page + 1} OF ${pages}   [LEFT/RIGHT] TURN THE PAGE   [ESC] CLOSE` : '[ESC] OR [ENTER] CLOSE');
  }

  /** Turns the open file's page; past the last one, closes it. */
  private turnPage(delta: number): void {
    const file = this.reading;
    if (!file) return;
    const page = this.page + delta;
    if (page >= file.pages.length) return this.closeText();
    if (page < 0) return;
    this.cue('move');
    this.page = page;
    this.showPage();
  }

  private closeText(): void {
    const entry = this.entries[this.menu.selected];
    this.menu.showRows(Number.POSITIVE_INFINITY);
    this.openFolder(this.folder, entry?.action);
  }

  private showAbout(): void {
    this.about.setText(this.entries[this.menu.selected]?.about ?? '');
  }

  // ---- keys ----

  protected onKey(key: string): boolean | void {
    if (this.menu.busy || this.off) return true;
    // A key while the menu is still arriving just shows all of it.
    if (this.finishArrival) {
      this.finishArrival();
      return true;
    }
    if (this.reading) {
      if (['ArrowRight', 'ArrowDown', 'Enter', ' '].includes(key)) this.turnPage(1);
      else if (key === 'ArrowLeft' || key === 'ArrowUp') this.turnPage(-1);
      else if (['Escape', 'Q', 'Backspace'].includes(key)) {
        this.cue('back');
        this.closeText();
      }
      return true;
    }
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      this.menu.move(key === 'ArrowUp' ? -1 : 1);
      this.showAbout();
    } else if (key === 'Enter' || key === ' ') {
      const entry = this.entries[this.menu.selected];
      if (!entry) return true;
      if (entry.locked) {
        this.cue('error');
        return true;
      }
      this.cue('confirm');
      this.menu.press(() => this.open(entry));
    } else if ((key === 'Escape' || key === 'Backspace' || key === 'Q') && this.folder !== 'root') {
      this.cue('back');
      this.openFolder('root', 'briefings');
    } else if (key === '`') {
      // Hidden: the developer screen.
      this.cue('confirm');
      this.scene.start('dev');
    } else if (/^[1-4]$/.test(key) && ERAS.at(Number(key) - 1)) {
      // Quick era preview (also in the settings), rebuilt so every text picks up the era's font.
      updateSettings({ eraIndex: Number(key) - 1 });
      this.restartHere();
    } else if (key === 'D' && ERAS.at(getSettings().eraIndex)?.dark) {
      updateSettings({ dark: !getSettings().dark });
      this.restartHere();
    } else return false;
    return true;
  }

  private restartHere(): void {
    const entry = this.entries[this.menu.selected];
    this.scene.restart({ folder: this.folder, selected: entry?.lessonId ?? entry?.action });
  }

  private open(entry: Entry): void {
    const tier = tierOf(getProgress());
    switch (entry.action) {
      case 'continue':
        this.scene.start('board');
        return;
      case 'new':
        // The first campaign goes straight into slot 1; after that, choose a slot.
        if (CAMPAIGN_SLOTS.some((slot) => hasSave(slot))) {
          this.scene.start('saves', { mode: 'new' });
          return;
        }
        newGame('1');
        this.scene.start('board');
        return;
      case 'practice':
        this.scene.start(tier.scene, { practice: true, ...tier.options });
        return;
      case 'saves':
        this.scene.start('saves', { mode: 'load' });
        return;
      case 'briefings':
        return this.openFolder('briefings');
      case 'up':
        return this.openFolder('root', 'briefings');
      case 'lesson':
        this.scene.start('briefing', { lessonId: entry.lessonId });
        return;
      case 'settings':
        this.scene.start('settings');
        return;
      case 'readme':
        return this.openText(README);
      case 'credits':
        return this.openText(CREDITS);
      case 'shutdown':
        return this.shutdown();
    }
  }

  // ---- effects ----

  /**
   * From the intro: the title types itself out, the tagline fades in, the
   * folder's listing command types itself at the prompt, the files appear a
   * line at a time with a key click each, then the lines below fade in. Any
   * key skips to the end.
   */
  private arrive(title: Phaser.GameObjects.Text, tagline: Phaser.GameObjects.Text, fades: Phaser.GameObjects.Text[]): void {
    const name = title.text;
    const command = this.prompt.text;
    const promptEnd = command.length - listCommand(this.era).length;
    const taglineAlpha = tagline.alpha;
    const alphas = fades.map((text) => text.alpha);
    const at = (ms: number, action: () => void) => this.arrival.push(this.time.delayedCall(ms, action));
    title.setText('');
    tagline.setAlpha(0);
    this.prompt.setText('');
    for (const text of fades) text.setAlpha(0);
    this.menu.showRows(0);

    let t = 450;
    for (let typed = 1; typed <= name.length; typed++, t += 110) {
      at(t, () => {
        title.setText(name.slice(0, typed) + (typed < name.length ? '█' : ''));
        this.cue('letter');
      });
    }
    t += 250;
    at(t, () => this.tweens.add({ targets: tagline, alpha: taglineAlpha, duration: 600 }));
    t += 500;
    at(t, () => this.prompt.setText(`${command.slice(0, promptEnd)}█`));
    t += 400;
    for (let typed = promptEnd + 1; typed <= command.length; typed++, t += 120) {
      at(t, () => {
        this.prompt.setText(`${command.slice(0, typed)}█`);
        this.cue('letter');
      });
    }
    t += 300;
    at(t, () => this.prompt.setText(command));
    for (let row = 1; row <= this.entries.length; row++, t += 90) {
      at(t, () => {
        // The last row shows them all, so a folder with more files isn't cut short later.
        this.menu.showRows(row < this.entries.length ? row : Number.POSITIVE_INFINITY);
        this.cue('line');
      });
    }
    at(t, () => fades.forEach((text, i) => this.tweens.add({ targets: text, alpha: alphas[i], duration: 450, delay: i * 120 })));
    at(t + 900, () => (this.finishArrival = undefined));

    this.finishArrival = () => {
      for (const timer of this.arrival) timer.remove();
      this.arrival = [];
      this.tweens.killTweensOf([tagline, ...fades]);
      title.setText(name);
      tagline.setAlpha(taglineAlpha);
      this.prompt.setText(command);
      fades.forEach((text, i) => text.setAlpha(alphas[i]));
      this.menu.showRows(Number.POSITIVE_INFINITY);
      this.finishArrival = undefined;
    };
  }

  /**
   * SHUTDOWN.EXE: the screen turns off and the computer waits at its power
   * button again (the intro). A CRT's picture squeezes to a bright line, the
   * line to a dot, and the dot fades; an LCD's backlight just fades out.
   */
  private shutdown(): void {
    this.off = true;
    const { era } = this;
    stopHum();
    powerOff(this, era);
    const camera = this.cameras.main;
    if (era.computer.display !== 'crt') {
      camera.fadeOut(700, 0, 0, 0);
      camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('boot'));
      return;
    }
    // Black covers grow from the top and bottom edges (scaled about those edges) to meet in the middle.
    const wide = WIDTH + 400;
    const half = HEIGHT / 2 + 100 - 1;
    const top = this.add.rectangle(WIDTH / 2, -100, wide, half, 0x000000).setOrigin(0.5, 0).setScale(1, 0).setDepth(2000);
    const bottom = this.add.rectangle(WIDTH / 2, HEIGHT + 100, wide, half, 0x000000).setOrigin(0.5, 1).setScale(1, 0).setDepth(2000);
    const line = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, 3, era.computer.beam).setDepth(2001).setAlpha(0);
    this.tweens.add({ targets: [top, bottom], scaleY: 1, duration: 220, ease: 'Cubic.In' });
    this.tweens.chain({
      targets: line,
      tweens: [
        { alpha: 1, delay: 200, duration: 40 },
        { scaleX: 0.004, scaleY: 1.6, duration: 260, ease: 'Cubic.In' },
        { alpha: 0, duration: 500, ease: 'Sine.Out' },
      ],
      onComplete: () => this.time.delayedCall(400, () => this.scene.start('boot')),
    });
  }

  /**
   * Dim program code (the contracts' programs, as the intro loaded them)
   * scrolling up both margins, like a terminal left running behind the menu.
   * Each column holds its lines twice and slides up by one copy, over and over.
   */
  private scrollingCode(): void {
    const listing = programListing(hasSave() ? getProgress() : null);
    const shape = this.make.graphics({}, false);
    for (const x of CODE_COLUMNS) shape.fillRect(x, CODE_TOP, CODE_WIDTH, CODE_BOTTOM - CODE_TOP);
    const mask = shape.createGeometryMask();
    CODE_COLUMNS.forEach((x, column) => {
      // More lines than the column shows, each column starting at a different place.
      const block: string[] = [];
      for (let i = 0; block.length < 34; i++) block.push(listing[(i + column * 11) % listing.length]);
      const code = this.textAt(x, CODE_TOP, block.join('\n'), 12).setLineSpacing(4).setAlpha(0.14).setMask(mask);
      const once = code.height;
      code.setText([...block, ...block].join('\n'));
      const loop = code.height - once;
      this.tweens.add({ targets: code, y: CODE_TOP - loop, duration: (loop / CODE_SPEED) * 1000, repeat: -1 });
    });
  }
}
