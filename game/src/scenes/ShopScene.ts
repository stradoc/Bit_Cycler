import { briefAfterPurchase } from '../flow.ts';
import { formatMhz, formatMoney } from '../format.ts';
import { getProgress, setProgress } from '../save.ts';
import { buy, ratedMhz, shopItems, tierOf, type ShopItem } from '../sim/progress.ts';
import { ListMenu, type MenuRow } from '../ui/list.ts';
import { Screen } from '../ui/screen.ts';
import { chipInfo, ChipView } from '../visual/chip3d.ts';

const LIST_X = 56;
const LIST_RIGHT = 590;
const LIST_TOP = 100;
const ROW_H = 21;
/** The spinning chip's center, and its info lines under it. */
const CHIP_X = 770;
const CHIP_Y = 210;
const INFO_Y = 358;
/** A purchase shakes the chip this long (ms); a part's briefing starts after it. */
const SHAKE_MS = 700;

/**
 * The shop: CPU parts (each the next tier), clock upgrades, overclocking,
 * cooling, and chip repairs, with a 3D model of your chip that changes with
 * every purchase and shakes when something is fitted.
 */
export class ShopScene extends Screen {
  private menu!: ListMenu;
  private chip!: ChipView;
  private chipInfo!: Phaser.GameObjects.Text;
  private money!: Phaser.GameObjects.Text;
  private cpu!: Phaser.GameObjects.Text;
  private about!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private shakeUntil = 0;
  /** A purchase is shaking the chip before its briefing: ignore keys until then. */
  private busy = false;

  constructor() {
    super('shop');
  }

  init(): void {
    this.shakeUntil = 0;
    this.busy = false;
  }

  create(): void {
    this.setUp();
    this.chip = new ChipView(this, this.era, CHIP_X, CHIP_Y);
    this.chipInfo = this.text(CHIP_X, INFO_Y, '', 14).setOrigin(0.5, 0).setAlign('center').setLineSpacing(4);
    // The line under the title: your CPU, filled in by refresh().
    this.cpu = this.header('SHOP', '').subtitle!;
    this.money = this.corner('');
    this.menu = new ListMenu(this, this.era, { x: LIST_X, top: LIST_TOP, width: LIST_RIGHT - LIST_X, rowHeight: ROW_H, size: 15 });
    this.about = this.aboutLine();
    this.message = this.messageLine();
    this.hints('[UP/DOWN] CHOOSE', '[ENTER] BUY', '[B] CONTRACT BOARD', '[M] HUM', '[Q] MAIN MENU');
    this.refresh(Math.max(0, shopItems(getProgress()).findIndex((item) => item.state === 'buy')));
  }

  protected onKey(key: string): boolean | void {
    if (this.busy || this.menu.busy) return true;
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      this.menu.move(key === 'ArrowUp' ? -1 : 1);
      this.message.setText('');
      this.showAbout();
    } else if (key === 'Enter' || key === ' ') this.menu.press(() => this.purchase());
    else if (key === 'B' || key === 'S') {
      this.cue('confirm');
      this.scene.start('board');
    } else if (key === 'Escape' || key === 'Q') this.back();
    else return false;
    return true;
  }

  update(time: number, delta: number): void {
    super.update();
    // The chip spins and hums with a faint tremble, and shakes hard just after a purchase.
    const hard = time < this.shakeUntil;
    const amount = hard ? 5 * ((this.shakeUntil - time) / SHAKE_MS) + 1 : 0.6;
    this.chip.moveTo(CHIP_X + (Math.random() - 0.5) * 2 * amount, CHIP_Y + (Math.random() - 0.5) * 2 * amount);
    this.chip.update(delta, getProgress().cooling);
  }

  private purchase(): void {
    const progress = getProgress();
    const item = shopItems(progress)[this.menu.selected];
    if (!item) return;
    const bought = buy(progress, item.key);
    if (!bought) {
      this.cue('error');
      this.message.setText(
        item.state === 'owned' ? 'ALREADY YOURS.' : item.state === 'later' ? 'BUY THE ONE ABOVE IT FIRST.' : item.state === 'max' ? 'NOTHING TO BUY HERE.' : 'NOT ENOUGH MONEY YET: TAKE MORE CONTRACTS.',
      );
      return;
    }
    setProgress(bought);
    this.cue('buy');
    this.shakeUntil = this.time.now + SHAKE_MS;
    this.refresh();
    this.message.setText(
      item.lessonId !== undefined
        ? 'FITTED! NOW ITS BRIEFING...'
        : item.group === 'CLOCK'
          ? `CLOCK NOW ${formatMhz(ratedMhz(bought))}: CONTRACTS TAKE LESS TIME AND THE BEAT IS FASTER.`
          : 'FITTED!',
    );
    // New hardware comes with a briefing you have to read: it starts once the chip stops shaking.
    const lessonId = item.lessonId;
    if (lessonId !== undefined) {
      this.busy = true;
      this.time.delayedCall(SHAKE_MS + 300, () => briefAfterPurchase(this, lessonId));
    }
  }

  /** Everything that changes with a purchase: the list, the money, the CPU line and the chip. */
  private refresh(selected = this.menu.selected): void {
    const progress = getProgress();
    const tier = tierOf(progress);
    this.money.setText(formatMoney(progress.money));
    this.cpu.setText(`YOUR CPU: TIER ${tier.number} ${tier.name} AT ${formatMhz(ratedMhz(progress))}`);
    let group = '';
    const rows = shopItems(progress).map((item): MenuRow => {
      const heading = item.group !== group ? item.group : undefined;
      group = item.group;
      return { ...this.row(item, progress.money), group: heading };
    });
    this.menu.setRows(rows, selected);
    this.chip.setModel(progress);
    this.chipInfo.setText(chipInfo(progress).join('\n'));
    this.showAbout();
  }

  private showAbout(): void {
    this.about.setText(shopItems(getProgress())[this.menu.selected]?.about ?? '');
  }

  /** An item's row: its name, its price, and whether you can buy it. */
  private row(item: ShopItem, money: number): MenuRow {
    const affordable = item.state === 'buy' && money >= item.price;
    const status =
      item.state === 'owned' ? 'OWNED' : item.state === 'later' ? 'LATER' : item.state === 'max' ? '' : affordable ? 'BUY' : 'NEED $';
    return {
      label: item.name,
      middle: item.state !== 'max' && item.state !== 'owned' ? formatMoney(item.price) : undefined,
      value: status,
      alpha: item.state === 'buy' ? (affordable ? 1 : 0.6) : 0.4,
    };
  }
}
