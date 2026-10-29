import { playMenuMusic, toggleMenuMusic, uiSound } from '../audio/menu.ts';
import { SECTIONS } from '../data/economy.ts';
import { programByName } from '../data/programs.ts';
import { playContract } from '../flow.ts';
import { formatCount, formatDuration, formatMhz, formatMoney } from '../format.ts';
import { keyOf, onKeyDown } from '../input/keys.ts';
import { getProgress } from '../save.ts';
import { contractSeconds, isLocked, isTight, jobItems, ratedMhz, tierOf, type Contract } from '../sim/progress.ts';
import { THERMAL } from '../sim/thermal.ts';
import { cssColor, currentEra, TerminalLook } from '../visual/terminal.ts';
import { isSmooth, textBase } from '../visual/display.ts';
import { bevel, dropShadow, isClassic, isDos } from '../visual/bevel.ts';

const CARD_W = 284;
const CARD_H = 150;
const COLUMN_X = [168, 480, 792];
const ROW_Y = [212, 378];

/** A card on the board; on the classic desktop it's a raised panel (`edges`) that presses in when taken. */
type Card = {
  contract: Contract;
  frame: Phaser.GameObjects.Rectangle;
  locked: boolean;
  edges?: Phaser.GameObjects.Graphics;
  texts: Phaser.GameObjects.Text[];
};

/** A taken card stays pressed in this long (ms) before its contract starts, like a real button on release. */
const PRESS_MS = 130;

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
    this.look = new TerminalLook(this, currentEra());
    const progress = getProgress();
    const { era } = this.look;

    this.text(480, 26, 'CONTRACT BOARD', 26).setFontStyle('bold');
    this.text(930, 26, formatMoney(progress.money), 22).setOrigin(1, 0.5);
    const tier = tierOf(progress);
    const worn = progress.chipMaxDial < THERMAL.maxDial ? `   CHIP WORN: MAX ${Math.round(progress.chipMaxDial * 100)}%` : '';
    this.text(480, 62, `YOUR CPU: TIER ${tier.number} ${tier.name} AT ${formatMhz(ratedMhz(progress))}${worn}`, 15).setAlpha(0.8);

    SECTIONS.forEach((section, column) => {
      this.text(COLUMN_X[column], 104, section.name, 18).setFontStyle('bold').setColor(cssColor(era.accent));
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
    const first = this.cards[this.selected]?.frame;
    this.selector = isSmooth() && first ? this.add.rectangle(first.x, first.y, CARD_W + 8, CARD_H + 8).setStrokeStyle(2, era.accent, 1) : undefined;
    this.highlight();
    this.bindKeys();
    playMenuMusic(this);
  }

  update(): void {
    this.look.update();
  }

  private text(x: number, y: number, content: string, size: number): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, content, { ...textBase(), fontSize: `${size}px`, color: cssColor(this.look.era.fg) })
      .setOrigin(0.5);
  }

  private drawCard(contract: Contract, x: number, y: number): void {
    const progress = getProgress();
    const { era } = this.look;
    const spec = programByName(contract.program);
    const locked = isLocked(contract, progress);
    const frame = this.add.rectangle(x, y, CARD_W, CARD_H, era.accent, 0).setStrokeStyle(1, era.accent, 0.4);
    // On the classic desktop, each card is a raised panel.
    const edges = isClassic(era) ? bevel(this.add.graphics(), era, x - CARD_W / 2, y - CARD_H / 2, CARD_W, CARD_H, true) : undefined;
    // DOS: a double-line card with a solid shadow.
    if (isDos(era)) {
      const lines = dropShadow(this.add.graphics(), x - CARD_W / 2, y - CARD_H / 2, CARD_W, CARD_H);
      lines.lineStyle(1, era.accent, 0.6).strokeRect(x - CARD_W / 2 + 3, y - CARD_H / 2 + 3, CARD_W - 6, CARD_H - 6);
    }
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
      time.setColor(cssColor(era.fire[2])).setAlpha(1);
      line(138, 'TOO SLOW: NEEDS A FASTER CPU', 13).setColor(cssColor(era.fire[1])).setAlpha(1);
    } else if (isTight(contract, progress)) {
      time.setColor(cssColor(era.fire[1]));
      line(138, 'TIGHT: PLAY CLEANLY OR BE LATE', 13).setColor(cssColor(era.fire[1]));
    }

    const index = this.cards.length;
    this.cards.push({ contract, frame, locked, edges, texts });
    frame.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.selected = index;
      this.highlight();
      this.take();
    });
  }

  private highlight(): void {
    const { accent: fg } = this.look.era;
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
      uiSound(this, 'error');
      this.message.setText('TOO SLOW FOR THIS JOB: A FASTER CLOCK OR NEW PARTS IN THE SHOP [S] WILL GET YOU THERE');
      return;
    }
    uiSound(this, 'confirm');
    const { edges } = card;
    if (!edges) {
      playContract(this, card.contract);
      return;
    }
    // The classic desktop: the card presses in, and the contract starts as it's released.
    this.busy = true;
    const [x, y] = [card.frame.x - CARD_W / 2, card.frame.y - CARD_H / 2];
    bevel(edges.clear(), this.look.era, x, y, CARD_W, CARD_H, false);
    for (const text of card.texts) text.setPosition(text.x + 1, text.y + 1);
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
      uiSound(this, 'move');
    }
    this.highlight();
  }

  private bindKeys(): void {
    onKeyDown(this, (event) => {
      if (this.busy) return;
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
