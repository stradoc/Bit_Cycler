import { powerOff, stopHum } from '../audio/sound.ts';
import { programListing } from '../data/boot.ts';
import { isWip, LESSONS } from '../data/lessons.ts';
import { BOARD_TOUR_ID, CALENDAR_TOUR_ID, FIRST_DAY_ID, WELCOME_TOUR, type MenuTarget } from '../data/tours.ts';
import { openLesson } from '../flow.ts';
import { banner, commandLine, CREDITS, listCommand, listingFooter, listingLine, readCommand, README, type TextFile } from '../data/menuFiles.ts';
import { formatMoney, wipLabel } from '../format.ts';
import { activeSlot, CAMPAIGN_SLOTS, getProgress, hasSave, newGame, slotName } from '../save.ts';
import { getSettings, updateSettings } from '../settings.ts';
import { skillReport } from '../rhythm/skills.ts';
import { cpuLine, hasSeen, tierOf } from '../sim/progress.ts';
import { baseEra, cssColor } from '../ui/eras.ts';
import { Guide, type Rect } from '../ui/guide.ts';
import { ListMenu } from '../ui/list.ts';
import { Screen } from '../ui/screen.ts';
import { ALPHA, LAYOUT } from '../ui/theme.ts';
import { HEIGHT, WIDTH } from '../visual/display.ts';
import { TitleLogo } from '../visual/title3d.ts';

/** What a file on the menu's disk does when opened. */
type Action = 'continue' | 'new' | 'practice' | 'saves' | 'briefings' | 'settings' | 'readme' | 'report' | 'credits' | 'shutdown' | 'up' | 'lesson' | 'welcome' | 'boardTour' | 'firstDay' | 'calendarTour';

/** One file or folder in a listing (a folder has no extension). */
type Entry = {
  readonly action: Action;
  readonly name: string;
  readonly ext: string;
  readonly note: string;
  readonly about: string;
  /** For a lesson: its id. */
  readonly lessonId?: string;
  /** Shown on the right (a lesson's SEEN / NEW). */
  readonly value?: string;
  readonly locked?: boolean;
};

type Folder = 'root' | 'briefings';
const FOLDER_PATH: Readonly<Record<Folder, readonly string[]>> = { root: [], briefings: ['BRIEFS'] };

const LIST_X = 230;
const LIST_TOP = 172;
const ROW_H = 26;
/** BRIEFS holds more files: its rows are closer together. */
const BRIEFS_ROW_H = 16.5;
/** The lowest row's middle, above the listing's footer: a longer folder scrolls. */
const LIST_BOTTOM = 430;
/** The code in the margins scrolls up this fast (layout pixels a second). */
const CODE_SPEED = 14;
/** The margins' code columns: their left edges, and the band they show in. */
const CODE_COLUMNS = [24, 740];
const CODE_TOP = 24;
const CODE_BOTTOM = 430;
const CODE_WIDTH = 196;
/** The game's name, as the 3D title spells it, and where it hovers. */
const TITLE = { word: 'BIT CYCLER', x: WIDTH / 2, y: 60 };

/**
 * The main menu, as the game's own disk: programs to run (continue, a new
 * campaign, practice, shut down), folders to open (saves, BRIEFS: TICK's lessons), the
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
  /** TICK, who welcomes a new player (once per computer, or from BRIEFS). */
  private guide!: Guide;
  /** The welcome plays once the menu has arrived. */
  private welcomeDue = false;
  /** The game's name in 3D, hovering at the top. */
  private logo!: TitleLogo;

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

  /** `welcome`: TICK's welcome plays again (BRIEFS). */
  create(data?: { selected?: string; folder?: Folder; welcome?: boolean }): void {
    this.welcomeDue = (data?.welcome ?? false) || !getSettings().welcomed;
    this.setUp({ glow: 'menu' });
    const { era } = this;
    this.scrollingCode();
    this.logo = new TitleLogo(this, era, TITLE.x, TITLE.y, TITLE.word);
    const tagline = this.text(WIDTH / 2, 106, 'A CPU TYCOON WHERE EVERY BEAT IS ONE CLOCK CYCLE', 13).setAlpha(ALPHA.subtitle);
    this.prompt = this.text(LIST_X, 138, '', 15).setOrigin(0, 0.5);
    this.menu = new ListMenu(this, era, { x: LIST_X, top: LIST_TOP, width: 500, rowHeight: ROW_H, size: 16, bottom: LIST_BOTTOM });
    // Block letters close up (no line spacing), so their half blocks join into whole letters.
    this.viewerTitle = this.textAt(LIST_X, LIST_TOP - 18, '', 16).setLineSpacing(0).setColor(cssColor(era.accent)).setVisible(false);
    this.viewer = this.textAt(LIST_X, LIST_TOP + 46, '', 16).setLineSpacing(6).setVisible(false);
    this.footer = this.text(LIST_X, 446, '', 14).setOrigin(0, 0.5).setAlpha(0.7);
    this.about = this.aboutLine();
    const status = this.text(WIDTH / 2, LAYOUT.message, this.statusLine(), 14).setAlpha(0.65);
    const hints = this.hints('[UP/DOWN] CHOOSE', '[ENTER] OPEN', '[Q] BACK', '[M] COMPUTER HUM');
    this.lower = [status, hints];
    this.openFolder(this.welcomeDue ? 'root' : (data?.folder ?? 'root'), data?.selected);
    this.guide = new Guide(this, era);

    if (this.fromBoot) {
      this.cameras.main.fadeIn(300, 0, 0, 0);
      this.arrive(tagline, [this.footer, this.about, status, hints]);
    } else {
      this.welcomeIfDue();
    }
  }

  update(time: number, delta: number): void {
    super.update();
    this.logo.update(time, delta);
    this.guide.update(performance.now());
  }

  /** TICK's welcome, if it's due: what the game is for, and where things are. */
  private welcomeIfDue(): void {
    if (!this.welcomeDue) return;
    this.welcomeDue = false;
    if (this.folder !== 'root' || this.reading) this.openFolder('root');
    // How much to teach is asked at the first job (data/tours.ts TUTORIAL_QUESTION).
    this.guide.tour(WELCOME_TOUR, (target) => this.where(target), () => updateSettings({ welcomed: true }));
  }

  /** Where the main menu's entries are, for TICK to point at (the rows from the first entry named to the last). */
  private where(target: MenuTarget): Rect | undefined {
    const actions: Readonly<Record<MenuTarget, readonly Action[]>> = {
      menu: this.entries.map((entry) => entry.action),
      new: ['continue', 'new'],
      briefs: ['briefings'],
      readme: ['settings', 'readme'],
      settings: ['settings'],
    };
    const rows = this.entries.flatMap((entry, i) => (actions[target].includes(entry.action) ? [i] : []));
    if (rows.length === 0) return undefined;
    const top = this.menu.rowY(Math.min(...rows)) - ROW_H / 2;
    const bottom = this.menu.rowY(Math.max(...rows)) + ROW_H / 2;
    return { x: LIST_X - 14, y: top, w: 528, h: bottom - top };
  }

  private statusLine(): string {
    if (!hasSave()) return 'NO SAVE YET: RUN NEWGAME';
    const progress = getProgress();
    return `${slotName(activeSlot())}: ${formatMoney(progress.money)}   ${cpuLine(progress)}`;
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
      { action: 'briefings', name: 'BRIEFS', ext: '', note: `${read} OF ${Object.keys(LESSONS).length} SEEN`, about: "EVERY LESSON TICK GIVES, TO PLAY AGAIN WHENEVER YOU LIKE." },
      { action: 'settings', name: 'SETTINGS', ext: 'CFG', note: 'DIFFICULTY, SOUND, SCREEN', about: 'THE DIFFICULTY (HOW FAST SONGS GO), AUDIO CALIBRATION, VOLUME, SCREEN EFFECTS AND DARK MODE.' },
      { action: 'readme', name: 'README', ext: 'TXT', note: 'HOW TO PLAY', about: 'HOW TO PLAY, A PAGE AT A TIME.' },
      { action: 'report', name: 'REPORT', ext: 'TXT', note: 'YOUR CALLS, JOB BY JOB', about: "HOW OFTEN YOU MAKE THE CONTROL UNIT'S CALLS RIGHT: ROUTING, HAZARDS, BRANCHES." },
      { action: 'credits', name: 'CREDITS', ext: 'TXT', note: 'MADE BY, FONTS, LICENSES', about: 'WHO MADE WHAT.' },
      { action: 'shutdown', name: 'SHUTDOWN', ext: 'EXE', note: 'POWER OFF', about: 'TURN THE COMPUTER OFF.' },
    ];
  }

  /** BRIEFS: TICK's welcome, the board's tour and every lesson, all open, to play again. */
  private briefingEntries(): Entry[] {
    const progress = getProgress();
    const seen = (yes: boolean) => (yes ? 'SEEN' : 'NEW');
    const lessons = Object.values(LESSONS).map(
      (lesson): Entry => ({
        action: 'lesson',
        lessonId: lesson.id,
        name: lesson.id.toUpperCase().slice(0, 8),
        ext: 'EXE',
        note: wipLabel(lesson.title.replace(/^LESSON \d+: /, ''), isWip(lesson.id)).slice(0, 26),
        value: seen(progress.seenLessons.includes(lesson.id)),
        about: lesson.practice ? `TICK TEACHES ${lesson.title} ON THE SONG SCREEN, THEN A PRACTICE.` : `TICK EXPLAINS ${lesson.title} ON THE SONG SCREEN.`,
      }),
    );
    return [
      { action: 'up', name: '..', ext: '', note: 'BACK', about: 'BACK TO THE MAIN FOLDER.' },
      { action: 'welcome', name: 'WELCOME', ext: 'EXE', note: 'WHAT THIS GAME IS FOR', value: seen(getSettings().welcomed), about: "TICK'S WELCOME: WHAT THE GAME TEACHES, AND WHERE TO FIND THINGS." },
      { action: 'boardTour', name: 'BOARD', ext: 'EXE', note: 'THE CONTRACT BOARD', value: seen(hasSeen(progress, BOARD_TOUR_ID)), about: 'TICK SHOWS YOU AROUND THE CONTRACT BOARD.' },
      { action: 'firstDay', name: 'WORKDAY', ext: 'EXE', note: 'YOUR FIRST DAY', value: seen(hasSeen(progress, FIRST_DAY_ID)), about: 'TICK ON THE WORKDAY: JOB GRADES, THE HOURS, LATER JOBS, LOGGING OFF.' },
      { action: 'calendarTour', name: 'CALENDAR', ext: 'EXE', note: 'THE CALENDAR', value: seen(hasSeen(progress, CALENDAR_TOUR_ID)), about: 'TICK SHOWS YOU AROUND THE CALENDAR.' },
      ...lessons,
    ];
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
    // BRIEFS has more files than the main folder: a list with closer rows.
    const rowHeight = folder === 'root' ? ROW_H : BRIEFS_ROW_H;
    if (this.menu.rowHeight !== rowHeight) {
      this.menu.destroy();
      this.menu = new ListMenu(this, era, { x: LIST_X, top: LIST_TOP, width: 500, rowHeight, size: 16, bottom: LIST_BOTTOM });
    }
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
    this.about.setText(pages > 1 ? `PAGE ${this.page + 1} OF ${pages}   [LEFT/RIGHT] TURN THE PAGE   [Q] CLOSE` : '[Q] OR [ENTER] CLOSE');
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

  protected onKey(key: string, event: KeyboardEvent): boolean | void {
    if (this.menu.busy || this.off) return true;
    // A key while the menu is still arriving just shows all of it.
    if (this.finishArrival) {
      this.finishArrival();
      return true;
    }
    // TICK's welcome: Enter shows the rest of the words, then goes on.
    if (this.guide.waiting) {
      if (key === 'Enter' && !event.repeat) this.guide.next();
      else if (key === 'ArrowUp' || key === 'ArrowDown') this.guide.move(key === 'ArrowUp' ? -1 : 1);
      return key !== 'M';
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
    } else if (key === 'D' && baseEra().dark) {
      // Dark mode (also in the settings), rebuilt so every text picks up the new colors.
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
        if (entry.lessonId) openLesson(this, entry.lessonId, { scene: 'title', data: { folder: 'briefings', selected: entry.lessonId } });
        return;
      case 'welcome':
        this.scene.restart({ welcome: true });
        return;
      case 'boardTour':
        this.scene.start('board', { tour: BOARD_TOUR_ID });
        return;
      case 'firstDay':
        this.scene.start('board', { tour: FIRST_DAY_ID });
        return;
      case 'calendarTour':
        this.scene.start('calendar', { tour: true });
        return;
      case 'settings':
        this.scene.start('settings');
        return;
      case 'readme':
        return this.openText(README);
      case 'report':
        return this.openText(skillReport(hasSave() ? getProgress().skills : []));
      case 'credits':
        return this.openText(CREDITS);
      case 'shutdown':
        return this.shutdown();
    }
  }

  // ---- effects ----

  /**
   * From the intro: the 3D title types itself out, the tagline fades in, the
   * folder's listing command types itself at the prompt, the files appear a
   * line at a time with a key click each, then the lines below fade in. Any
   * key skips to the end.
   */
  private arrive(tagline: Phaser.GameObjects.Text, fades: Phaser.GameObjects.Text[]): void {
    const name = TITLE.word;
    const command = this.prompt.text;
    const promptEnd = command.length - listCommand(this.era).length;
    const taglineAlpha = tagline.alpha;
    const alphas = fades.map((text) => text.alpha);
    const at = (ms: number, action: () => void) => this.arrival.push(this.time.delayedCall(ms, action));
    this.logo.show(0, true);
    tagline.setAlpha(0);
    this.prompt.setText('');
    for (const text of fades) text.setAlpha(0);
    this.menu.showRows(0);

    let t = 450;
    for (let typed = 1; typed <= name.length; typed++, t += 110) {
      at(t, () => {
        this.logo.show(typed, typed < name.length);
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
    at(t + 900, () => {
      this.finishArrival = undefined;
      this.welcomeIfDue();
    });

    this.finishArrival = () => {
      for (const timer of this.arrival) timer.remove();
      this.arrival = [];
      this.tweens.killTweensOf([tagline, ...fades]);
      this.logo.show(name.length);
      tagline.setAlpha(taglineAlpha);
      this.prompt.setText(command);
      fades.forEach((text, i) => text.setAlpha(alphas[i]));
      this.menu.showRows(Number.POSITIVE_INFINITY);
      this.finishArrival = undefined;
      this.welcomeIfDue();
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
