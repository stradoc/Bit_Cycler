import { playMenuMusic, toggleMenuMusic, uiSound } from '../audio/menu.js';
import { briefAfterPurchase } from '../flow.js';
import { formatMhz, formatMoney } from '../format.js';
import { keyOf, onKeyDown } from '../input/keys.js';
import { getProgress, setProgress } from '../save.js';
import { buy, ratedMhz, shopItems, tierOf } from '../sim/progress.js';
import { chipInfo, ChipView } from '../visual/chip3d.js';
import { cssColor, currentEra, TerminalLook } from '../visual/terminal.js';
import { isSmooth, textBase } from '../visual/display.js';
import { bevel, isClassic, isDos, palette } from '../visual/bevel.js';
const LIST_X = 56;
const LIST_RIGHT = 590;
const LIST_TOP = 104;
const ROW_H = 21;
/** The spinning chip's center, and its info lines under it. */
const CHIP_X = 770;
const CHIP_Y = 210;
const INFO_Y = 358;
/** The classic desktop's buy button stays pressed in this long (ms) before it acts, like a real button on release. */
const PRESS_MS = 130;
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
    chipInfo;
    /** The modern era's highlight bar: kept across redraws, so it can glide to the chosen row. */
    bar;
    /** The classic desktop's selected row: a raised button, pressed in by Enter. */
    button;
    shakeUntil = 0;
    /** A purchase is shaking the chip before its briefing: ignore keys until then. */
    busy = false;
    constructor() {
        super('shop');
    }
    init() {
        this.message = '';
        this.parts = [];
        this.bar = undefined;
        this.shakeUntil = 0;
        this.busy = false;
    }
    create() {
        this.look = new TerminalLook(this, currentEra());
        this.chip = new ChipView(this, this.look.era, CHIP_X, CHIP_Y);
        this.chipInfo = this.add
            .text(CHIP_X, INFO_Y, '', { ...textBase(), fontSize: '14px', color: cssColor(this.look.era.fg), align: 'center' })
            .setOrigin(0.5, 0)
            .setLineSpacing(4);
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
                this.press();
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
    update(time, delta) {
        this.look.update();
        // The chip spins and hums with a faint tremble, and shakes hard just after a purchase.
        const hard = time < this.shakeUntil;
        const amount = hard ? 5 * ((this.shakeUntil - time) / SHAKE_MS) + 1 : 0.6;
        this.chip.moveTo(CHIP_X + (Math.random() - 0.5) * 2 * amount, CHIP_Y + (Math.random() - 0.5) * 2 * amount);
        this.chip.update(delta, getProgress().cooling);
    }
    text(x, y, content, size) {
        const t = this.add.text(x, y, content, { ...textBase(), fontSize: `${size}px`, color: cssColor(this.look.era.fg) });
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
    /** Enter on the classic desktop: the selected button presses in, then the purchase happens as it comes back up. */
    press() {
        const { button } = this;
        if (!button || !isClassic(this.look.era)) {
            this.purchase();
            return;
        }
        this.busy = true;
        const { edges, x, y, w, h, texts } = button;
        edges.clear().fillStyle(palette(this.look.era).select).fillRect(x, y, w, h);
        bevel(edges, this.look.era, x, y, w, h, false);
        for (const text of texts)
            text.setPosition(text.x + 1, text.y + 1);
        this.time.delayedCall(PRESS_MS, () => {
            this.busy = false;
            this.purchase();
        });
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
                    ? `CLOCK NOW ${formatMhz(ratedMhz(bought))}: CONTRACTS TAKE LESS TIME AND THE BEAT IS FASTER.`
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
        this.button = undefined;
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
                this.text(LIST_X, y, group, 12).setOrigin(0, 0.5).setAlpha(0.7).setColor(cssColor(era.accent));
                y += ROW_H - 6;
            }
            this.drawRow(item, i === this.selected, y, progress.money);
            y += ROW_H;
        });
        this.chip.setModel(progress);
        this.chipInfo.setText(chipInfo(progress).join('\n'));
        const item = items[this.selected];
        this.text(480, 452, item?.about ?? '', 15).setOrigin(0.5).setAlign('center').setWordWrapWidth(860).setAlpha(0.9);
        this.text(480, 490, this.message, 15).setOrigin(0.5).setColor(cssColor(era.fire[1]));
        this.text(480, 516, '[UP/DOWN] CHOOSE    [ENTER] BUY    [B] CONTRACT BOARD    [M] HUM    [Q] TITLE', 14).setOrigin(0.5).setAlpha(0.7);
    }
    drawRow(item, selected, y, money) {
        const affordable = item.state === 'buy' && money >= item.price;
        const status = item.state === 'owned' ? 'OWNED' : item.state === 'later' ? 'LATER' : item.state === 'max' ? '' : affordable ? 'BUY' : 'NEED $';
        const alpha = item.state === 'buy' ? (affordable ? 1 : 0.6) : 0.4;
        if (selected && isSmooth()) {
            if (!this.bar) {
                this.bar = this.add
                    .rectangle((LIST_X - 8 + LIST_RIGHT + 8) / 2, y, LIST_RIGHT - LIST_X + 16, ROW_H - 2, this.look.era.accent, 0.1)
                    .setStrokeStyle(1, this.look.era.accent, 0.8)
                    .setDepth(-1);
            }
            this.tweens.killTweensOf(this.bar);
            this.tweens.add({ targets: this.bar, y, duration: 160, ease: 'Cubic.Out' });
        }
        else if (selected && isClassic(this.look.era)) {
            // The classic desktop: the selected row is a raised button in the selection color (Enter presses it in).
            const [x, top, w, h] = [LIST_X - 8, y - (ROW_H + 2) / 2, LIST_RIGHT - LIST_X + 16, ROW_H + 2];
            const edges = this.add.graphics().fillStyle(palette(this.look.era).select).fillRect(x, top, w, h);
            bevel(edges, this.look.era, x, top, w, h, true);
            this.parts.push(edges);
            this.button = { edges, x, y: top, w, h, texts: [] };
        }
        else if (selected && isDos(this.look.era)) {
            // DOS: a solid cyan bar with black text.
            this.parts.push(this.add.rectangle((LIST_X - 8 + LIST_RIGHT + 8) / 2, y, LIST_RIGHT - LIST_X + 16, ROW_H - 2, palette(this.look.era).select));
        }
        else if (selected) {
            const bar = this.add
                .rectangle((LIST_X - 8 + LIST_RIGHT + 8) / 2, y, LIST_RIGHT - LIST_X + 16, ROW_H - 2, this.look.era.accent, 0.1)
                .setStrokeStyle(1, this.look.era.accent, 0.8);
            this.parts.push(bar);
        }
        const classic = selected && isClassic(this.look.era);
        const solid = selected && (classic || isDos(this.look.era));
        const ink = solid ? cssColor(palette(this.look.era).selectText) : cssColor(this.look.era.fg);
        const texts = [this.text(LIST_X, y, `${selected ? '>' : ' '} ${item.name}`, 15).setOrigin(0, 0.5).setAlpha(selected ? 1 : alpha).setColor(ink)];
        if (item.state !== 'max' && item.state !== 'owned') {
            texts.push(this.text(LIST_RIGHT - 70, y, formatMoney(item.price), 15).setOrigin(1, 0.5).setAlpha(selected ? 1 : alpha).setColor(ink));
        }
        texts.push(this.text(LIST_RIGHT, y, status, 13).setOrigin(1, 0.5).setAlpha(selected ? 1 : alpha).setColor(ink));
        if (classic && this.button)
            this.button.texts = texts;
    }
}
//# sourceMappingURL=ShopScene.js.map