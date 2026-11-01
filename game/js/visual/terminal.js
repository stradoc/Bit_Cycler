// How a screen is drawn in its era (ui/eras.ts): the canvas and camera
// (visual/display.ts), the window or DOS bars around the layout, an LCD's
// subpixel grid, and the CRT's glow, curve and flicker.
import { getSettings } from '../settings.js';
import { cssColor, palette } from '../ui/eras.js';
import { bevel } from '../ui/widgets.js';
import { applyEra, DOS_BAR, fitCamera, HEIGHT, pixelScale, textBase, WIDTH, WINDOW_BAR } from './display.js';
/**
 * Adds a glow (bloom) of `strength` around bright things. Phaser's bloom
 * doesn't add its halo to the picture: it averages the picture with its
 * blurred copy (half of each), which halved every letter's brightness, and
 * each glow stacked on another halved it again. So it runs at half strength
 * and the result is doubled: the whole picture plus the same halo as before.
 */
function addGlow(fx, strength) {
    fx.addBloom(0xffffff, 1, 1, 1, strength / 2, 4);
    fx.addColorMatrix().brightness(2);
}
const LCD_TEXTURE = 'lcd';
/** The DOS menu bar's items, and which one each screen is. */
const DOS_MENU = ['FILE', 'CONTRACTS', 'SHOP', 'RUN', 'HELP'];
const DOS_ITEM = {
    title: 'FILE', settings: 'FILE', saves: 'FILE', dev: 'FILE', board: 'CONTRACTS', calendar: 'CONTRACTS', shop: 'SHOP', pipeline: 'RUN',
};
/** Where each scene is: a terminal prompt in the modern window's title bar, an app's document name in the classic one. */
const PATHS = {
    boot: '~', title: '~', settings: '~/settings', saves: '~/saves', dev: '~/dev', board: '~/contracts', calendar: '~/calendar', shop: '~/shop', pipeline: '~/run',
};
const TITLES = {
    title: 'BIT CYCLER', settings: 'BIT CYCLER - SETTINGS', saves: 'BIT CYCLER - SAVES', dev: 'BIT CYCLER - DEVELOPER', board: 'BIT CYCLER - CONTRACTS',
    calendar: 'BIT CYCLER - CALENDAR', shop: 'BIT CYCLER - SHOP', pipeline: 'BIT CYCLER - RUN',
};
/**
 * Applies an era to a scene: the canvas size and the camera's zoom
 * (visual/display.ts), and the CRT effects. Create it before any text, so
 * texts get the era's font. Call update() every frame. `windowed: false`
 * leaves out the window or DOS bars (the intro, before the app has started).
 */
export class TerminalLook {
    era;
    scene;
    windowed;
    /** The era's window or DOS bars, and the LCD grid, redrawn when the era changes. */
    chrome = [];
    constructor(scene, era, windowed = true) {
        this.scene = scene;
        this.era = era;
        this.windowed = windowed;
        this.setEra(era);
    }
    /** Shows or hides the era's window or DOS bars (the intro opens the window once the screen is on). */
    setWindowed(windowed) {
        this.windowed = windowed;
        this.drawChrome(this.era);
    }
    setEra(era) {
        this.era = era;
        applyEra(this.scene.game, era);
        const camera = this.scene.cameras.main;
        fitCamera(camera);
        camera.setBackgroundColor(era.screen.frame?.desk ?? era.bg).setAlpha(1);
        this.drawChrome(era);
        this.screenEffects(era.screen.glow);
    }
    /** The camera's glow and screen curve; the CRT effects setting turns both down with the overlay. */
    screenEffects(bloom) {
        const fx = this.scene.cameras.main.postFX;
        if (!fx)
            return; // Canvas renderer: no shader effects
        fx.clear();
        const { crt } = getSettings();
        if (bloom * crt > 0)
            addGlow(fx, bloom * crt);
        if (this.era.screen.curve * crt > 0)
            fx.addBarrel(1 + this.era.screen.curve * crt);
    }
    /**
     * The modern era: a terminal window (black body, a title bar with three
     * buttons and a prompt naming the screen) around the 960x540 layout, and
     * an LCD's subpixel grid over everything. Multiplied, so black stays black
     * and only lit pixels show their red, green and blue stripes.
     */
    drawChrome(era) {
        for (const part of this.chrome)
            part.destroy();
        this.chrome = [];
        const { scene } = this;
        const frame = this.windowed ? era.screen.frame : undefined;
        if (frame?.style === 'classic') {
            this.chrome.push(...this.classicWindow(frame));
        }
        else if (frame?.style === 'dos') {
            this.chrome.push(...this.dosBars(frame));
        }
        else if (frame) {
            const [left, top, w, h, r] = [-1, -WINDOW_BAR, WIDTH + 2, HEIGHT + WINDOW_BAR + 1, 10];
            const body = scene.add.graphics().setDepth(-1000).fillStyle(era.bg).fillRoundedRect(left, top, w, h, r);
            const bar = scene.add
                .graphics()
                .setDepth(990)
                .fillStyle(frame.bar)
                .fillRoundedRect(left, top, w, WINDOW_BAR, { tl: r, tr: r, bl: 0, br: 0 })
                .lineStyle(1, frame.border)
                .strokeRoundedRect(left, top, w, h, r)
                .lineBetween(left, 0, left + w, 0);
            [0xe06c75, 0xe5c07b, 0x98c379].forEach((color, i) => bar.fillStyle(color).fillCircle(16 + i * 18, -WINDOW_BAR / 2, 5));
            this.chrome.push(this.deskAbove(frame.desk, top));
            const path = PATHS[scene.scene.key] ?? '~';
            const title = scene.add
                .text(WIDTH / 2, -WINDOW_BAR / 2, `player@bit-cycler: ${path}`, { ...textBase(), fontSize: '12px', color: cssColor(frame.title) })
                .setOrigin(0.5)
                .setDepth(991);
            this.chrome.push(body, bar, title);
        }
        if (era.screen.lcd > 0) {
            if (!scene.textures.exists(LCD_TEXTURE)) {
                // One LCD pixel: red, green and blue stripes, and a dark gap below them.
                const tile = scene.textures.createCanvas(LCD_TEXTURE, 3, 3);
                const ctx = tile?.context;
                ['#ff5a5a', '#5aff5a', '#5a5aff'].forEach((color, x) => {
                    if (!ctx)
                        return;
                    ctx.fillStyle = color;
                    ctx.fillRect(x, 0, 1, 2);
                });
                if (ctx) {
                    ctx.fillStyle = '#3c3c3c';
                    ctx.fillRect(0, 2, 3, 1);
                }
                tile?.refresh();
                // Crisp stripes, not blurred together.
                scene.textures.get(LCD_TEXTURE).setFilter(Phaser.Textures.FilterMode.NEAREST);
            }
            // Each stripe is a whole number of screen pixels (2 on a 1080p screen), whatever the window's zoom.
            const { scale, zoom } = pixelScale();
            const grid = scene.add
                .tileSprite(-120, -120, WIDTH + 240, HEIGHT + 240, LCD_TEXTURE)
                .setOrigin(0)
                .setTileScale(scale / zoom)
                .setDepth(1001)
                .setAlpha(era.screen.lcd)
                .setBlendMode(Phaser.BlendModes.MULTIPLY);
            this.chrome.push(grid);
        }
    }
    /**
     * The desktop above a window, drawn over everything else: things that
     * start above the layout (notes on their way down) would otherwise show
     * on the desktop above the title bar.
     */
    deskAbove(desk, windowTop) {
        return this.scene.add.rectangle(-200, windowTop, WIDTH + 400, 400, desk).setOrigin(0, 1).setDepth(989);
    }
    /**
     * A DOS app's screen: a gray menu bar on top (each item's first letter in
     * red, this screen's item highlighted) and a gray status bar at the bottom.
     */
    dosBars(frame) {
        const { scene } = this;
        const bars = scene.add
            .graphics()
            .setDepth(990)
            .fillStyle(frame.bar)
            .fillRect(-2, -DOS_BAR, WIDTH + 4, DOS_BAR)
            .fillRect(-2, HEIGHT, WIDTH + 4, DOS_BAR);
        const parts = [bars];
        const style = { ...textBase(), fontSize: '13px', color: cssColor(frame.title) };
        const current = DOS_ITEM[scene.scene.key];
        let x = 14;
        for (const item of DOS_MENU) {
            const word = scene.add.text(x, -DOS_BAR / 2, ` ${item} `, style).setOrigin(0, 0.5).setDepth(992);
            if (item === current)
                bars.fillStyle(0x00aa00).fillRect(x, -DOS_BAR, word.width, DOS_BAR);
            // The hotkey: the item's first letter in red.
            const key = scene.add.text(x + word.width / word.text.length, -DOS_BAR / 2, item[0], { ...style, color: '#aa0000' }).setOrigin(0, 0.5).setDepth(993);
            parts.push(word, key);
            x += word.width + 10;
        }
        const status = scene.add.text(14, HEIGHT + DOS_BAR / 2, ' ESC QUIT  │  BIT CYCLER', style).setOrigin(0, 0.5).setDepth(992);
        const mode = scene.add.text(WIDTH - 14, HEIGHT + DOS_BAR / 2, '16-BIT  640K ', style).setOrigin(1, 0.5).setDepth(992);
        parts.push(status, mode);
        return parts;
    }
    /** A mid-90s window: gray with 3D edges, a gradient title bar with the app's name, and three small buttons. */
    classicWindow(frame) {
        const { scene } = this;
        const era = this.era;
        const colors = palette(era);
        const [left, top, w, h] = [-4, -WINDOW_BAR - 4, WIDTH + 8, HEIGHT + WINDOW_BAR + 8];
        const body = scene.add.graphics().setDepth(-1000).fillStyle(colors.face).fillRect(left, top, w, h);
        // The window's top edge and title bar are drawn over everything, so notes on their way down don't show through the edge.
        const bar = scene.add.graphics().setDepth(990).fillStyle(colors.face).fillRect(left, top, w, -top);
        bevel(bar, era, left, top, w, h, true)
            .fillGradientStyle(frame.bar, frame.bar2, frame.bar, frame.bar2, 1)
            .fillRect(-1, -WINDOW_BAR, WIDTH + 2, WINDOW_BAR - 3);
        const parts = [body, bar, this.deskAbove(frame.desk, top)];
        ['_', '□', '×'].forEach((glyph, i) => {
            const x = WIDTH - 58 + i * 18 + (i === 2 ? 2 : 0);
            bar.fillStyle(colors.face).fillRect(x, -WINDOW_BAR + 3, 16, 14);
            bevel(bar, era, x, -WINDOW_BAR + 3, 16, 14, true);
            parts.push(scene.add.text(x + 8, -WINDOW_BAR + 10, glyph, { ...textBase(), fontSize: '11px', color: cssColor(era.fg) }).setOrigin(0.5).setDepth(991));
        });
        const title = scene.add
            .text(8, (-WINDOW_BAR - 3) / 2, TITLES[scene.scene.key] ?? 'BIT CYCLER', { ...textBase(), fontSize: '12px', color: cssColor(frame.title), fontStyle: 'bold' })
            .setOrigin(0, 0.5)
            .setDepth(991);
        parts.push(title);
        return parts;
    }
    /**
     * More glow (bloom) on top of the era's own: the intro and the main menu
     * glow like a bright screen in a dark room. Only for screens that are dark
     * behind the text (on light or blue ones it would haze everything); the
     * CRT effects setting turns it down with the rest.
     */
    glow(strength) {
        const fx = this.scene.cameras.main.postFX;
        const amount = strength * getSettings().crt;
        if (!fx || amount <= 0)
            return;
        addGlow(fx, amount);
    }
    update() {
        const flicker = this.era.screen.flicker * getSettings().crt;
        if (flicker > 0)
            this.scene.cameras.main.setAlpha(1 - Math.random() * flicker);
    }
}
//# sourceMappingURL=terminal.js.map