import { cheatFlags } from '../cheatFlags.ts';
import { CHIPS, CLOCK, COOLING } from '../data/economy.ts';
import { LESSONS } from '../data/lessons.ts';
import { folderPath } from '../data/menuFiles.ts';
import { formatMhz, formatMoney } from '../format.ts';
import { activeSlot, getProgress, newGame, slotName, switchSlot, updateProgress, type SlotId } from '../save.ts';
import { bitsName, chipOf, fillBoard, fitChip, ratedMhz, tierOf, withEverything, withTier, withWordBits, type Progress } from '../sim/progress.ts';
import { THERMAL } from '../sim/thermal.ts';
import { ListMenu, type MenuRow } from '../ui/list.ts';
import { Screen } from '../ui/screen.ts';

type Row =
  | 'chip' | 'tier' | 'clock' | 'money' | 'cooling' | 'cache' | 'overclock' | 'wear' | 'everything' | 'board' | 'lessons' | 'autoplay'
  | 'briefing' | 'practice' | 'play' | 'reset' | 'back';
const ROWS: readonly Row[] = [
  'chip', 'tier', 'clock', 'money', 'cooling', 'cache', 'overclock', 'wear', 'everything', 'board', 'lessons', 'autoplay', 'briefing', 'practice', 'play', 'reset', 'back',
];
const MONEY_STEPS = [0, 100, 500, 1_000, 5_000, 10_000, 100_000];
const LESSON_IDS = Object.keys(LESSONS);

/** The campaign slot to go back to when leaving the developer save (kept while the page is open). */
let returnSlot: SlotId | undefined;

/**
 * The developer screen (the backquote key on the main menu): the console
 * cheats (cheats.ts) on a screen, plus any briefing, practice and the board.
 * It plays its own save, so testing never touches a campaign; BACK returns to
 * the slot you came from.
 */
export class DevScene extends Screen {
  private menu!: ListMenu;
  private lesson = 0;
  private confirmReset = false;
  private about!: Phaser.GameObjects.Text;

  constructor() {
    super('dev');
  }

  init(): void {
    this.confirmReset = false;
  }

  create(data?: { selected?: number }): void {
    if (activeSlot() !== 'dev') {
      returnSlot = activeSlot();
      switchSlot('dev');
    }
    this.setUp();
    this.header(`DEVELOPER MODE: ${folderPath(this.era, ['DEV'])}`, 'A SEPARATE SAVE FOR TESTING: NOTHING HERE TOUCHES YOUR CAMPAIGN SLOTS.');
    this.menu = new ListMenu(this, this.era, { x: 190, top: 94, width: 580, rowHeight: 21, size: 15 });
    this.menu.setRows(this.rows(), data?.selected ?? 0);
    this.about = this.aboutLine();
    this.hints('[UP/DOWN] CHOOSE', '[LEFT/RIGHT] CHANGE', '[ENTER] DO IT', '[Q] BACK');
    this.showAbout();
  }

  private rows(): MenuRow[] {
    const p = getProgress();
    const tier = tierOf(p);
    const onOff = (on: boolean) => (on ? 'ON' : 'OFF');
    const values: Record<Row, [string, string?]> = {
      chip: ['CPU CHIP (ERA)', bitsName(p.wordBits)],
      tier: ['CPU TIER', `${tier.number}: ${tier.name}`],
      clock: ['CLOCK UPGRADES', `LEVEL ${p.clockLevel}: ${formatMhz(ratedMhz(p))}`],
      money: ['MONEY', formatMoney(p.money)],
      cooling: ['COOLER', COOLING[p.cooling].name],
      cache: ['L1 CACHE', onOff(p.cacheLevels > 0)],
      overclock: ['OVERCLOCKING UPGRADE', onOff(p.overclocking)],
      wear: ['CHIP WEAR', `MAX CLOCK ${Math.round(p.chipMaxDial * 100)}%`],
      everything: ['UNLOCK EVERYTHING'],
      board: ['NEW CONTRACTS'],
      lessons: ['BRIEFINGS READ', `${p.seenLessons.length} OF ${LESSON_IDS.length}`],
      autoplay: ['AUTOPLAY SONGS', onOff(cheatFlags.autoplay)],
      briefing: ['OPEN BRIEFING', LESSONS[LESSON_IDS[this.lesson]].title.slice(0, 40)],
      practice: ['PRACTICE THIS TIER'],
      play: ['PLAY: CONTRACT BOARD'],
      reset: [this.confirmReset ? 'RESET: PRESS ENTER AGAIN' : 'RESET THE DEVELOPER SAVE'],
      back: ['BACK TO YOUR CAMPAIGN'],
    };
    return ROWS.map((row) => ({ label: values[row][0], value: values[row][1] }));
  }

  private showAbout(): void {
    const row = ROWS[this.menu.selected];
    const steps = ['chip', 'tier', 'clock', 'money', 'cooling', 'wear', 'briefing'].includes(row);
    this.about.setText(steps ? '[LEFT/RIGHT] TO CHANGE' : row === 'back' ? `BACK TO THE MAIN MENU, PLAYING ${slotName(returnSlot ?? '1')} AGAIN.` : '');
  }

  private refresh(): void {
    this.menu.setRows(this.rows());
    this.showAbout();
  }

  protected onKey(key: string): boolean | void {
    if (this.menu.busy) return true;
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      this.confirmReset = false;
      this.menu.move(key === 'ArrowUp' ? -1 : 1);
      this.refresh();
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      this.step(ROWS[this.menu.selected], key === 'ArrowLeft' ? -1 : 1);
    } else if (key === 'Enter' || key === ' ') {
      this.cue('confirm');
      this.menu.press(() => this.choose(ROWS[this.menu.selected]));
    } else if (key === 'Escape' || key === 'Q') {
      this.leave();
    } else return false;
    return true;
  }

  private edit(change: (p: Progress) => Progress): void {
    updateProgress(change);
    this.cue('move');
    // A different chip is a different era: the screen is rebuilt in its look.
    if (this.eraChanged()) this.scene.restart({ selected: this.menu.selected });
    else this.refresh();
  }

  /** Left / right: a setting one step down or up. */
  private step(row: Row, delta: number): void {
    const clampInt = (n: number, max: number) => Math.max(0, Math.min(max, n));
    switch (row) {
      case 'chip':
        // A narrower chip takes off the parts it can't run and lowers the clock to its top step.
        return this.edit((p) => {
          const at = CHIPS.indexOf(chipOf(p));
          return withWordBits(p, CHIPS[clampInt(at + delta, CHIPS.length - 1)].bits);
        });
      case 'tier':
        // A tier or clock the chip can't run fits the chip that can.
        return this.edit((p) => withTier(p, Phaser.Math.Clamp(tierOf(p).number + delta, 1, 6)));
      case 'clock':
        return this.edit((p) => fitChip({ ...p, clockLevel: clampInt(p.clockLevel + delta, CLOCK.factors.length - 1) }));
      case 'money':
        return this.edit((p) => {
          const next = delta > 0 ? MONEY_STEPS.find((m) => m > p.money) : [...MONEY_STEPS].reverse().find((m) => m < p.money);
          return { ...p, money: next ?? p.money };
        });
      case 'cooling':
        return this.edit((p) => ({ ...p, cooling: clampInt(p.cooling + delta, COOLING.length - 1) }));
      case 'wear':
        return this.edit((p) => ({ ...p, chipMaxDial: Phaser.Math.Clamp(Math.round((p.chipMaxDial + delta * THERMAL.damagePerOverheat) * 100) / 100, 1, THERMAL.maxDial) }));
      case 'briefing':
        this.lesson = Phaser.Math.Wrap(this.lesson + delta, 0, LESSON_IDS.length);
        this.cue('move');
        return this.refresh();
      case 'cache':
      case 'overclock':
      case 'lessons':
      case 'autoplay':
        return this.choose(row);
      default:
        return;
    }
  }

  private choose(row: Row): void {
    const tier = tierOf(getProgress());
    switch (row) {
      case 'cache':
        return this.edit((p) => ({ ...p, cacheLevels: p.cacheLevels > 0 ? 0 : 1 }));
      case 'overclock':
        return this.edit((p) => ({ ...p, overclocking: !p.overclocking }));
      case 'everything':
        return this.edit(withEverything);
      case 'board':
        return this.edit((p) => fillBoard({ ...p, board: [] }, Math.random));
      case 'lessons':
        return this.edit((p) => ({ ...p, seenLessons: p.seenLessons.length < LESSON_IDS.length ? LESSON_IDS : [] }));
      case 'autoplay':
        cheatFlags.autoplay = !cheatFlags.autoplay;
        return this.refresh();
      case 'briefing':
        this.scene.start('briefing', { lessonId: LESSON_IDS[this.lesson] });
        return;
      case 'practice':
        this.scene.start(tier.scene, { practice: true, ...tier.options });
        return;
      case 'play':
        this.scene.start('board');
        return;
      case 'reset':
        if (!this.confirmReset) {
          this.confirmReset = true;
          this.cue('error');
          return this.refresh();
        }
        this.confirmReset = false;
        newGame('dev');
        return this.refresh();
      case 'back':
        return this.leave();
      default:
        return this.step(row, 1);
    }
  }

  /** Back to the main menu, playing the campaign slot you came from. */
  private leave(): void {
    switchSlot(returnSlot ?? '1');
    returnSlot = undefined;
    this.back();
  }
}
