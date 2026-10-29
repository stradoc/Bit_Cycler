import { playMenuMusic, toggleMenuMusic, uiSound } from '../audio/menu.js';
import { briefAfterPurchase } from '../flow.js';
import { formatMhz, formatMoney } from '../format.js';
import { keyOf, onKeyDown } from '../input/keys.js';
import { getProgress, setProgress } from '../save.js';
import { getSettings } from '../settings.js';
import { buy, ratedMhz, shopItems, tierOf } from '../sim/progress.js';
import { chipArt } from '../visual/chipArt.js';
import { cssColor, ERAS, TerminalLook } from '../visual/terminal.js';
const LIST_X = 56;
const LIST_RIGHT = 590;
const LIST_TOP = 104;
const ROW_H = 24;
const CHIP_X = 770;
const CHIP_Y = 230;
/** A purchase shakes the chip this long (ms); a part's briefing starts after it. */
const SHAKE_MS = 700;
/**
 * The shop: CPU parts (each the next tier), clock upgrades, overclocking,
 * cooling, and chip repairs, with ASCII art of your chip that changes with
 * every purchase and shakes when something is fitted.
 */
export class ShopScene extends Phaser.Scene {
    look;
    selected = 0;
    message = '';
    parts = [];
    chip;
    shakeUntil = 0;
    /** A purchase is shaking the chip before its briefing: ignore keys until then. */
    busy = false;
    constructor() {
        super('shop');
    }
    init() {
        this.message = '';
        this.parts = [];
        this.shakeUntil = 0;
        this.busy = false;
    }
    create() {
        this.look = new TerminalLook(this, ERAS.at(getSettings().eraIndex) ?? ERAS[0]);
        this.chip = this.add
            .text(CHIP_X, CHIP_Y, '', { fontFamily: 'monospace', fontSize: '14px', color: cssColor(this.look.era.fg), align: 'center' })
            .setOrigin(0.5)
            .setLineSpacing(2);
        this.selected = Math.max(0, shopItems(getProgress()).findIndex((item) => item.state === 'buy'));
        this.render();
        playMenuMusic(this);
        onKeyDown(this, (event) => {
            if (this.busy)
                return;
            const key = keyOf(event);
            const count = shopItems(getProgress()).length;
            if (key === 'ArrowUp')
                this.select(Phaser.Math.Wrap(this.selected - 1, 0, count));
            else if (key === 'ArrowDown')
                this.select(Phaser.Math.Wrap(this.selected + 1, 0, count));
            else if (key === 'Enter' || key === ' ')
                this.purchase();
            else if (key === 'M')
                toggleMenuMusic(this);
            else if (key === 'B' || key === 'S') {
                uiSound(this, 'confirm');
                this.scene.start('board');
            }
            else if (key === 'Escape' || key === 'Q')
                this.scene.start('title');
        });
    }
    update(time) {
        this.look.update();
        // The chip hums with a faint tremble, and shakes hard just after a purchase.
        const hard = time < this.shakeUntil;
        const amount = hard ? 5 * ((this.shakeUntil - time) / SHAKE_MS) + 1 : 0.6;
        this.chip.setPosition(CHIP_X + (Math.random() - 0.5) * 2 * amount, CHIP_Y + (Math.random() - 0.5) * 2 * amount);
    }
    text(x, y, content, size) {
        const t = this.add.text(x, y, content, { fontFamily: 'monospace', fontSize: `${size}px`, color: cssColor(this.look.era.fg) });
        this.parts.push(t);
        return t;
    }
    select(index) {
        if (index !== this.selected)
            uiSound(this, 'move');
        this.selected = index;
        this.message = '';
        this.render();
    }
    purchase() {
        const progress = getProgress();
        const item = shopItems(progress)[this.selected];
        if (!item)
            return;
        const bought = buy(progress, item.key);
        if (!bought) {
            uiSound(this, 'error');
            this.message =
                item.state === 'owned' ? 'ALREADY YOURS.' : item.state === 'later' ? 'BUY THE ONE ABOVE IT FIRST.' : item.state === 'max' ? 'NOTHING TO BUY HERE.' : 'NOT ENOUGH MONEY YET: TAKE MORE CONTRACTS.';
            this.render();
            return;
        }
        setProgress(bought);
        uiSound(this, 'buy');
        this.shakeUntil = this.time.now + SHAKE_MS;
        this.message =
            item.lessonId !== undefined
                ? 'FITTED! NOW ITS BRIEFING...'
                : item.group === 'CLOCK'
                    ? `CLOCK NOW ${formatMhz(ratedMhz(bought))}: EVERY CONTRACT TAKES LESS TIME.`
                    : 'FITTED!';
        this.render();
        // New hardware comes with a briefing you have to read: it starts once the chip stops shaking.
        const lessonId = item.lessonId;
        if (lessonId !== undefined) {
            this.busy = true;
            this.time.delayedCall(SHAKE_MS + 300, () => briefAfterPurchase(this, lessonId));
        }
    }
    render() {
        for (const part of this.parts)
            part.destroy();
        this.parts = [];
        const progress = getProgress();
        const { era } = this.look;
        const items = shopItems(progress);
        this.text(480, 26, 'SHOP', 26).setOrigin(0.5).setFontStyle('bold');
        this.text(930, 26, formatMoney(progress.money), 22).setOrigin(1, 0.5);
        const tier = tierOf(progress);
        this.text(480, 62, `YOUR CPU: TIER ${tier.number} ${tier.name} AT ${formatMhz(ratedMhz(progress))}`, 15).setOrigin(0.5).setAlpha(0.8);
        let y = LIST_TOP;
        let group = '';
        items.forEach((item, i) => {
            if (item.group !== group) {
                group = item.group;
                if (i > 0)
                    y += 4;
                this.text(LIST_X, y, group, 12).setOrigin(0, 0.5).setAlpha(0.55);
                y += ROW_H - 6;
            }
            this.drawRow(item, i === this.selected, y, progress.money);
            y += ROW_H;
        });
        this.chip.setText(chipArt(progress).join('\n'));
        const item = items[this.selected];
        this.text(480, 452, item?.about ?? '', 15).setOrigin(0.5).setAlign('center').setWordWrapWidth(860).setAlpha(0.9);
        this.text(480, 490, this.message, 15).setOrigin(0.5).setColor(cssColor(era.fire[1]));
        this.text(480, 516, '[UP/DOWN] CHOOSE    [ENTER] BUY    [B] CONTRACT BOARD    [M] HUM    [Q] TITLE', 14).setOrigin(0.5).setAlpha(0.7);
    }
    drawRow(item, selected, y, money) {
        const affordable = item.state === 'buy' && money >= item.price;
        const status = item.state === 'owned' ? 'OWNED' : item.state === 'later' ? 'LATER' : item.state === 'max' ? '' : affordable ? 'BUY' : 'NEED $';
        const alpha = item.state === 'buy' ? (affordable ? 1 : 0.6) : 0.4;
        if (selected) {
            const bar = this.add
                .rectangle((LIST_X - 8 + LIST_RIGHT + 8) / 2, y, LIST_RIGHT - LIST_X + 16, ROW_H - 2, this.look.era.fg, 0.1)
                .setStrokeStyle(1, this.look.era.fg, 0.8);
            this.parts.push(bar);
        }
        this.text(LIST_X, y, `${selected ? '>' : ' '} ${item.name}`, 15).setOrigin(0, 0.5).setAlpha(selected ? 1 : alpha);
        if (item.state !== 'max' && item.state !== 'owned') {
            this.text(LIST_RIGHT - 70, y, formatMoney(item.price), 15).setOrigin(1, 0.5).setAlpha(selected ? 1 : alpha);
        }
        this.text(LIST_RIGHT, y, status, 13).setOrigin(1, 0.5).setAlpha(selected ? 1 : alpha);
    }
}
//# sourceMappingURL=ShopScene.js.map