import { cheatFlags } from '../cheatFlags.ts';
import { CHIPS, CLOCK, COOLING, MEMORY_PARTS, REPUTATION } from '../data/economy.ts';
import { reputationLine } from '../sim/reputation.ts';
import { isWip, LESSONS } from '../data/lessons.ts';
import { TIERS } from '../data/tiers.ts';
import { folderPath } from '../data/menuFiles.ts';
import { TAUGHT_IDS } from '../data/tours.ts';
import { openLesson } from '../flow.ts';
import { formatHours, formatMhz, formatMoney, wipLabel } from '../format.ts';
import { activeSlot, getProgress, hasSave, newGame, slotName, updateProgress } from '../save.ts';
import { bitsName, cacheOf, chipOf, deepActive, fillBoard, fitChip, lowerCachesOf, ratedMhz, tierOf, withEverything, withTier, withWordBits, type Progress } from '../sim/progress.ts';
import { cacheBytes } from '../sim/memory.ts';
import { dateLine, DAY_SECONDS, endDay } from '../sim/workday.ts';
import { ListMenu, type MenuRow } from '../ui/list.ts';
import { Screen } from '../ui/screen.ts';
import { LAYOUT } from '../ui/theme.ts';

type Row =
  | 'chip' | 'tier' | 'clock' | 'deep' | 'cooling' | 'cache' | 'overclock' | 'money' | 'reputation' | 'marks' | 'time' | 'endday' | 'board' | 'everything'
  | 'lesson' | 'seen' | 'play' | 'practice' | 'autoplay' | 'motions' | 'reset';

/** The rows in their groups (the first named after the save being changed), each with the line shown about it. */
const GROUPS: readonly { readonly name: (slot: string) => string; readonly rows: readonly Row[] }[] = [
  { name: (slot) => `YOUR SAVE (${slot}): CPU, MONEY AND DAY`, rows: ['chip', 'tier', 'clock', 'deep', 'cooling', 'cache', 'overclock', 'money', 'reputation', 'marks', 'time', 'endday', 'board', 'everything'] },
  { name: () => 'LESSONS AND PLAY', rows: ['lesson', 'seen', 'play', 'practice', 'autoplay', 'motions'] },
  { name: () => 'START OVER', rows: ['reset'] },
];
const ROWS: readonly Row[] = GROUPS.flatMap((group) => group.rows);

const ABOUT: Readonly<Record<Row, string>> = {
  chip: "THE CPU CHIP, WHICH SETS THE ERA (THE LOOK). A NARROWER CHIP TAKES OFF THE PARTS IT CAN'T RUN.",
  tier: 'THE CPU DESIGN: SINGLE-CYCLE, PIPELINE, FORWARDING, GUESSING, PREDICTORS. A TIER MAY NEED A WIDER CHIP.',
  clock: 'CLOCK UPGRADES BOUGHT. A FASTER CLOCK PLAYS SONGS FASTER.',
  cooling: 'HOW WELL THE CHIP SHEDS HEAT WHEN OVERCLOCKED.',
  cache: "THE CACHES: LOADS THEY ALREADY HOLD DON'T WAIT FOR RAM. [LEFT/RIGHT] STEPS THROUGH THE L1, THE L2 AND THE L3, EACH AT EVERY SIZE.",
  overclock: 'LETS G / H TURN THE CLOCK DOWN AND UP DURING A SONG.',
  deep: 'NOT BOUGHT, OFF OR ON: A FASTER CLOCK, BUT A WRONG GUESS COSTS MORE. IN USE FROM TIER 4, ON THE 32-BIT CHIP.',
  money: 'MONEY TO SPEND IN THE SHOP.',
  reputation: 'JOBS DONE ON TIME (GOOD): [LEFT/RIGHT] STEPS THROUGH THE LEVELS, EACH PAYING MORE.',
  marks: 'BAD MARKS FROM LATE JOBS: EACH CUTS PAY 5% (NOT BELOW NORMAL IN THE FIRST WEEK). ONE FADES PER JOB ON TIME AND PER DAY.',
  time: 'HOURS OF TODAY ALREADY WORKED (THE DAY ENDS AT 8). JOBS THAT NO LONGER FIT TODAY SAY LATER.',
  endday: "LOGS OFF: TODAY'S TIMECARD IS KEPT, AND THE NEXT MORNING DEALS NEW OFFERS.",
  board: "THROWS AWAY THE BOARD'S JOBS AND DEALS NEW ONES.",
  everything: 'THE WIDEST CHIP, THE LAST TIER AND EVERY UPGRADE.',
  lesson: "[LEFT/RIGHT] PICKS A LESSON, [ENTER] PLAYS IT: TICK'S TOUR, THEN ITS PRACTICE IF IT HAS ONE.",
  seen: "LESSONS AND TOURS MARKED SEEN DON'T PLAY BY THEMSELVES. [ENTER] MARKS ALL SEEN, OR NONE (AND PRACTICE'S TIPS UNSEEN).",
  play: 'THE CONTRACT BOARD, WITH YOUR SAVE AS IT IS NOW.',
  practice: 'A PRACTICE SONG ON THIS TIER: NOTES WAIT FOR YOU.',
  autoplay: 'SONGS PLAY THEMSELVES, UNTIL THE PAGE IS RELOADED.',
  motions: 'EVERY ANIMATION PLAYED ON A SAMPLE, IN ANY ERA: TO SEE A NEW OR CHANGED ONE BESIDE THE OTHERS.',
  reset: 'ERASES THIS SAVE AND STARTS IT OVER AS A NEW GAME. TO KEEP IT, EXPORT IT FIRST (SAVES, ON THE MAIN MENU).',
};

/** Rows changed with left / right (the toggles flip either way). */
const MONEY_STEPS = [0, 100, 500, 1_000, 5_000, 10_000, 100_000];
const LESSON_IDS = Object.keys(LESSONS);

/**
 * The caches the cache row steps through: none; then each level (the L1, the
 * L2 behind it, the L3 behind both), first as bought and then at each of its
 * size steps alone; then everything at full size. `levels` counts
 * MEMORY_PARTS owned, `sizes` is Progress.cacheSizes.
 */
const NO_SIZES = MEMORY_PARTS.map(() => 0);
const CACHE_STEPS: readonly { readonly levels: number; readonly sizes: readonly number[] }[] = [
  { levels: 0, sizes: NO_SIZES },
  ...MEMORY_PARTS.flatMap((part, level) => [
    { levels: level + 1, sizes: NO_SIZES },
    ...part.sizes.map((_, step) => ({ levels: level + 1, sizes: NO_SIZES.map((n, i) => (i === level ? step + 1 : n)) })),
  ]),
  { levels: MEMORY_PARTS.length, sizes: MEMORY_PARTS.map((part) => part.sizes.length) },
];

/** Where a save's caches are among CACHE_STEPS (sizes not listed count as that level as bought). */
function cacheStep(p: Progress): number {
  if (p.cacheLevels === 0) return 0;
  const sizes = p.cacheSizes.join();
  const exact = CACHE_STEPS.findIndex((step) => step.levels === p.cacheLevels && step.sizes.join() === sizes);
  return exact >= 0 ? exact : Math.max(1, CACHE_STEPS.findIndex((step) => step.levels === p.cacheLevels));
}

/** A save's caches in a few words, or OFF: each level owned and its size ("L1 64 B + L2 512 B"). */
function cacheText(p: Progress): string {
  const l1 = cacheOf(p);
  const below = lowerCachesOf(p).map((level) => ` + ${level.name} ${cacheBytes(level.shape)} B`).join('');
  return l1 ? `L1 ${cacheBytes(l1)} B${below}` : 'OFF';
}

/** A save with the caches at `step` of CACHE_STEPS. */
function withCacheStep(p: Progress, step: number): Progress {
  const { levels, sizes } = CACHE_STEPS[step];
  return { ...p, cacheLevels: levels, cacheSizes: sizes };
}

/** What a save's CPU is, field by field: compared before and after a change, to say what else it changed. */
function hardware(p: Progress): Record<string, string> {
  return {
    CHIP: bitsName(p.wordBits),
    TIER: String(tierOf(p).number),
    CLOCK: `LEVEL ${p.clockLevel}`,
    CACHES: cacheText(p),
    OVERCLOCKING: p.overclocking ? 'ON' : 'OFF',
    'DEEP PIPELINE': deepActive(p) ? 'IN USE' : p.deepPipeline === 'none' ? 'NOT BOUGHT' : 'IDLE',
  };
}

/** The field a row itself changes (not worth repeating as a knock-on). */
const OWN: Partial<Record<Row, string>> = { chip: 'CHIP', tier: 'TIER', clock: 'CLOCK', cache: 'CACHES', overclock: 'OVERCLOCKING', deep: 'DEEP PIPELINE' };

/**
 * The developer screen (the backquote key on the main menu): the console
 * cheats (cheats.ts) on a screen, plus any lesson, practice and the board.
 * It changes the save being played (the active slot), as the cheats do: to
 * test without touching a campaign, export it first or play another slot.
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
    this.setUp();
    const slot = slotName(activeSlot());
    this.header(
      `DEVELOPER MODE: ${folderPath(this.era, ['DEV'])}`,
      hasSave() ? `CHANGES GO STRAIGHT INTO ${slot}, THE SAVE YOU'RE PLAYING.` : `${slot} IS EMPTY: A CHANGE STARTS A NEW GAME IN IT.`,
    );
    // Its rows scroll above the about line, which sits a little lower than on other screens.
    this.menu = new ListMenu(this, this.era, { x: 190, top: 96, width: 580, rowHeight: 18, size: 14, heading: 16, bottom: LAYOUT.about - 22 });
    this.menu.setRows(this.rows(), data?.selected ?? 0);
    // A long list: the lines about it sit a little lower than on other screens.
    this.about = this.aboutLine().setY(LAYOUT.about + 11);
    this.message = this.messageLine().setText(data?.message ?? '').setY(LAYOUT.message + 5);
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
      cache: ['CACHES', cacheText(p)],
      overclock: ['OVERCLOCKING UPGRADE', onOff(p.overclocking)],
      deep: ['DEEP PIPELINE', p.deepPipeline === 'none' ? 'NOT BOUGHT' : `${p.deepPipeline.toUpperCase()}${p.deepPipeline === 'on' && !deepActive(p) ? ' (IDLE BELOW TIER 4)' : ''}`],
      money: ['MONEY', formatMoney(p.money)],
      reputation: ['REPUTATION', reputationLine(p.reputation, p.day)],
      marks: ['BAD MARKS', String(p.reputation.bad)],
      time: ['HOURS WORKED TODAY', p.worked >= DAY_SECONDS ? `${formatHours(p.worked)} (DAY OVER)` : formatHours(p.worked)],
      endday: ['END THE DAY', dateLine(p)],
      board: ['DEAL NEW CONTRACTS'],
      everything: ['UNLOCK EVERYTHING'],
      lesson: ['OPEN LESSON', wipLabel(LESSONS[LESSON_IDS[this.lesson]].title, isWip(LESSON_IDS[this.lesson])).slice(0, 40)],
      seen: ['LESSONS AND TOURS SEEN', `${p.seenLessons.length} OF ${TAUGHT_IDS.length}`],
      play: ['PLAY: CONTRACT BOARD'],
      practice: ['PRACTICE THIS TIER'],
      autoplay: ['AUTOPLAY SONGS', onOff(cheatFlags.autoplay)],
      motions: ['MOTION LAB'],
      reset: [this.confirmReset ? `ERASE ${slotName(activeSlot())}: PRESS ENTER AGAIN` : 'START THIS SAVE OVER'],
    };
    const firsts = new Map(GROUPS.map((group) => [group.rows[0], group.name(slotName(activeSlot()))]));
    return ROWS.map((row) => ({ label: values[row][0], value: values[row][1], group: firsts.get(row) }));
  }

  private showAbout(): void {
    this.about.setText(ABOUT[ROWS[this.menu.selected]]);
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
        return this.edit(row, (p) => withTier(p, Phaser.Math.Clamp(tierOf(p).number + delta, 1, TIERS.length)));
      case 'clock':
        return this.edit(row, (p) => fitChip({ ...p, clockLevel: clampInt(p.clockLevel + delta, CLOCK.factors.length - 1) }));
      case 'time':
        // A whole hour at a time, from 9:00 to the end of the day.
        return this.edit(row, (p) => ({ ...p, worked: Math.max(0, Math.min(DAY_SECONDS, Math.round(p.worked / 3600 + delta) * 3600)) }));
      case 'money':
        return this.edit(row, (p) => {
          const next = delta > 0 ? MONEY_STEPS.find((m) => m > p.money) : [...MONEY_STEPS].reverse().find((m) => m < p.money);
          return { ...p, money: next ?? p.money };
        });
      case 'reputation':
        return this.edit(row, (p) => {
          const steps = REPUTATION.levels.map((level) => level.good);
          const next = delta > 0 ? steps.find((good) => good > p.reputation.good) : [...steps].reverse().find((good) => good < p.reputation.good);
          return { ...p, reputation: { ...p.reputation, good: next ?? p.reputation.good } };
        });
      case 'marks':
        return this.edit(row, (p) => ({ ...p, reputation: { ...p.reputation, bad: Math.max(0, p.reputation.bad + delta) } }));
      case 'cooling':
        return this.edit(row, (p) => ({ ...p, cooling: clampInt(p.cooling + delta, COOLING.length - 1) }));
      case 'deep': {
        const states = ['none', 'off', 'on'] as const;
        return this.edit(row, (p) => ({ ...p, deepPipeline: states[clampInt(states.indexOf(p.deepPipeline) + delta, states.length - 1)] }));
      }
      case 'lesson':
        this.lesson = Phaser.Math.Wrap(this.lesson + delta, 0, LESSON_IDS.length);
        this.cue('move');
        return this.refresh();
      case 'cache':
        return this.edit(row, (p) => withCacheStep(p, clampInt(cacheStep(p) + delta, CACHE_STEPS.length - 1)));
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
        return this.edit(row, (p) => withCacheStep(p, p.cacheLevels > 0 ? 0 : 1));
      case 'overclock':
        return this.edit(row, (p) => ({ ...p, overclocking: !p.overclocking }));
      case 'everything':
        return this.edit(row, withEverything);
      case 'board':
        this.edit(row, (p) => fillBoard({ ...p, board: [] }, Math.random));
        this.message.setText('NEW CONTRACTS ON THE BOARD.');
        return;
      case 'endday':
        this.edit(row, (p) => endDay(p, Math.random).progress);
        this.message.setText(`A NEW MORNING: ${dateLine(getProgress())}.`);
        return;
      case 'seen':
        // All seen, or none: then practice's tips are given again too.
        return this.edit(row, (p) => (p.seenLessons.length < TAUGHT_IDS.length ? { ...p, seenLessons: TAUGHT_IDS } : { ...p, seenLessons: [], seenTips: [] }));
      case 'autoplay':
        cheatFlags.autoplay = !cheatFlags.autoplay;
        this.cue('move');
        return this.refresh();
      case 'lesson':
        openLesson(this, LESSON_IDS[this.lesson], { scene: 'dev', data: { selected: this.menu.selected } });
        return;
      case 'practice':
        this.scene.start(tier.scene, { practice: true, ...tier.options });
        return;
      case 'play':
        this.scene.start('board');
        return;
      case 'motions':
        this.scene.start('motions');
        return;
      case 'reset':
        if (!this.confirmReset) {
          this.confirmReset = true;
          this.cue('error');
          return this.refresh();
        }
        this.confirmReset = false;
        newGame(activeSlot());
        this.scene.restart({ selected: this.menu.selected, message: `${slotName(activeSlot())} STARTED OVER: A NEW GAME.` });
        return;
      default:
        return this.step(row, 1);
    }
  }
}
