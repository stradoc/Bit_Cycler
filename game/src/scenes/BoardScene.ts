import { SECTIONS } from '../data/economy.ts';
import { programByName } from '../data/programs.ts';
import { playContract } from '../flow.ts';
import { BOARD_TOUR, BOARD_TOUR_ID, type BoardTarget } from '../data/tours.ts';
import { formatCount, formatDuration, formatMoney } from '../format.ts';
import { getProgress, updateProgress } from '../save.ts';
import { UNITS } from '../sim/isa.ts';
import { jobSheet } from '../sim/jobSheet.ts';
import { contractSeconds, cpiFor, cpuLine, isLocked, isTight, jobItems, ratedMhz, type Contract } from '../sim/progress.ts';
import { THERMAL } from '../sim/thermal.ts';
import { cssColor } from '../ui/eras.ts';
import { Guide, type Rect } from '../ui/guide.ts';
import { ListMenu, type MenuRow } from '../ui/list.ts';
import { Screen } from '../ui/screen.ts';
import { ALPHA, LAYOUT, TEXT } from '../ui/theme.ts';
import { panel } from '../ui/widgets.ts';
import { bar, deadlineBar } from '../visual/asciiChart.ts';

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

/** How a contract stands against your CPU: shown on its row, and explained on its sheet. */
type Standing = 'ready' | 'tight' | 'locked';

function standingOf(contract: Contract): Standing {
  const progress = getProgress();
  return isLocked(contract, progress) ? 'locked' : isTight(contract, progress) ? 'tight' : 'ready';
}

/**
 * The contract board: endless random jobs in three sections, listed by
 * client and pay, with the chosen one's job sheet beside them: the job, the
 * loop that does it, the notes it plays, the memory it uses, and how long
 * your CPU would take for all of it (instructions x CPI x clock period).
 * Jobs your CPU couldn't finish by their deadline are locked until it's faster.
 */
export class BoardScene extends Screen {
  private menu!: ListMenu;
  private contracts: Contract[] = [];
  private sheet!: Phaser.GameObjects.Container;
  private message!: Phaser.GameObjects.Text;
  private guide!: Guide;

  constructor() {
    super('board');
  }

  create(): void {
    this.setUp();
    const progress = getProgress();
    const worn = progress.chipMaxDial < THERMAL.maxDial ? `   CHIP WORN: MAX ${Math.round(progress.chipMaxDial * 100)}%` : '';
    this.header('CONTRACT BOARD', `YOUR CPU: ${cpuLine(progress)}${worn}`);
    this.corner(formatMoney(progress.money));

    // Section by section, as the economy lists them.
    this.contracts = SECTIONS.flatMap((section) => progress.board.filter((c) => c.section === section.id));
    const rows: MenuRow[] = this.contracts.map((contract, i) => {
      const standing = standingOf(contract);
      const first = i === 0 || this.contracts[i - 1].section !== contract.section;
      return {
        label: programByName(contract.program).client ?? contract.program,
        middle: formatMoney(contract.pay),
        value: standing === 'locked' ? 'SLOW' : standing === 'tight' ? 'TIGHT' : 'OK',
        dim: standing === 'locked',
        group: first ? SECTIONS.find((s) => s.id === contract.section)?.name : undefined,
      };
    });
    this.menu = new ListMenu(this, this.era, { x: LIST_X, top: LIST_TOP, width: LIST_W, rowHeight: ROW_H, size: 15, middle: 58 });
    this.menu.setRows(rows, Math.max(0, this.contracts.findIndex((c) => standingOf(c) !== 'locked')));
    // Clicking a row chooses it; clicking the chosen one takes it.
    rows.forEach((_, i) => {
      this.add
        .zone(LIST_X - 8, this.menu.rowY(i), LIST_W + 16, ROW_H)
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => (i === this.menu.selected ? this.take() : this.choose(i - this.menu.selected)));
    });

    panel(this, this.era, SHEET_X, SHEET_Y, SHEET_W, SHEET_H, 'JOB SHEET');
    this.sheet = this.add.container(0, 0);
    this.textAt(LIST_X, this.menu.rowY(rows.length - 1) + ROW_H + 8, 'FINISH LATE (A SLOPPY RUN): HALF PAY', TEXT.small - 1).setAlpha(ALPHA.subtitle);
    this.message = this.messageLine();
    this.hints('[UP/DOWN] CHOOSE', '[ENTER] TAKE CONTRACT', '[S] SHOP', '[M] HUM', '[Q] MAIN MENU');
    this.drawSheet();

    // The first visit: the guide shows the board around.
    this.guide = new Guide(this, this.era);
    if (!progress.seenLessons.includes(BOARD_TOUR_ID)) {
      this.guide.tour(BOARD_TOUR, (target) => this.where(target), () => updateProgress((p) => ({ ...p, seenLessons: [...p.seenLessons, BOARD_TOUR_ID] })));
    }
  }

  update(): void {
    super.update();
    this.guide.update(performance.now());
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
    };
    return areas[target];
  }

  private choose(delta: number): void {
    if (delta === 0) return;
    this.menu.move(delta);
    this.message.setText('');
    this.drawSheet();
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
    const verdict = {
      ready: 'YOUR CPU HAS TIME TO SPARE.',
      tight: 'TIGHT: PLAY CLEANLY OR BE LATE.',
      locked: 'TOO SLOW: A FASTER CPU FROM THE SHOP [S] CAN DO IT.',
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
    line(left, time + 10, `NEEDED IN ${formatDuration(contract.deadline)}`.padEnd(22) + deadlineBar(seconds, contract.deadline, 22), TEXT.small).setColor(cssColor(color));
  }

  private take(): void {
    const contract = this.contracts[this.menu.selected];
    if (!contract) return;
    if (standingOf(contract) === 'locked') {
      this.cue('error');
      this.message.setText('TOO SLOW FOR THIS JOB: A FASTER CLOCK OR NEW PARTS IN THE SHOP [S] WILL GET YOU THERE');
      return;
    }
    this.cue('confirm');
    this.menu.press(() => playContract(this, contract));
  }

  protected onKey(key: string): boolean | void {
    if (this.guide.touring) {
      if (key === 'Enter' || key === ' ' || key === 'ArrowRight') this.guide.next();
      else if (key === 'Escape' || key === 'Q') this.back();
      return true;
    }
    if (this.menu.busy) return true;
    if (key === 'ArrowUp') this.choose(-1);
    else if (key === 'ArrowDown') this.choose(1);
    else if (key === 'Enter' || key === ' ') this.take();
    else if (key === 'S') {
      this.cue('confirm');
      this.scene.start('shop');
    } else if (key === 'Escape' || key === 'Q') this.back();
    else return false;
    return true;
  }
}
