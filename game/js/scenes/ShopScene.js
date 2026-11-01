import { teachAfterPurchase } from '../flow.js';
import { formatMhz, formatMoney } from '../format.js';
import { getProgress, setProgress } from '../save.js';
import { bitsName, buy, cpuLine, ratedMhz, shopItems } from '../sim/progress.js';
import { ListMenu } from '../ui/list.js';
import { Screen } from '../ui/screen.js';
import { chipInfo, ChipView } from '../visual/chip3d.js';
const LIST_X = 56;
const LIST_RIGHT = 590;
const LIST_TOP = 100;
const ROW_H = 19;
/** The spinning chip's center, and its info lines under it. */
const CHIP_X = 770;
const CHIP_Y = 210;
const INFO_Y = 358;
/** A purchase shakes the chip this long (ms); TICK's lesson on the part starts after it. */
const SHAKE_MS = 700;
/**
 * The shop: CPU parts (each the next tier), clock upgrades, overclocking,
 * cooling, and chip repairs, with a 3D model of your chip that changes with
 * every purchase and shakes when something is fitted.
 */
export class ShopScene extends Screen {
    menu;
    chip;
    chipInfo;
    money;
    cpu;
    about;
    message;
    shakeUntil = 0;
    /** A purchase is shaking the chip before its lesson: ignore keys until then. */
    busy = false;
    constructor() {
        super('shop');
    }
    init() {
        this.shakeUntil = 0;
        this.busy = false;
    }
    /** `selected` and `message`: where a restart for a new era (after buying a chip) leaves off. */
    create(data) {
        this.setUp();
        this.chip = new ChipView(this, this.era, CHIP_X, CHIP_Y);
        this.chipInfo = this.text(CHIP_X, INFO_Y, '', 14).setOrigin(0.5, 0).setAlign('center').setLineSpacing(4);
        // The line under the title: your CPU, filled in by refresh().
        this.cpu = this.header('SHOP', '').subtitle;
        this.money = this.corner('');
        this.menu = new ListMenu(this, this.era, { x: LIST_X, top: LIST_TOP, width: LIST_RIGHT - LIST_X, rowHeight: ROW_H, size: 15 });
        this.about = this.aboutLine();
        this.message = this.messageLine();
        this.hints('[UP/DOWN] CHOOSE', '[ENTER] BUY', '[B] CONTRACT BOARD', '[M] HUM', '[ESC] MENU');
        this.refresh(data?.selected ?? Math.max(0, shopItems(getProgress()).findIndex((item) => item.state === 'buy')));
        if (data?.message)
            this.message.setText(data.message);
    }
    onKey(key) {
        if (this.busy || this.menu.busy)
            return true;
        if (key === 'ArrowUp' || key === 'ArrowDown') {
            this.menu.move(key === 'ArrowUp' ? -1 : 1);
            this.message.setText('');
            this.showAbout();
        }
        else if (key === 'Enter' || key === ' ')
            this.menu.press(() => this.purchase());
        else if (key === 'B' || key === 'S') {
            this.cue('confirm');
            this.scene.start('board');
        }
        else
            return false;
        return true;
    }
    pauseItems() {
        return this.places();
    }
    update(time, delta) {
        super.update();
        // The chip spins and hums with a faint tremble, and shakes hard just after a purchase.
        const hard = time < this.shakeUntil;
        const amount = hard ? 5 * ((this.shakeUntil - time) / SHAKE_MS) + 1 : 0.6;
        this.chip.moveTo(CHIP_X + (Math.random() - 0.5) * 2 * amount, CHIP_Y + (Math.random() - 0.5) * 2 * amount);
        this.chip.update(delta, getProgress().cooling);
    }
    purchase() {
        const progress = getProgress();
        const item = shopItems(progress)[this.menu.selected];
        if (!item)
            return;
        const bought = buy(progress, item.key);
        if (!bought) {
            this.cue('error');
            this.message.setText(item.state === 'owned' ? 'ALREADY YOURS.' : item.state === 'later' ? 'BUY THE ONE ABOVE IT FIRST.' : item.state === 'max' ? 'NOTHING TO BUY HERE.' : 'NOT ENOUGH MONEY YET: TAKE MORE CONTRACTS.');
            return;
        }
        setProgress(bought);
        this.cue('buy');
        this.shakeUntil = this.time.now + SHAKE_MS;
        this.refresh();
        this.message.setText(item.lessonId !== undefined
            ? 'FITTED! TICK WILL SHOW YOU HOW IT WORKS...'
            : item.group === 'CLOCK'
                ? `CLOCK NOW ${formatMhz(ratedMhz(bought))}: CONTRACTS TAKE LESS TIME AND THE BEAT IS FASTER.`
                : 'FITTED!');
        // New hardware comes with TICK's lesson on it: it starts once the chip stops shaking.
        const lessonId = item.lessonId;
        if (lessonId !== undefined) {
            this.busy = true;
            this.time.delayedCall(SHAKE_MS + 300, () => teachAfterPurchase(this, lessonId));
        }
        else if (this.eraChanged()) {
            // A new chip moves the computer into its era: the shop comes back in the new look.
            this.busy = true;
            const selected = this.menu.selected;
            const message = `YOUR COMPUTER IS NOW ${bitsName(bought.wordBits)}.`;
            this.time.delayedCall(SHAKE_MS + 300, () => this.scene.restart({ selected, message }));
        }
    }
    /** Everything that changes with a purchase: the list, the money, the CPU line and the chip. */
    refresh(selected = this.menu.selected) {
        const progress = getProgress();
        this.money.setText(formatMoney(progress.money));
        this.cpu.setText(`YOUR CPU: ${cpuLine(progress)}`);
        let group = '';
        const rows = shopItems(progress).map((item) => {
            const heading = item.group !== group ? item.group : undefined;
            group = item.group;
            return { ...this.row(item, progress.money), group: heading };
        });
        this.menu.setRows(rows, selected);
        this.chip.setModel(progress);
        this.chipInfo.setText(chipInfo(progress).join('\n'));
        this.showAbout();
    }
    showAbout() {
        this.about.setText(shopItems(getProgress())[this.menu.selected]?.about ?? '');
    }
    /** An item's row: its name, its price, and whether you can buy it. */
    row(item, money) {
        const affordable = item.state === 'buy' && money >= item.price;
        const status = item.state === 'owned' ? 'OWNED' : item.state === 'later' ? 'LATER' : item.state === 'max' ? '' : affordable ? 'BUY' : 'NEED $';
        return {
            label: item.name,
            middle: item.state !== 'max' && item.state !== 'owned' ? formatMoney(item.price) : undefined,
            value: status,
            alpha: item.state === 'buy' ? (affordable ? 1 : 0.6) : 0.4,
        };
    }
}
//# sourceMappingURL=ShopScene.js.map