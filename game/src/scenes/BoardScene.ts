import { SECTIONS } from '../data/economy.ts';
import { programByName } from '../data/programs.ts';
import { playContract } from '../flow.ts';
import { formatCount, formatDuration, formatMoney } from '../format.ts';
import { getProgress } from '../save.ts';
import { contractSeconds, cpuLine, isLocked, isTight, jobItems, type Contract } from '../sim/progress.ts';
import { THERMAL } from '../sim/thermal.ts';
import { cssColor } from '../ui/eras.ts';
import { Screen } from '../ui/screen.ts';
import { ALPHA, LAYOUT, TEXT } from '../ui/theme.ts';
import { Box } from '../ui/widgets.ts';
import { isSmooth } from '../visual/display.ts';

const CARD_W = 284;
const CARD_H = 150;
const COLUMN_X = [168, 480, 792];
const ROW_Y = [212, 378];

/** A card on the board: a box drawn as its era draws one (ui/widgets.ts), its frame lit when chosen. */
type Card = {
  contract: Contract;
  box: Box;
  frame: Phaser.GameObjects.Rectangle;
  locked: boolean;
  texts: Phaser.GameObjects.Text[];
};

/** A taken card stays pressed in this long (ms) before its contract starts, like a real button on release. */
const PRESS_MS = 130;

/**
 * The contract board: endless random jobs in three sections. Each shows how
 * long your CPU would take for the whole job (instructions x CPI x clock
 * period); jobs that would take over 30 days are locked until it's faster.
 */
export class BoardScene extends Screen {
  private cards: Card[] = [];
  private selected = 0;
  private message!: Phaser.GameObjects.Text;
  /** A card is pressed in and its contract about to start: ignore keys. */
  private busy = false;
  /** The modern era's selection frame, which glides from card to card. */
  private selector: Phaser.GameObjects.Rectangle | undefined;

  constructor() {
    super('board');
  }

  init(): void {
    this.cards = [];
    this.busy = false;
  }

  create(): void {
    this.setUp();
    const progress = getProgress();
    const { era } = this;

    const worn = progress.chipMaxDial < THERMAL.maxDial ? `   CHIP WORN: MAX ${Math.round(progress.chipMaxDial * 100)}%` : '';
    this.header('CONTRACT BOARD', `YOUR CPU: ${cpuLine(progress)}${worn}`);
    this.corner(formatMoney(progress.money));

    SECTIONS.forEach((section, column) => {
      this.text(COLUMN_X[column], 104, section.name, 18).setFontStyle('bold').setColor(cssColor(era.accent));
      const [soon, late] = section.deadline;
      this.text(COLUMN_X[column], 126, `NEEDED IN ${formatDuration(soon)} TO ${formatDuration(late)}`, 12).setAlpha(0.6);
      progress.board
        .filter((c) => c.section === section.id)
        .forEach((contract, row) => this.drawCard(contract, COLUMN_X[column], ROW_Y[row]));
    });

    this.text(480, LAYOUT.about, 'TIME = INSTRUCTIONS x CPI x CLOCK PERIOD. MISS THE DEADLINE (A SLOPPY RUN RAISES CPI): HALF PAY.', TEXT.small - 1).setAlpha(ALPHA.subtitle);
    this.message = this.messageLine();
    this.hints('[ARROWS] CHOOSE', '[ENTER] TAKE CONTRACT', '[S] SHOP', '[M] HUM', '[Q] MAIN MENU');

    // Start on the first contract that can be taken.
    this.selected = Math.max(0, this.cards.findIndex((c) => !c.locked));
    const first = this.cards[this.selected]?.frame;
    this.selector = isSmooth() && first ? this.add.rectangle(first.x, first.y, CARD_W + 8, CARD_H + 8).setStrokeStyle(2, era.accent, 1) : undefined;
    this.highlight();
  }

  private drawCard(contract: Contract, x: number, y: number): void {
    const progress = getProgress();
    const { era } = this;
    const spec = programByName(contract.program);
    const locked = isLocked(contract, progress);
    // Its frame lights up when chosen (highlight()); the box draws the era's card (raised, or double-lined with a shadow).
    const box = new Box(this, era, x, y, CARD_W, CARD_H, { fill: null, stroke: era.accent, strokeAlpha: 0.4, shadow: 6 });
    const frame = box.body;
    const left = x - CARD_W / 2 + 14;
    const texts: Phaser.GameObjects.Text[] = [];
    const line = (dy: number, content: string, size = 14) => {
      const text = this.text(left, y - CARD_H / 2 + dy, content, size).setOrigin(0, 0.5).setAlpha(locked ? 0.5 : 0.95);
      texts.push(text);
      return text;
    };

    line(22, spec.client ?? spec.name, 16).setFontStyle('bold');
    const pay = this.text(x + CARD_W / 2 - 14, y - CARD_H / 2 + 22, formatMoney(contract.pay), 16)
      .setOrigin(1, 0.5)
      .setAlpha(locked ? 0.5 : 1);
    texts.push(pay);
    // Squeezed to fit the card if the job's description is long.
    const job = line(48, `${spec.verb} ${formatCount(jobItems(contract))} ${spec.unit}`);
    job.setScale(Math.min(1, (CARD_W - 28) / job.width), 1);
    line(68, `= ${formatCount(contract.instructions)} INSTRUCTIONS`, 13).setAlpha(locked ? 0.4 : 0.7);
    line(94, `NEEDED IN: ${formatDuration(contract.deadline)}`, 15);
    const time = line(116, `YOUR CPU:  ${formatDuration(contractSeconds(contract, progress))}`, 15);
    if (locked) {
      time.setColor(cssColor(this.colors.danger)).setAlpha(1);
      line(138, 'TOO SLOW: NEEDS A FASTER CPU', 13).setColor(cssColor(this.colors.warn)).setAlpha(1);
    } else if (isTight(contract, progress)) {
      time.setColor(cssColor(this.colors.warn));
      line(138, 'TIGHT: PLAY CLEANLY OR BE LATE', 13).setColor(cssColor(this.colors.warn));
    }

    const index = this.cards.length;
    this.cards.push({ contract, box, frame, locked, texts });
    frame.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.selected = index;
      this.highlight();
      this.take();
    });
  }

  private highlight(): void {
    const { accent: fg } = this.era;
    const { selector } = this;
    this.cards.forEach((card, i) => {
      const on = i === this.selected;
      if (!selector) {
        card.frame.setStrokeStyle(on ? 2 : 1, fg, on ? 1 : 0.4).setFillStyle(fg, on ? 0.08 : 0);
        return;
      }
      // Modern: the chosen card's tint fades in while the frame glides over to it.
      this.tweens.killTweensOf(card.frame);
      this.tweens.add({ targets: card.frame, fillAlpha: on ? 0.08 : 0, duration: 180, ease: 'Quad.Out' });
      if (on) {
        this.tweens.killTweensOf(selector);
        this.tweens.add({ targets: selector, x: card.frame.x, y: card.frame.y, duration: 200, ease: 'Cubic.Out' });
      }
    });
    this.message.setText('');
  }

  private take(): void {
    const card = this.cards[this.selected];
    if (!card) return;
    if (card.locked) {
      this.cue('error');
      this.message.setText('TOO SLOW FOR THIS JOB: A FASTER CLOCK OR NEW PARTS IN THE SHOP [S] WILL GET YOU THERE');
      return;
    }
    this.cue('confirm');
    if (!card.box.canPress) {
      playContract(this, card.contract);
      return;
    }
    // The 90s desktop: the card presses in, and the contract starts as it's released.
    this.busy = true;
    card.box.press(true, card.texts);
    this.time.delayedCall(PRESS_MS, () => playContract(this, card.contract));
  }

  /** Arrow keys move within the 3 x 2 grid of cards (cards are stored column by column). */
  private move(dx: number, dy: number): void {
    const rows = ROW_Y.length;
    const column = Math.floor(this.selected / rows);
    const row = this.selected % rows;
    const next = Phaser.Math.Wrap(column + dx, 0, COLUMN_X.length) * rows + Phaser.Math.Clamp(row + dy, 0, rows - 1);
    if (next < this.cards.length && next !== this.selected) {
      this.selected = next;
      this.cue('move');
    }
    this.highlight();
  }

  protected onKey(key: string): boolean | void {
    if (this.busy) return true;
    if (key === 'ArrowLeft') this.move(-1, 0);
    else if (key === 'ArrowRight') this.move(1, 0);
    else if (key === 'ArrowUp') this.move(0, -1);
    else if (key === 'ArrowDown') this.move(0, 1);
    else if (key === 'Enter' || key === ' ') this.take();
    else if (key === 'S') {
      this.cue('confirm');
      this.scene.start('shop');
    } else if (key === 'Escape' || key === 'Q') this.back();
    else return false;
    return true;
  }
}
