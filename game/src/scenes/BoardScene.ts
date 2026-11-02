import { GRADES } from '../data/economy.ts';
import { banner } from '../data/menuFiles.ts';
import { programByName } from '../data/programs.ts';
import { playContract } from '../flow.ts';
import { BOARD_TOUR, BOARD_TOUR_ID, FIRST_DAY_ID, FIRST_DAY_TOUR, TIMECARD_TOUR, TIMECARD_TOUR_ID, TUTORIAL_QUESTION, TUTORIAL_REPLY, type BoardTarget, type TourStep } from '../data/tours.ts';
import { formatClock, formatCount, formatDuration, formatHours, formatMoney } from '../format.ts';
import { getProgress, setProgress, updateProgress } from '../save.ts';
import { teaching, updateSettings } from '../settings.ts';
import { UNITS } from '../sim/isa.ts';
import { jobSheet } from '../sim/jobSheet.ts';
import { contractSeconds, cpiFor, cpuLine, hasSeen, isLocked, isTight, isTutorial, jobItems, ratedMhz, withSeen, type Contract } from '../sim/progress.ts';
import { THERMAL } from '../sim/thermal.ts';
import { clockSeconds, DAY_END, DAY_SECONDS, DAY_START, dayOver, endDay, fitsToday, gradeName, shortDate, timeLeft, weekday } from '../sim/workday.ts';
import { cssColor } from '../ui/eras.ts';
import { Guide, type Rect } from '../ui/guide.ts';
import { ListMenu, type MenuRow } from '../ui/list.ts';
import type { PauseItem } from '../ui/pauseMenu.ts';
import { Screen } from '../ui/screen.ts';
import { ALPHA, LAYOUT, TEXT } from '../ui/theme.ts';
import { Box, panel } from '../ui/widgets.ts';
import { bar, calendarPage, deadlineBar, stackedBar, timecard } from '../visual/asciiChart.ts';
import { WIDTH } from '../visual/display.ts';

const LIST_X = 48;
const LIST_W = 316;
const LIST_TOP = 118;
const ROW_H = 26;
/** The job sheet: the chosen contract in full. */
const SHEET_X = 400;
const SHEET_Y = 92;
const SHEET_W = LAYOUT.right - SHEET_X;
const SHEET_H = 362;
const SHEET_MID = SHEET_X + SHEET_W / 2;
/**
 * Where the job sheet's rows are: what matters for choosing (who, what, the
 * pay, the time against the deadline, the verdict) large in the middle, and
 * the details (the loop, its notes, the memory it uses, the time's working
 * out) small along the bottom.
 */
const SHEET_ROWS = {
  client: SHEET_Y + 20,
  job: SHEET_Y + 46,
  figures: SHEET_Y + 78,
  bar: SHEET_Y + 138,
  verdict: SHEET_Y + 158,
  when: SHEET_Y + 177,
  details: SHEET_Y + 208,
  working: SHEET_Y + SHEET_H - 22,
} as const;
/** The three big figures' middles, and the details' columns. */
const FIGURE_XS = [SHEET_MID - 170, SHEET_MID, SHEET_MID + 170];
/** The space between the details' two columns, which are centered together on the sheet. */
const DETAIL_GAP = 44;
const DETAIL_LINE = 16;
/** The memory map's heading, in lines below the details' top (under the notes). */
const MEMORY_ROW = 4.4;
/** The details' text: smaller and dimmer than what matters. */
const DETAIL_SIZE = TEXT.small - 1;
const DETAIL_ALPHA = 0.7;

/** Over the board, but under TICK (who points at it): the timecard as the day ends. */
const OVERLAY_DEPTH = 800;

/** The timecard's box: its middle and size, high enough that TICK fits under it to explain it. */
const CARD = { y: 236, w: 360, h: 230 };

/** The board's tours, by the id BRIEFS replays them with. */
const TOURS: Readonly<Record<string, readonly TourStep<BoardTarget>[]>> = { [BOARD_TOUR_ID]: BOARD_TOUR, [FIRST_DAY_ID]: FIRST_DAY_TOUR };

/** How a contract stands against your CPU and the clock: shown on its row, and explained on its sheet. */
type Standing = 'ready' | 'tight' | 'locked' | 'tomorrow';

function standingOf(contract: Contract): Standing {
  const progress = getProgress();
  if (isLocked(contract, progress)) return 'locked';
  if (!fitsToday(contract, progress)) return 'tomorrow';
  return isTight(contract, progress) ? 'tight' : 'ready';
}

/** What the row says for each standing, and whether it can be taken now. */
const STANDING: Readonly<Record<Standing, { value: string; open: boolean }>> = {
  ready: { value: 'OK', open: true },
  tight: { value: 'TIGHT', open: true },
  locked: { value: 'SLOW', open: false },
  tomorrow: { value: 'LATER', open: false },
};

/**
 * The contract board: today's offers, sized to your CPU, easy, fair and
 * stretch, listed by client and pay, with the chosen one's job sheet beside
 * them: the job, the loop that does it, the notes it plays, the memory it
 * uses, and how long your CPU would take for all of it (instructions x CPI x
 * clock period). Under the list, the calendar: the day, the clock, and the
 * workday's hours (sim/workday.ts). Jobs your CPU couldn't finish by their
 * deadline are locked until it's faster, and those it couldn't finish
 * before 5:00 until tomorrow. LOG OFF ends the day with its timecard.
 */
export class BoardScene extends Screen {
  private menu!: ListMenu;
  private contracts: Contract[] = [];
  private sheet!: Phaser.GameObjects.Container;
  private message!: Phaser.GameObjects.Text;
  private guide!: Guide;
  /** The workday bar along the bottom (showDay). */
  private dayBar!: Phaser.GameObjects.Text;
  /** Where the calendar starts, under the list (for TICK to point at). */
  private calendarTop = 0;
  /** Where the job sheet's two detail columns start, and how wide they are (they're centered together, so it depends on the job). */
  private columns = { left: 0, leftW: 0, right: 0, rightW: 0 };
  /** The timecard over the board, while it's up (the day ending). */
  private card: Phaser.GameObjects.GameObject[] | undefined;

  constructor() {
    super('board');
  }

  /** A restart (clocking out) reuses this scene: nothing from the last day carries over. */
  init(): void {
    this.card = undefined;
  }

  /** `tour`: a tour to play even if it's been seen (BRIEFS on the main menu): the board's, or the first day's. */
  create(data?: { tour?: string }): void {
    const replayTour = data?.tour;
    this.setUp();
    const progress = getProgress();
    const worn = progress.chipMaxDial < THERMAL.maxDial ? `   CHIP WORN: MAX ${Math.round(progress.chipMaxDial * 100)}%` : '';
    this.header('CONTRACT BOARD', `YOUR CPU: ${cpuLine(progress)}${worn}`);
    this.corner(formatMoney(progress.money));

    // Grade by grade, easy first.
    this.contracts = GRADES.flatMap((grade) => progress.board.filter((c) => c.grade === grade.id));
    const rows: MenuRow[] = this.contracts.map((contract, i) => {
      const standing = STANDING[standingOf(contract)];
      const first = i === 0 || this.contracts[i - 1].grade !== contract.grade;
      return {
        label: programByName(contract.program).client ?? contract.program,
        middle: formatMoney(contract.pay),
        value: standing.value,
        dim: !standing.open,
        group: first ? (isTutorial(contract) ? 'YOUR FIRST JOB' : gradeName(contract)) : undefined,
      };
    });
    this.menu = new ListMenu(this, this.era, { x: LIST_X, top: LIST_TOP, width: LIST_W, rowHeight: ROW_H, size: 15, middle: 58 });
    this.menu.setRows(rows, Math.max(0, this.contracts.findIndex((c) => STANDING[standingOf(c)].open)));
    // Clicking a row chooses it; clicking the chosen one takes it.
    rows.forEach((_, i) => {
      this.add
        .zone(LIST_X - 8, this.menu.rowY(i), LIST_W + 16, ROW_H)
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => (i === this.menu.selected ? this.take() : this.choose(i - this.menu.selected)))
        // Hovering a job shows on the workday bar how long it would take.
        .on('pointerover', () => this.showDay(this.contracts[i]))
        .on('pointerout', () => this.showDay(this.contracts[this.menu.selected]));
    });

    panel(this, this.era, SHEET_X, SHEET_Y, SHEET_W, SHEET_H, 'JOB SHEET');
    this.sheet = this.add.container(0, 0);
    this.textAt(LIST_X, this.menu.rowY(rows.length - 1) + ROW_H + 8, 'FINISH LATE (A SLOPPY RUN): HALF PAY', TEXT.small - 1).setAlpha(ALPHA.subtitle);
    this.drawCalendar();
    this.message = this.messageLine();
    this.hints('[UP/DOWN] CHOOSE', '[ENTER] TAKE CONTRACT', '[L] LOG OFF', '[C] CALENDAR', '[S] SHOP', '[Q] MENU');
    this.drawSheet();
    this.showDay(this.contracts[this.menu.selected]);
    // The mouse leaving the game: back to the chosen job's estimate.
    this.input.on('gameout', () => this.showDay(this.contracts[this.menu.selected]));

    // The first visit: the guide shows the board around.
    this.guide = new Guide(this, this.era);
    // TICK's tours: the board on the first visit (the tutorial job alone), then the first day once the real jobs arrive.
    const tour = replayTour ?? (!teaching().tours ? undefined : !hasSeen(progress, BOARD_TOUR_ID) ? BOARD_TOUR_ID : !progress.board.some(isTutorial) && !hasSeen(progress, FIRST_DAY_ID) ? FIRST_DAY_ID : undefined);
    if (tour && TOURS[tour]) {
      this.guide.tour(TOURS[tour], (target) => this.where(target), () => updateProgress((p) => withSeen(p, tour)));
    } else if (dayOver(progress)) {
      // The last job used up the day's hours: its timecard.
      this.showTimecard();
    }
  }

  /**
   * The calendar under the list: a tear-off page with the day, the time in
   * block digits, and the workday's hours as a bar along the bottom.
   */
  private drawCalendar(): void {
    const progress = getProgress();
    const top = this.menu.rowY(Math.max(0, this.contracts.length - 1)) + ROW_H + 34;
    this.calendarTop = top;
    this.textAt(LIST_X, top, calendarPage(weekday(progress.day), shortDate(progress.day)).join('\n'), TEXT.small).setLineSpacing(0);
    const [time, half] = formatClock(clockSeconds(progress)).split(' ');
    // Block digits close up (no line spacing), so their half blocks join; some fonts draw them wider, so they shrink to fit beside the sheet.
    const clock = this.textAt(LIST_X + 150, top + 4, banner(time).join('\n'), TEXT.small).setLineSpacing(0).setColor(cssColor(this.era.accent));
    const room = SHEET_X - 28 - clock.x;
    if (clock.width > room) clock.setScale(room / clock.width);
    this.textAt(LIST_X + 150, top + 8 + clock.displayHeight, half, TEXT.small).setAlpha(ALPHA.subtitle);
    this.dayBar = this.text(WIDTH / 2, LAYOUT.about, '', TEXT.small).setAlpha(ALPHA.about);
  }

  /**
   * The workday's hours along the bottom: those used (#), and how long the
   * chosen or hovered job would take, played perfectly (=), with when it would be done.
   */
  private showDay(contract: Contract | undefined): void {
    const progress = getProgress();
    const used = Math.min(DAY_SECONDS, progress.worked);
    const job = contract && !isTutorial(contract) ? contractSeconds(contract, progress) : 0;
    const hours = stackedBar([{ value: used, tone: 'good' }, { value: job, tone: 'warn' }], DAY_SECONDS, 30).text;
    const day = `${formatClock(DAY_START)} [${hours}] ${formatClock(DAY_END)}`;
    const words = job > 0 ? `THIS JOB: ${formatHours(job)}, DONE BY ${formatClock(clockSeconds(progress) + job)}` : `${formatHours(timeLeft(progress))} LEFT TODAY`;
    this.dayBar.setText(`${day}   ${words}`);
  }

  /**
   * The day's timecard, over the board: when it started and ended, the jobs
   * and the money. Enter clocks out (the next morning); before the day's
   * hours are used up, Esc goes back to work.
   */
  private showTimecard(): void {
    if (this.card) return;
    const progress = getProgress();
    const over = dayOver(progress);
    const out = formatClock(clockSeconds(progress));
    const lines = timecard({
      date: shortDate(progress.day),
      in: formatClock(DAY_START),
      out,
      jobs: progress.today.jobs,
      late: progress.today.late,
      earned: formatMoney(progress.today.earned),
    });
    const shade = this.add.rectangle(0, 0, WIDTH, 540, this.era.bg, 0.75).setOrigin(0).setDepth(OVERLAY_DEPTH).setInteractive();
    const box = new Box(this, this.era, WIDTH / 2, CARD.y, CARD.w, CARD.h, { strokeWidth: 2 }).setDepth(OVERLAY_DEPTH + 1);
    const title = this.text(WIDTH / 2, CARD.y - CARD.h / 2 + 24, over ? "THAT'S THE DAY" : 'LOG OFF?', TEXT.title - 4).setFontStyle('bold').setColor(cssColor(this.era.accent)).setDepth(OVERLAY_DEPTH + 2);
    const card = this.text(WIDTH / 2, CARD.y + 6, lines.join('\n'), TEXT.small).setLineSpacing(2).setDepth(OVERLAY_DEPTH + 2);
    const keys = this.text(WIDTH / 2, CARD.y + CARD.h / 2 - 18, over ? '[ENTER] CLOCK OUT' : '[ENTER] CLOCK OUT    [Q] KEEP WORKING', TEXT.hint).setAlpha(ALPHA.hint).setDepth(OVERLAY_DEPTH + 2);
    this.card = [shade, ...box.parts, title, card, keys];
    this.cue('confirm');
    // The first timecard: TICK says what it is.
    if (teaching().tours && !hasSeen(progress, TIMECARD_TOUR_ID)) {
      this.guide.tour(TIMECARD_TOUR, (target) => this.where(target), () => updateProgress((p) => withSeen(p, TIMECARD_TOUR_ID)));
    }
  }

  /** Clocks out: the timecard's day ends, and the board opens on the next morning. */
  private clockOut(): void {
    const { progress } = endDay(getProgress(), Math.random);
    setProgress(progress);
    this.cue('confirm');
    this.scene.restart();
  }

  private closeTimecard(): void {
    for (const part of this.card ?? []) part.destroy();
    this.card = undefined;
    this.cue('back');
  }

  update(): void {
    super.update();
    this.guide.update(performance.now());
  }

  /** No pause menu over the timecard: Esc there goes back to work. */
  protected pauseItems(): PauseItem[] | undefined {
    return this.card ? undefined : this.places();
  }

  /** Where the parts of the board are, for the guide to point at. */
  private where(target: BoardTarget): Rect {
    const inner = { x: SHEET_X + 6, w: SHEET_W - 12 };
    const bottom = this.menu.rowY(this.contracts.length - 1) + ROW_H / 2 + 4;
    const top = SHEET_ROWS.details;
    const areas: Record<BoardTarget, Rect> = {
      list: { x: LIST_X - 12, y: LIST_TOP - 30, w: LIST_W + 24, h: bottom - LIST_TOP + 30 },
      job: { ...inner, y: SHEET_ROWS.client - 8, h: SHEET_ROWS.figures + 50 - (SHEET_ROWS.client - 8) },
      loop: { x: this.columns.left - 8, y: top - 6, w: this.columns.leftW + 16, h: 7 * DETAIL_LINE + 10 },
      notes: { x: this.columns.right - 8, y: top - 6, w: this.columns.rightW + 16, h: 4 * DETAIL_LINE + 8 },
      memory: { x: this.columns.right - 8, y: top + MEMORY_ROW * DETAIL_LINE - 6, w: this.columns.rightW + 16, h: 3 * DETAIL_LINE + 8 },
      time: { ...inner, y: SHEET_ROWS.figures - 6, h: SHEET_ROWS.when + 20 - (SHEET_ROWS.figures - 6) },
      calendar: { x: LIST_X - 12, y: this.calendarTop - 8, w: LAYOUT.right - LIST_X + 24, h: LAYOUT.about + 12 - (this.calendarTop - 8) },
      workday: { x: this.dayBar.x - this.dayBar.width / 2 - 8, y: LAYOUT.about - 13, w: this.dayBar.width + 16, h: 26 },
      card: { x: WIDTH / 2 - CARD.w / 2 - 6, y: CARD.y - CARD.h / 2 - 6, w: CARD.w + 12, h: CARD.h + 12 },
    };
    return areas[target];
  }

  private choose(delta: number): void {
    if (delta === 0) return;
    this.menu.move(delta);
    this.message.setText('');
    this.drawSheet();
    this.showDay(this.contracts[this.menu.selected]);
  }

  /** The chosen contract's job sheet: what matters large in the middle, the details small along the bottom (SHEET_ROWS). */
  private drawSheet(): void {
    this.sheet.removeAll(true);
    const contract = this.contracts[this.menu.selected];
    if (!contract) return;
    const progress = getProgress();
    const spec = programByName(contract.program);
    const job = jobSheet(contract.program);
    const standing = standingOf(contract);
    const seconds = contractSeconds(contract, progress);
    const add = (text: Phaser.GameObjects.Text) => {
      this.sheet.add(text);
      return text;
    };
    const centered = (y: number, content: string, size: number, alpha = 1) => add(this.textAt(SHEET_MID, y, content, size).setOrigin(0.5, 0).setAlpha(alpha));
    const detail = (x: number, y: number, content: string, alpha = DETAIL_ALPHA) => add(this.textAt(x, y, content, DETAIL_SIZE).setAlpha(alpha));
    const heading = (x: number, y: number, content: string) => detail(x, y, content, 0.8).setColor(cssColor(this.era.accent));
    // The warning color for every standing but ready: the danger red is hard to read on DOS blue.
    const color = cssColor(standing === 'ready' ? this.era.fg : this.colors.warn);

    // Who it's for, and the job in their words.
    centered(SHEET_ROWS.client, spec.client ?? spec.name, TEXT.body + 4).setFontStyle('bold');
    centered(SHEET_ROWS.job, `${spec.verb} ${formatCount(jobItems(contract))} ${spec.unit}`, TEXT.body, 0.85);

    // The three figures that decide it: the pay, how long your CPU takes (played perfectly), and the deadline.
    const figures: [string, string, string?][] = [
      ['PAYS', formatMoney(contract.pay)],
      ['YOUR CPU TAKES', formatHours(seconds), color],
      ['DUE IN', formatHours(contract.deadline)],
    ];
    figures.forEach(([label, value, tint], i) => {
      add(this.textAt(FIGURE_XS[i], SHEET_ROWS.figures, label, TEXT.small).setOrigin(0.5, 0).setAlpha(ALPHA.subtitle));
      const big = add(this.textAt(FIGURE_XS[i], SHEET_ROWS.figures + 20, value, TEXT.title).setOrigin(0.5, 0).setFontStyle('bold'));
      if (tint) big.setColor(tint);
    });

    // The time against the deadline, what that means, and when it would be done.
    centered(SHEET_ROWS.bar, deadlineBar(seconds, contract.deadline, 40).text, TEXT.small).setColor(color);
    const lastDay = contract.expires <= progress.day;
    const verdict = {
      ready: 'YOUR CPU HAS TIME TO SPARE.',
      tight: 'TIGHT: PLAY CLEANLY OR BE LATE.',
      locked: 'TOO SLOW: A FASTER CPU FROM THE SHOP [S] CAN DO IT.',
      tomorrow: lastDay ? "NOT ENOUGH TIME LEFT TODAY, AND IT'S GONE TOMORROW." : "NOT ENOUGH TIME LEFT TODAY: LOG OFF [L], IT'S STILL HERE TOMORROW.",
    }[standing];
    centered(SHEET_ROWS.verdict, verdict, TEXT.small).setColor(color);
    const offer = isTutorial(contract) ? '' : lastDay ? 'LAST DAY ON OFFER' : 'ON OFFER TILL TOMORROW';
    const done = standing === 'ready' || standing === 'tight' ? `DONE BY ${formatClock(clockSeconds(progress) + (isTutorial(contract) ? 0 : seconds))}` : '';
    centered(SHEET_ROWS.when, [done, offer].filter(Boolean).join('   '), TEXT.small, ALPHA.subtitle);

    // The details: a rule, then the loop the song plays, the notes it sends down each lane, and the memory it uses.
    add(this.textAt(SHEET_MID, SHEET_ROWS.details - 13, '-'.repeat(60), DETAIL_SIZE).setOrigin(0.5, 0).setAlpha(0.35));
    const top = SHEET_ROWS.details;
    // Each column is drawn at x = 0, measured, then both are moved so they sit centered together.
    const left = [heading(0, top, `THE LOOP, RUN ${job.loopRuns} TIMES`), ...job.loop.map((code, i) => detail(0, top + (i + 1) * DETAIL_LINE, code))];
    const total = UNITS.reduce((sum, unit) => sum + job.notes[unit], 0);
    // Which memory it reads and writes: one character per address (per number, for wider data).
    const memory = top + MEMORY_ROW * DETAIL_LINE;
    const strip = (marks: readonly boolean[]) => marks.map((on) => (on ? '#' : '.')).join('');
    const right = [
      heading(0, top, `${total} NOTES IN THE SONG`),
      ...UNITS.map((unit, i) => detail(0, top + (i + 1) * DETAIL_LINE, `${unit.padEnd(6)} ${bar(job.notes[unit], total, 8)} ${job.notes[unit]}`)),
      // No wider than the marks under it (39 characters), so the columns stay inside the sheet.
      heading(0, memory, job.itemBytes > 1 ? `MEMORY: ADDRESSES 0-${job.reads.length * job.itemBytes - 1}, ${job.itemBytes} BYTES A MARK` : `MEMORY IT USES: ADDRESSES 0-${job.reads.length - 1}`),
      detail(0, memory + DETAIL_LINE, `READS  ${strip(job.reads)}`),
      detail(0, memory + 2 * DETAIL_LINE, `WRITES ${strip(job.writes)}`),
    ];
    const widest = (texts: Phaser.GameObjects.Text[]) => Math.max(...texts.map((text) => text.width));
    const [leftW, rightW] = [widest(left), widest(right)];
    const start = Math.round(SHEET_MID - (leftW + DETAIL_GAP + rightW) / 2);
    this.columns = { left: start, leftW, right: start + leftW + DETAIL_GAP, rightW };
    for (const text of left) text.setX(this.columns.left);
    for (const text of right) text.setX(this.columns.right);
    // How the time is worked out: instructions x CPI x clock period.
    const period = formatDuration(1 / (ratedMhz(progress) * 1e6));
    detail(SHEET_MID, SHEET_ROWS.working, `TIME = ${formatCount(contract.instructions)} INSTRUCTIONS x CPI ${cpiFor(contract.program, progress).toFixed(2)} x ${period} = ${formatDuration(seconds)}`).setOrigin(0.5, 0);
  }

  private take(): void {
    const contract = this.contracts[this.menu.selected];
    if (!contract) return;
    const standing = standingOf(contract);
    if (!STANDING[standing].open) {
      this.cue('error');
      this.message.setText(
        standing === 'tomorrow'
          ? `IT WOULD RUN PAST ${formatClock(DAY_END)}: TAKE A SMALLER JOB, OR LOG OFF [L] AND START FRESH`
          : 'TOO SLOW FOR THIS JOB: A FASTER CLOCK OR NEW PARTS IN THE SHOP [S] WILL GET YOU THERE',
      );
      return;
    }
    this.cue('confirm');
    if (isTutorial(contract)) {
      this.askTutorial(contract);
      return;
    }
    this.menu.press(() => playContract(this, contract));
  }

  /**
   * A new game's first job: TICK asks how much to teach (every instruction up
   * close, each new part, or nothing), keeps the answer in the settings, then the job starts.
   */
  private askTutorial(contract: Contract): void {
    const { say, mood, choices } = TUTORIAL_QUESTION;
    this.guide.ask({
      say,
      mood,
      choices: choices.map((choice) => choice.answer),
      done: (i) => {
        const { level } = choices[i];
        updateSettings({ tutorial: level });
        this.guide.tour(TUTORIAL_REPLY[level], (target) => this.where(target), () => playContract(this, contract));
      },
    });
  }

  protected onKey(key: string, event: KeyboardEvent): boolean | void {
    // TICK's tour: Enter shows the rest of the words, then goes on (a held-down key doesn't race through).
    if (this.guide.waiting) {
      if (key === 'Enter' && !event.repeat) this.guide.next();
      else if (key === 'ArrowUp' || key === 'ArrowDown') this.guide.move(key === 'ArrowUp' ? -1 : 1);
      return key !== 'M';
    }
    // The timecard: Enter clocks out; Esc (or Q) goes back to work if the day isn't over.
    if (this.card) {
      if (key === 'Enter' && !event.repeat) this.clockOut();
      else if ((key === 'Escape' || key === 'Q') && !dayOver(getProgress())) this.closeTimecard();
      return true;
    }
    if (this.menu.busy) return true;
    if (key === 'L') this.showTimecard();
    else if (key === 'C') {
      this.cue('confirm');
      this.scene.start('calendar');
    }
    else if (key === 'ArrowUp') this.choose(-1);
    else if (key === 'ArrowDown') this.choose(1);
    else if (key === 'Enter' || key === ' ') this.take();
    else if (key === 'S') {
      this.cue('confirm');
      this.scene.start('shop');
    } else return false;
    return true;
  }
}
