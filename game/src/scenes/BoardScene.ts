import { GRADES } from '../data/economy.ts';
import { banner } from '../data/menuFiles.ts';
import { programByName } from '../data/programs.ts';
import { playContract } from '../flow.ts';
import { BOARD_TOUR, BOARD_TOUR_ID, type BoardTarget } from '../data/tours.ts';
import { formatClock, formatCount, formatDuration, formatHours, formatMoney } from '../format.ts';
import { getProgress, setProgress, updateProgress } from '../save.ts';
import { teaching } from '../settings.ts';
import { UNITS } from '../sim/isa.ts';
import { jobSheet } from '../sim/jobSheet.ts';
import { contractSeconds, cpiFor, cpuLine, isLocked, isTight, isTutorial, jobItems, ratedMhz, type Contract } from '../sim/progress.ts';
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
const PAD = 16;

/** Over the board: the timecard as the day ends. */
const OVERLAY_DEPTH = 1500;

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
  /** The timecard over the board, while it's up (the day ending). */
  private card: Phaser.GameObjects.GameObject[] | undefined;

  constructor() {
    super('board');
  }

  /** `tour`: play the board's tour even if it's been seen (BRIEFS on the main menu). */
  create(data?: { tour?: boolean }): void {
    const replayTour = data?.tour ?? false;
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
    this.hints('[UP/DOWN] CHOOSE', '[ENTER] TAKE CONTRACT', '[L] LOG OFF', '[C] CALENDAR', '[S] SHOP', '[ESC] MENU');
    this.drawSheet();
    this.showDay(this.contracts[this.menu.selected]);
    // The mouse leaving the game: back to the chosen job's estimate.
    this.input.on('gameout', () => this.showDay(this.contracts[this.menu.selected]));

    // The first visit: the guide shows the board around.
    this.guide = new Guide(this, this.era);
    if (replayTour || (teaching().tours && !progress.seenLessons.includes(BOARD_TOUR_ID))) {
      this.guide.tour(BOARD_TOUR, (target) => this.where(target), () => updateProgress((p) => ({ ...p, seenLessons: [...new Set(p.seenLessons).add(BOARD_TOUR_ID)] })));
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
    const hours = stackedBar([{ value: used, char: '#' }, { value: job, char: '=' }], DAY_SECONDS, 30);
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
    const box = new Box(this, this.era, WIDTH / 2, 270, 360, 260, { strokeWidth: 2 }).setDepth(OVERLAY_DEPTH + 1);
    const title = this.text(WIDTH / 2, 166, over ? "THAT'S THE DAY" : 'LOG OFF?', TEXT.title - 4).setFontStyle('bold').setColor(cssColor(this.era.accent)).setDepth(OVERLAY_DEPTH + 2);
    const card = this.text(WIDTH / 2, 272, lines.join('\n'), TEXT.small).setLineSpacing(2).setDepth(OVERLAY_DEPTH + 2);
    const keys = this.text(WIDTH / 2, 378, over ? '[ENTER] CLOCK OUT' : '[ENTER] CLOCK OUT    [ESC] KEEP WORKING', TEXT.hint).setAlpha(ALPHA.hint).setDepth(OVERLAY_DEPTH + 2);
    this.card = [shade, ...box.parts, title, card, keys];
    this.cue('confirm');
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
    const areas: Record<BoardTarget, Rect> = {
      list: { x: LIST_X - 12, y: LIST_TOP - 30, w: LIST_W + 24, h: bottom - LIST_TOP + 30 },
      job: { ...inner, y: SHEET_Y + 8, h: 76 },
      loop: { x: inner.x, y: SHEET_Y + 92, w: 286, h: 136 },
      notes: { x: SHEET_X + 292, y: SHEET_Y + 92, w: SHEET_W - 298, h: 76 },
      memory: { ...inner, y: SHEET_Y + 242, h: 76 },
      time: { ...inner, y: SHEET_Y + 318, h: 38 },
      calendar: { x: LIST_X - 12, y: this.calendarTop - 8, w: LAYOUT.right - LIST_X + 24, h: LAYOUT.about + 12 - (this.calendarTop - 8) },
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

  /** The chosen contract's job sheet. */
  private drawSheet(): void {
    this.sheet.removeAll(true);
    const contract = this.contracts[this.menu.selected];
    if (!contract) return;
    const progress = getProgress();
    const spec = programByName(contract.program);
    const job = jobSheet(contract.program);
    const standing = standingOf(contract);
    const left = SHEET_X + PAD;
    const right = SHEET_X + SHEET_W - PAD;
    const line = (x: number, y: number, content: string, size: number = TEXT.small, alpha = 0.95) => {
      const text = this.textAt(x, y, content, size).setAlpha(alpha);
      this.sheet.add(text);
      return text;
    };
    const heading = (x: number, y: number, content: string) => line(x, y, content, TEXT.small - 1, 0.8).setColor(cssColor(this.era.accent));

    // Who it's for, the pay, and the job in their words.
    line(left, SHEET_Y + 16, spec.client ?? spec.name, TEXT.body + 2, 1).setFontStyle('bold');
    line(right, SHEET_Y + 16, formatMoney(contract.pay), TEXT.body + 2, 1).setOrigin(1, 0);
    line(left, SHEET_Y + 42, `${spec.verb} ${formatCount(jobItems(contract))} ${spec.unit}`, TEXT.body);
    const lastDay = contract.expires <= progress.day;
    const verdict = {
      ready: 'YOUR CPU HAS TIME TO SPARE.',
      tight: 'TIGHT: PLAY CLEANLY OR BE LATE.',
      locked: 'TOO SLOW: A FASTER CPU FROM THE SHOP [S] CAN DO IT.',
      tomorrow: lastDay ? "NOT ENOUGH TIME LEFT TODAY, AND IT'S GONE TOMORROW." : "NOT ENOUGH TIME LEFT TODAY: LOG OFF [L], IT'S STILL HERE TOMORROW.",
    }[standing];
    // The warning color for both: the danger red is hard to read on DOS blue.
    const color = standing === 'ready' ? this.era.fg : this.colors.warn;
    line(left, SHEET_Y + 64, verdict, TEXT.small, 1).setColor(cssColor(color));

    // The loop the song plays, and the notes it sends down each lane.
    const top = SHEET_Y + 98;
    heading(left, top, `THE LOOP, RUN ${job.loopRuns} TIMES`);
    job.loop.forEach((code, i) => line(left, top + 20 + i * 17, code, TEXT.small));
    const notesX = SHEET_X + 300;
    const total = UNITS.reduce((sum, unit) => sum + job.notes[unit], 0);
    heading(notesX, top, `${total} NOTES IN THE SONG`);
    UNITS.forEach((unit, i) => line(notesX, top + 20 + i * 17, `${unit.padEnd(6)} ${bar(job.notes[unit], total, 8)} ${job.notes[unit]}`, TEXT.small));

    // Which memory it reads and writes: one character per address.
    const memory = SHEET_Y + 248;
    const strip = (marks: readonly boolean[]) => marks.map((on) => (on ? '#' : '.')).join('');
    heading(left, memory, `MEMORY IT USES, ADDRESSES 0-${job.reads.length - 1}`);
    line(left, memory + 20, `       ${'0'.padEnd(8)}${'8'.padEnd(8)}${'16'.padEnd(8)}24`, TEXT.small, 0.6);
    line(left, memory + 37, `READS  ${strip(job.reads)}`);
    line(left, memory + 54, `WRITES ${strip(job.writes)}`);

    // How long your CPU takes for the whole job, against the deadline.
    const seconds = contractSeconds(contract, progress);
    const time = SHEET_Y + 330;
    const period = formatDuration(1 / (ratedMhz(progress) * 1e6));
    line(left, time - 8, `${formatCount(contract.instructions)} INSTRUCTIONS x CPI ${cpiFor(contract.program, progress).toFixed(2)} x ${period} = ${formatDuration(seconds)}`, TEXT.small, 0.8);
    const offer = isTutorial(contract) ? '' : lastDay ? 'LAST DAY ON OFFER' : 'ON OFFER TILL TOMORROW';
    line(left, time + 10, `DUE IN ${formatHours(contract.deadline)}`.padEnd(18) + deadlineBar(seconds, contract.deadline, 18), TEXT.small).setColor(cssColor(color));
    line(right, time + 10, offer, TEXT.small, 0.7).setOrigin(1, 0);
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
    this.menu.press(() => playContract(this, contract));
  }

  protected onKey(key: string, event: KeyboardEvent): boolean | void {
    // TICK's tour: Enter shows the rest of the words, then goes on (a held-down key doesn't race through).
    if (this.guide.waiting) {
      if (key === 'Enter' && !event.repeat) this.guide.next();
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
