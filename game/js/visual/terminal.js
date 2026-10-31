// The terminal look modernizes as the CPU's word size grows: from a flickering
// green-phosphor CRT to a flat modern terminal. This is era styling, not a
// claim that word size affects the display.
import { getSettings } from '../settings.js';
import { bevel, CLASSIC, CLASSIC_DARK, palette } from './bevel.js';
import { applyEra, DOS_BAR, fitCamera, HEIGHT, pixelScale, textBase, WIDTH, WINDOW_BAR } from './display.js';
/** The 32-bit era's dark variant: charcoal windows, light text, the bright VGA colors. */
const CLASSIC_DARK_ERA = {
    name: '32-BIT', fg: 0xe0e0e0, dim: 0x6a6a6a, bg: CLASSIC_DARK.face,
    syntax: { op: 0x55ffff, reg: 0x55ff55, num: 0xffff55, label: 0xff77ff, punct: 0xa0a0a0 },
    taken: 0x5fb3ff, notTaken: 0xffa040,
    fire: [0xffff60, 0xff8000, 0xc00000],
    bloom: 0, scanlines: 0, curve: 0, vignette: 0, flicker: 0,
    font: "'IBM XGA', monospace", hires: true, smooth: false, accent: 0x7ab8ff, lcd: 0, chip: 'lowpoly',
    window: { style: 'classic', desk: 0x1c2a33, bar: 0x1c2f5e, bar2: 0x4a6aa5, title: 0xf0f0f0, border: CLASSIC_DARK.dark, palette: CLASSIC_DARK },
};
export const ERAS = [
    {
        name: '8-BIT', fg: 0x39ff14, dim: 0x0f4a06, bg: 0x030803,
        syntax: { op: 0x39ff14, reg: 0x2ccc10, num: 0x1f9a0b, label: 0x1f9a0b, punct: 0x177508 },
        taken: 0x39ff14, notTaken: 0x26b80d,
        fire: [0xd8ffc8, 0x39ff14, 0x1f9a0b],
        bloom: 1.8, scanlines: 0.4, curve: 0.02, vignette: 0.4, flicker: 0.02,
        // The original IBM PC's ROM font, drawn tall as CGA text looked on screen.
        font: "'IBM BIOS', monospace", hires: false, smooth: false, accent: 0x39ff14, lcd: 0, chip: 'wire',
    },
    {
        // A late-80s DOS app in text mode on a CRT: blue, the 16-color palette, double-line boxes, drop shadows.
        name: '16-BIT', fg: 0xd0d0d0, dim: 0x3a3ac8, bg: 0x0000aa,
        syntax: { op: 0xffffff, reg: 0xffff55, num: 0x55ff55, label: 0xff55ff, punct: 0xaaaaaa },
        taken: 0x55ffff, notTaken: 0xffaa00,
        fire: [0xffff55, 0xff5555, 0xaa0000],
        bloom: 0, scanlines: 0.22, curve: 0, vignette: 0.25, flicker: 0,
        // DOS's own: the VGA text-mode font.
        font: "'IBM VGA', monospace", hires: true, smooth: false, accent: 0x55ffff, lcd: 0, chip: 'flat',
        window: {
            style: 'dos', desk: 0x0000aa, bar: 0xaaaaaa, bar2: 0xaaaaaa, title: 0x000000, border: 0x000000,
            palette: { light: 0xffffff, soft: 0xaaaaaa, face: 0xaaaaaa, shadow: 0x000000, dark: 0x000000, field: 0x0000aa, select: 0x00aaaa, selectText: 0x000000 },
        },
    },
    {
        // A mid-90s desktop: a gray window with 3D edges on teal, black text, the 16-color VGA palette.
        name: '32-BIT', fg: 0x000000, dim: 0x808080, bg: CLASSIC.face,
        syntax: { op: 0x000080, reg: 0x008080, num: 0x800000, label: 0x800080, punct: 0x606060 },
        taken: 0x0050c8, notTaken: 0xb85c00,
        fire: [0xffff60, 0xff8000, 0xc00000],
        bloom: 0, scanlines: 0, curve: 0, vignette: 0, flicker: 0,
        // A thin early-90s PC font, closer to the period's light interface text than DOS's heavy one.
        font: "'IBM XGA', monospace", hires: true, smooth: false, accent: 0x000080, lcd: 0, chip: 'lowpoly',
        window: { style: 'classic', desk: 0x008080, bar: 0x000080, bar2: 0x1084d0, title: 0xffffff, border: CLASSIC.dark, palette: CLASSIC },
        dark: CLASSIC_DARK_ERA,
    },
    {
        // A terminal window on a modern LCD: black, with colored accents and syntax.
        name: '64-BIT', fg: 0xe6e6e6, dim: 0x30343c, bg: 0x000000,
        syntax: { op: 0x7ee787, reg: 0x79c0ff, num: 0xffd479, label: 0xd2a8ff, punct: 0x8b949e },
        taken: 0x56b4e9, notTaken: 0xe69f00,
        fire: [0xfff3b0, 0xff8c1a, 0xd62a0a],
        bloom: 0, scanlines: 0, curve: 0, vignette: 0, flicker: 0,
        // A modern programmer's font, at full resolution.
        font: "'JetBrains Mono', monospace", hires: true, smooth: true,
        accent: 0x4fd6be,
        window: { style: 'modern', desk: 0x14171d, bar: 0x22262e, bar2: 0x22262e, title: 0x9aa3b2, border: 0x3a404c },
        lcd: 0.5,
        chip: 'smooth',
    },
];
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
/** The era the settings choose: its index, and its dark variant if dark mode is on and it has one. */
export function currentEra() {
    const { eraIndex, dark } = getSettings();
    const era = ERAS.at(eraIndex) ?? ERAS[0];
    return dark && era.dark ? era.dark : era;
}
export function cssColor(color) {
    return `#${color.toString(16).padStart(6, '0')}`;
}
const LCD_TEXTURE = 'lcd';
/** The DOS menu bar's items, and which one each screen is. */
const DOS_MENU = ['FILE', 'CONTRACTS', 'SHOP', 'RUN', 'HELP'];
const DOS_ITEM = {
    title: 'FILE', settings: 'FILE', saves: 'FILE', dev: 'FILE', board: 'CONTRACTS', shop: 'SHOP', pipeline: 'RUN', briefing: 'HELP',
};
/** Where each scene is: a terminal prompt in the modern window's title bar, an app's document name in the classic one. */
const PATHS = {
    boot: '~', title: '~', settings: '~/settings', saves: '~/saves', dev: '~/dev', board: '~/contracts', shop: '~/shop', briefing: '~/briefings', pipeline: '~/run',
};
const TITLES = {
    title: 'BIT CYCLER', settings: 'BIT CYCLER - SETTINGS', saves: 'BIT CYCLER - SAVES', dev: 'BIT CYCLER - DEVELOPER', board: 'BIT CYCLER - CONTRACTS',
    shop: 'BIT CYCLER - SHOP', briefing: 'BIT CYCLER - BRIEFING', pipeline: 'BIT CYCLER - RUN',
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
        camera.setBackgroundColor(era.window?.desk ?? era.bg).setAlpha(1);
        this.drawChrome(era);
        this.screenEffects(era.bloom);
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
        if (this.era.curve * crt > 0)
            fx.addBarrel(1 + this.era.curve * crt);
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
        const frame = this.windowed ? era.window : undefined;
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
        if (era.lcd > 0) {
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
                .setAlpha(era.lcd)
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
        bevel(body, era, left, top, w, h, true);
        const bar = scene.add
            .graphics()
            .setDepth(990)
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
        const flicker = this.era.flicker * getSettings().crt;
        if (flicker > 0)
            this.scene.cameras.main.setAlpha(1 - Math.random() * flicker);
    }
}
//# sourceMappingURL=terminal.js.map