import { playMenuMusic, toggleMenuMusic, uiSound } from '../audio/menu.ts';
import { SECTIONS } from '../data/economy.ts';
import { programByName } from '../data/programs.ts';
import { playContract } from '../flow.ts';
import { formatCount, formatDuration, formatMhz, formatMoney } from '../format.ts';
import { keyOf, onKeyDown } from '../input/keys.ts';
import { getProgress } from '../save.ts';
import { getSettings } from '../settings.ts';
import { contractSeconds, isLocked, isTight, jobItems, ratedMhz, tierOf, type Contract } from '../sim/progress.ts';
import { THERMAL } from '../sim/thermal.ts';
import { cssColor, ERAS, TerminalLook } from '../visual/terminal.ts';

const CARD_W = 284;
const CARD_H = 150;
const COLUMN_X = [168, 480, 792];
const ROW_Y = [212, 378];

type Card = { contract: Contract; frame: Phaser.GameObjects.Rectangle; locked: boolean };

/**
 * The contract board: endless random jobs in three sections. Each shows how
 * long your CPU would take for the whole job (instructions x CPI x clock
 * period); jobs that would take over 30 days are locked until it's faster.
 */
export class BoardScene extends Phaser.Scene {
  private look!: TerminalLook;
  private cards: Card[] = [];
  private selected = 0;
  private message!: Phaser.GameObjects.Text;

  constructor() {
    super('board');
  }

  init(): void {
    this.cards = [];
  }

  create(): void {
    this.look = new TerminalLook(this, ERAS.at(getSettings().eraIndex) ?? ERAS[0]);
    const progress = getProgress();
    const { era } = this.look;

    this.text(480, 26, 'CONTRACT BOARD', 26).setFontStyle('bold');
    this.text(930, 26, formatMoney(progress.money), 22).setOrigin(1, 0.5);
    const tier = tierOf(progress);
    const worn = progress.chipMaxDial < THERMAL.maxDial ? `   CHIP WORN: MAX ${Math.round(progress.chipMaxDial * 100)}%` : '';
    this.text(480, 62, `YOUR CPU: TIER ${tier.number} ${tier.name} AT ${formatMhz(ratedMhz(progress))}${worn}`, 15).setAlpha(0.8);

    SECTIONS.forEach((section, column) => {
      this.text(COLUMN_X[column], 104, section.name, 18).setFontStyle('bold');
      const [soon, late] = section.deadline;
      this.text(COLUMN_X[column], 126, `NEEDED IN ${formatDuration(soon)} TO ${formatDuration(late)}`, 12).setAlpha(0.6);
      progress.board
        .filter((c) => c.section === section.id)
        .forEach((contract, row) => this.drawCard(contract, COLUMN_X[column], ROW_Y[row]));
    });

    this.message = this.text(480, 474, '', 15).setColor(cssColor(era.fire[1]));
    this.text(480, 506, '[ARROWS] CHOOSE    [ENTER] TAKE CONTRACT    [S] SHOP    [M] HUM    [Q] TITLE', 15).setAlpha(0.7);
    this.text(480, 528, 'TIME = INSTRUCTIONS x CPI x CLOCK PERIOD. MISS THE DEADLINE (A SLOPPY RUN RAISES CPI): HALF PAY.', 12).setAlpha(0.5);

    // Start on the first contract that can be taken.
    this.selected = Math.max(0, this.cards.findIndex((c) => !c.locked));
    this.highlight();
    this.bindKeys();
    playMenuMusic(this);
  }

  update(): void {
    this.look.update();
  }

  private text(x: number, y: number, content: string, size: number): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, content, { fontFamily: 'monospace', fontSize: `${size}px`, color: cssColor(this.look.era.fg) })
      .setOrigin(0.5);
  }

  private drawCard(contract: Contract, x: number, y: number): void {
    const progress = getProgress();
    const { era } = this.look;
    const spec = programByName(contract.program);
    const locked = isLocked(contract, progress);
    const frame = this.add.rectangle(x, y, CARD_W, CARD_H, era.fg, 0).setStrokeStyle(1, era.fg, 0.4);
    const left = x - CARD_W / 2 + 14;
    const line = (dy: number, content: string, size = 14) =>
      this.text(left, y - CARD_H / 2 + dy, content, size).setOrigin(0, 0.5).setAlpha(locked ? 0.5 : 0.95);

    line(22, spec.client ?? spec.name, 16).setFontStyle('bold');
    this.text(x + CARD_W / 2 - 14, y - CARD_H / 2 + 22, formatMoney(contract.pay), 16)
      .setOrigin(1, 0.5)
      .setAlpha(locked ? 0.5 : 1);
    // Squeezed to fit the card if the job's description is long.
    const job = line(48, `${spec.verb} ${formatCount(jobItems(contract))} ${spec.unit}`);
    job.setScale(Math.min(1, (CARD_W - 28) / job.width), 1);
    line(68, `= ${formatCount(contract.instructions)} INSTRUCTIONS`, 13).setAlpha(locked ? 0.4 : 0.7);
    line(94, `NEEDED IN: ${formatDuration(contract.deadline)}`, 15);
    const time = line(116, `YOUR CPU:  ${formatDuration(contractSeconds(contract, progress))}`, 15);
    if (locked) {
      time.setColor(cssColor(era.fire[2])).setAlpha(1);
      line(138, 'TOO SLOW: NEEDS A FASTER CPU', 13).setColor(cssColor(era.fire[1])).setAlpha(1);
    } else if (isTight(contract, progress)) {
      time.setColor(cssColor(era.fire[1]));
      line(138, 'TIGHT: PLAY CLEANLY OR BE LATE', 13).setColor(cssColor(era.fire[1]));
    }

    const index = this.cards.length;
    this.cards.push({ contract, frame, locked });
    frame.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.selected = index;
      this.highlight();
      this.take();
    });
  }

  private highlight(): void {
    const { fg } = this.look.era;
    this.cards.forEach((card, i) => {
      const on = i === this.selected;
      card.frame.setStrokeStyle(on ? 2 : 1, fg, on ? 1 : 0.4).setFillStyle(fg, on ? 0.08 : 0);
    });
    this.message.setText('');
  }

  private take(): void {
    const card = this.cards[this.selected];
    if (!card) return;
    if (card.locked) {
      uiSound(this, 'error');
      this.message.setText('TOO SLOW FOR THIS JOB: A FASTER CLOCK OR NEW PARTS IN THE SHOP [S] WILL GET YOU THERE');
      return;
    }
    uiSound(this, 'confirm');
    playContract(this, card.contract);
  }

  /** Arrow keys move within the 3 x 2 grid of cards (cards are stored column by column). */
  private move(dx: number, dy: number): void {
    const rows = ROW_Y.length;
    const column = Math.floor(this.selected / rows);
    const row = this.selected % rows;
    const next = Phaser.Math.Wrap(column + dx, 0, COLUMN_X.length) * rows + Phaser.Math.Clamp(row + dy, 0, rows - 1);
    if (next < this.cards.length && next !== this.selected) {
      this.selected = next;
      uiSound(this, 'move');
    }
    this.highlight();
  }

  private bindKeys(): void {
    onKeyDown(this, (event) => {
      const key = keyOf(event);
      if (key === 'ArrowLeft') this.move(-1, 0);
      else if (key === 'ArrowRight') this.move(1, 0);
      else if (key === 'ArrowUp') this.move(0, -1);
      else if (key === 'ArrowDown') this.move(0, 1);
      else if (key === 'Enter' || key === ' ') this.take();
      else if (key === 'S') {
        uiSound(this, 'confirm');
        this.scene.start('shop');
      } else if (key === 'M') toggleMenuMusic(this);
      else if (key === 'Escape' || key === 'Q') this.scene.start('title');
    });
  }
}
