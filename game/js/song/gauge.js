import { GLOSSARY } from '../data/glossary.js';
import { formatMhz } from '../format.js';
import { THERMAL } from '../sim/thermal.js';
import { cssColor } from '../ui/eras.js';
import { GAUGE_BOTTOM, GAUGE_MAX_C, GAUGE_MIN_C, GAUGE_TOP, GAUGE_X } from './layout.js';
import { Part } from './view.js';
/** Top left: the clock and the chip's temperature, with the overheat point marked. */
export class Gauge extends Part {
    clock;
    mode;
    fill;
    temp;
    worn;
    mark;
    markText;
    /** `canSpeedUp`: H can raise the clock (the overclocking upgrade, on a chip not worn down to its rated clock). */
    constructor(view, canSpeedUp) {
        super(view);
        const { fg } = this.era;
        const { clickable, setup } = view;
        const x = GAUGE_X;
        clickable(this.text(x, 6, 'CLOCK', 11).setOrigin(0.5, 0).setAlpha(0.6), () => GLOSSARY.CLOCK);
        this.clock = this.text(x, 20, '', 15).setOrigin(0.5, 0);
        this.mode = this.text(x, 40, '', 11).setOrigin(0.5, 0);
        this.text(x, 55, setup.practice ? 'RATED (PRACTICE)' : canSpeedUp ? '[G] -   [H] +' : '[G] SLOWER', 11).setOrigin(0.5, 0).setAlpha(0.7);
        const tube = this.scene.add.rectangle(x, (GAUGE_TOP + GAUGE_BOTTOM) / 2, 18, GAUGE_BOTTOM - GAUGE_TOP).setStrokeStyle(1, fg, 0.6);
        clickable(tube, () => GLOSSARY.HEAT);
        this.fill = this.scene.add.rectangle(x, GAUGE_BOTTOM - 2, 12, 0, fg).setOrigin(0.5, 1);
        // The overheat mark: moves down as the chip wears.
        this.mark = this.scene.add.graphics().lineStyle(1, fg, 0.8).lineBetween(x - 12, 0, x + 12, 0);
        this.markText = this.text(x + 14, 0, '', 10).setOrigin(0, 0.5).setAlpha(0.7);
        this.temp = this.text(x, GAUGE_BOTTOM + 6, '', 15).setOrigin(0.5, 0);
        clickable(this.temp, () => GLOSSARY.HEAT);
        // A chip worn by overheating can't reach the full overclock.
        this.worn = this.text(x, GAUGE_BOTTOM + 24, '', 11).setOrigin(0.5, 0);
    }
    y(celsius) {
        const t = Phaser.Math.Clamp((celsius - GAUGE_MIN_C) / (GAUGE_MAX_C - GAUGE_MIN_C), 0, 1);
        return GAUGE_BOTTOM - 2 - t * (GAUGE_BOTTOM - GAUGE_TOP - 4);
    }
    /** Every frame: the clock, its mode, and the temperature against the overheat point. */
    update(chip, now) {
        const { fg, fire } = this.era;
        const t = chip.temperature;
        const limit = chip.throttleAt;
        const markY = this.y(limit);
        this.mark.setY(markY);
        this.markText.setY(markY).setText(`${Math.round(limit)}`);
        const color = t >= limit - 5 ? fire[2] : t >= limit - 20 ? fire[1] : fg;
        const blink = chip.halted && Math.floor(now / 250) % 2 === 0;
        this.fill.setFillStyle(color).setSize(12, GAUGE_BOTTOM - 2 - this.y(t)).setAlpha(blink ? 0.5 : 1);
        this.temp.setText(`${Math.round(t)}°C`).setColor(cssColor(color));
        this.clock.setText(formatMhz(Number(chip.mhz.toPrecision(3))));
        const percent = Math.round(chip.dial * 100);
        // Wear only matters once the chip can overclock (without the unlock its maximum is just the rated clock).
        const worn = chip.maxDial < THERMAL.maxDial;
        this.worn.setText(worn ? `MAX ${Math.round(chip.maxDial * 100)}%` : '').setColor(cssColor(fire[1]));
        this.mode
            .setText(chip.halted ? 'CLOCK STOPPED' : chip.dial > 1 ? `OVERCLOCK ${percent}%` : chip.dial < 1 ? `UNDERCLOCK ${percent}%` : 'RATED')
            .setColor(cssColor(chip.halted || chip.dial > 1 ? fire[1] : fg));
    }
}
//# sourceMappingURL=gauge.js.map