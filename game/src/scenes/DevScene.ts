import { cheatFlags } from '../cheatFlags.ts';
import { CHIPS, CLOCK, COOLING } from '../data/economy.ts';
import { LESSONS } from '../data/lessons.ts';
import { folderPath } from '../data/menuFiles.ts';
import { TAUGHT_IDS } from '../data/tours.ts';
import { openLesson } from '../flow.ts';
import { formatMhz, formatMoney } from '../format.ts';
import { activeSlot, campaignSlot, getProgress, hasSave, newGame, slotName, switchSlot, updateProgress } from '../save.ts';
import { bitsName, chipOf, fillBoard, fitChip, ratedMhz, tierOf, withEverything, withTier, withWordBits, type Progress } from '../sim/progress.ts';
import { THERMAL } from '../sim/thermal.ts';
import { ListMenu, type MenuRow } from '../ui/list.ts';
import { Screen } from '../ui/screen.ts';

type Row =
  | 'chip' | 'tier' | 'clock' | 'cooling' | 'cache' | 'overclock' | 'wear' | 'money' | 'board' | 'everything'
  | 'lesson' | 'seen' | 'play' | 'practice' | 'autoplay' | 'reset' | 'campaign';

/** The rows in their groups, each with the line shown about it. */
const GROUPS: readonly { readonly name: string; readonly rows: readonly Row[] }[] = [
  { name: "THE DEVELOPER SAVE'S CPU AND MONEY", rows: ['chip', 'tier', 'clock', 'cooling', 'cache', 'overclock', 'wear', 'money', 'board', 'everything'] },
  { name: 'LESSONS', rows: ['lesson', 'seen'] },
  { name: 'PLAY', rows: ['play', 'practice', 'autoplay'] },
  { name: 'START OVER, OR LEAVE', rows: ['reset', 'campaign'] },
];
const ROWS: readonly Row[] = GROUPS.flatMap((group) => group.rows);

const ABOUT: Readonly<Record<Row, string>> = {
  chip: "THE CPU CHIP, WHICH SETS THE ERA (THE LOOK). A NARROWER CHIP TAKES OFF THE PARTS IT CAN'T RUN.",
  tier: 'THE CPU DESIGN: SINGLE-CYCLE, PIPELINE, FORWARDING, GUESSING, PREDICTORS. A TIER MAY NEED A WIDER CHIP.',
  clock: 'CLOCK UPGRADES BOUGHT. A FASTER CLOCK PLAYS SONGS FASTER.',
  cooling: 'HOW WELL THE CHIP SHEDS HEAT WHEN OVERCLOCKED.',
  cache: "THE L1 CACHE: LOADS IT ALREADY HOLDS DON'T WAIT FOR RAM.",
  overclock: 'LETS G / H TURN THE CLOCK DOWN AND UP DURING A SONG.',
  wear: 'HOW WORN THE CHIP IS FROM OVERHEATING: THE HIGHEST CLOCK IT CAN STILL REACH.',
  money: 'MONEY TO SPEND IN THE SHOP.',
  board: "THROWS AWAY THE BOARD'S JOBS AND DEALS NEW ONES.",
  everything: 'THE WIDEST CHIP, THE LAST TIER AND EVERY UPGRADE.',
  lesson: '[LEFT/RIGHT] PICKS A LESSON, [ENTER] OPENS IT: TICK\'S TOUR AND ITS PRACTICE, OR ITS BRIEFING.',
  seen: "LESSONS AND TOURS MARKED SEEN DON'T PLAY BY THEMSELVES. [ENTER] MARKS ALL SEEN OR NONE.",
  play: 'THE CONTRACT BOARD, PLAYING THE DEVELOPER SAVE.',
  practice: 'A PRACTICE SONG ON THIS TIER: NOTES WAIT FOR YOU.',
  autoplay: 'SONGS PLAY THEMSELVES, UNTIL THE PAGE IS RELOADED.',
  reset: 'ERASES THE DEVELOPER SAVE AND STARTS IT OVER: A NEW GAME.',
  campaign: '',
};

/** Rows changed with left / right (the toggles flip either way). */
const STEPPED: ReadonlySet<Row> = new Set(['chip', 'tier', 'clock', 'cooling', 'wear', 'money', 'lesson', 'cache', 'overclock', 'seen', 'autoplay']);
const MONEY_STEPS = [0, 100, 500, 1_000, 5_000, 10_000, 100_000];
const LESSON_IDS = Object.keys(LESSONS);

/** What a save's CPU is, field by field: compared before and after a change, to say what else it changed. */
function hardware(p: Progress): Record<string, string> {
  return {
    CHIP: bitsName(p.wordBits),
    TIER: String(tierOf(p).number),
    CLOCK: `LEVEL ${p.clockLevel}`,
    'L1 CACHE': p.cacheLevels > 0 ? 'ON' : 'OFF',
    OVERCLOCKING: p.overclocking ? 'ON' : 'OFF',
  };
}

/** The field a row itself changes (not worth repeating as a knock-on). */
const OWN: Partial<Record<Row, string>> = { chip: 'CHIP', tier: 'TIER', clock: 'CLOCK', cache: 'L1 CACHE', overclock: 'OVERCLOCKING' };

/**
 * The developer screen (the backquote key on the main menu): the console
 * cheats (cheats.ts) on a screen, plus any lesson, practice and the board.
 * Opening it switches to the developer save, so testing never touches a
 * campaign, and you keep playing that save (its era, its money) until you
 * go back to your campaign from here or load a slot.
 */
export class DevScene extends Screen {
  private menu!: ListMenu;
  private lesson = 0;
  private confirmReset = false;
  private about!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;

  constructor() {
    super('dev');
  }

  init(): void {
    this.confirmReset = false;
  }

  create(data?: { selected?: number; message?: string }): void {
    if (activeSlot() !== 'dev') switchSlot('dev');
    // Saved at once, so the main menu has a save to CONTINUE.
    if (!hasSave('dev')) newGame('dev');
    this.setUp();
    this.header(`DEVELOPER MODE: ${folderPath(this.era, ['DEV'])}`, `YOU PLAY THE DEVELOPER SAVE UNTIL YOU GO BACK TO ${slotName(campaignSlot())}. CAMPAIGNS AREN'T TOUCHED.`);
    this.menu = new ListMenu(this, this.era, { x: 190, top: 100, width: 580, rowHeight: 18, size: 14 });
    this.menu.setRows(this.rows(), data?.selected ?? 0);
    this.about = this.aboutLine();
    this.message = this.messageLine().setText(data?.message ?? '');
    this.hints('[UP/DOWN] CHOOSE', '[LEFT/RIGHT] CHANGE', '[ENTER] DO IT', '[Q] MAIN MENU');
    this.showAbout();
  }

  private rows(): MenuRow[] {
    const p = getProgress();
    const tier = tierOf(p);
    const onOff = (on: boolean) => (on ? 'ON' : 'OFF');
    const values: Record<Row, [string, string?]> = {
      chip: ['CPU CHIP (SETS THE ERA)', bitsName(p.wordBits)],
      tier: ['CPU TIER', `${tier.number}: ${tier.name}`],
      clock: ['CLOCK UPGRADES', `LEVEL ${p.clockLevel}: ${formatMhz(ratedMhz(p))}`],
      cooling: ['COOLER', COOLING[p.cooling].name],
      cache: ['L1 CACHE', onOff(p.cacheLevels > 0)],
      overclock: ['OVERCLOCKING UPGRADE', onOff(p.overclocking)],
      wear: ['CHIP WEAR', `MAX CLOCK ${Math.round(p.chipMaxDial * 100)}%`],
      money: ['MONEY', formatMoney(p.money)],
      board: ['DEAL NEW CONTRACTS'],
      everything: ['UNLOCK EVERYTHING'],
      lesson: ['OPEN LESSON', LESSONS[LESSON_IDS[this.lesson]].title.slice(0, 40)],
      seen: ['LESSONS AND TOURS SEEN', `${p.seenLessons.length} OF ${TAUGHT_IDS.length}`],
      play: ['PLAY: CONTRACT BOARD'],
      practice: ['PRACTICE THIS TIER'],
      autoplay: ['AUTOPLAY SONGS', onOff(cheatFlags.autoplay)],
      reset: [this.confirmReset ? 'RESET: PRESS ENTER AGAIN' : 'RESET THE DEVELOPER SAVE'],
      campaign: [`BACK TO YOUR CAMPAIGN (${slotName(campaignSlot())})`],
    };
    const firsts = new Map(GROUPS.map((group) => [group.rows[0], group.name]));
    return ROWS.map((row) => ({ label: values[row][0], value: values[row][1], group: firsts.get(row) }));
  }

  private showAbout(): void {
    const row = ROWS[this.menu.selected];
    const about = row === 'campaign' ? `STOP PLAYING THE DEVELOPER SAVE: THE MAIN MENU, WITH ${slotName(campaignSlot())} AND ITS ERA.` : ABOUT[row];
    this.about.setText(STEPPED.has(row) && row !== 'lesson' && row !== 'seen' ? `${about}  [LEFT/RIGHT]` : about);
  }

  private refresh(): void {
    this.menu.setRows(this.rows());
    this.showAbout();
  }

  protected onKey(key: string): boolean | void {
    if (this.menu.busy) return true;
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      this.confirmReset = false;
      this.message.setText('');
      this.menu.move(key === 'ArrowUp' ? -1 : 1);
      this.refresh();
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      this.step(ROWS[this.menu.selected], key === 'ArrowLeft' ? -1 : 1);
    } else if (key === 'Enter' || key === ' ') {
      this.cue('confirm');
      this.menu.press(() => this.choose(ROWS[this.menu.selected]));
    } else if (key === 'Escape' || key === 'Q') {
      // The main menu, still playing the developer save.
      this.back();
    } else return false;
    return true;
  }

  /** Changes the save, says what else the change had to change, and redraws (in the new era if the chip changed). */
  private edit(row: Row, change: (p: Progress) => Progress): void {
    const before = hardware(getProgress());
    const after = hardware(updateProgress(change));
    // Unlocking everything changes everything: nothing to point out.
    const knockOn = row === 'everything' ? [] : Object.keys(after).filter((field) => field !== OWN[row] && after[field] !== before[field]);
    const message = knockOn.length > 0 ? `ALSO CHANGED: ${knockOn.map((field) => `${field} ${before[field]} -> ${after[field]}`).join(', ')}` : '';
    this.cue('move');
    // A different chip is a different era: the screen is rebuilt in its look.
    if (this.eraChanged()) {
      this.scene.restart({ selected: this.menu.selected, message });
      return;
    }
    this.message.setText(message);
    this.refresh();
  }

  /** Left / right: a setting one step down or up, or a toggle flipped. */
  private step(row: Row, delta: number): void {
    const clampInt = (n: number, max: number) => Math.max(0, Math.min(max, n));
    switch (row) {
      case 'chip':
        // A narrower chip takes off the parts it can't run and lowers the clock to its top step.
        return this.edit(row, (p) => {
          const at = CHIPS.indexOf(chipOf(p));
          return withWordBits(p, CHIPS[clampInt(at + delta, CHIPS.length - 1)].bits);
        });
      case 'tier':
        // A tier or clock the chip can't run fits the chip that can.
        return this.edit(row, (p) => withTier(p, Phaser.Math.Clamp(tierOf(p).number + delta, 1, 6)));
      case 'clock':
        return this.edit(row, (p) => fitChip({ ...p, clockLevel: clampInt(p.clockLevel + delta, CLOCK.factors.length - 1) }));
      case 'money':
        return this.edit(row, (p) => {
          const next = delta > 0 ? MONEY_STEPS.find((m) => m > p.money) : [...MONEY_STEPS].reverse().find((m) => m < p.money);
          return { ...p, money: next ?? p.money };
        });
      case 'cooling':
        return this.edit(row, (p) => ({ ...p, cooling: clampInt(p.cooling + delta, COOLING.length - 1) }));
      case 'wear':
        return this.edit(row, (p) => ({ ...p, chipMaxDial: Phaser.Math.Clamp(Math.round((p.chipMaxDial + delta * THERMAL.damagePerOverheat) * 100) / 100, 1, THERMAL.maxDial) }));
      case 'lesson':
        this.lesson = Phaser.Math.Wrap(this.lesson + delta, 0, LESSON_IDS.length);
        this.cue('move');
        return this.refresh();
      case 'cache':
      case 'overclock':
      case 'seen':
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
        return this.edit(row, (p) => ({ ...p, cacheLevels: p.cacheLevels > 0 ? 0 : 1 }));
      case 'overclock':
        return this.edit(row, (p) => ({ ...p, overclocking: !p.overclocking }));
      case 'everything':
        return this.edit(row, withEverything);
      case 'board':
        this.edit(row, (p) => fillBoard({ ...p, board: [] }, Math.random));
        this.message.setText('NEW CONTRACTS ON THE BOARD.');
        return;
      case 'seen':
        return this.edit(row, (p) => ({ ...p, seenLessons: p.seenLessons.length < TAUGHT_IDS.length ? TAUGHT_IDS : [] }));
      case 'autoplay':
        cheatFlags.autoplay = !cheatFlags.autoplay;
        this.cue('move');
        return this.refresh();
      case 'lesson':
        openLesson(this, LESSON_IDS[this.lesson]);
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
        if (this.eraChanged()) {
          this.scene.restart({ selected: this.menu.selected, message: 'THE DEVELOPER SAVE STARTED OVER.' });
          return;
        }
        this.message.setText('THE DEVELOPER SAVE STARTED OVER.');
        return this.refresh();
      case 'campaign':
        switchSlot(campaignSlot());
        this.back();
        return;
      default:
        return this.step(row, 1);
    }
  }
}
