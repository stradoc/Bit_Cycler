// The canvas the game draws on. All layout uses a fixed 960x540 space, and a
// scene's camera zooms it to fill the canvas. The 8-bit era draws on a
// 960x540 canvas that the browser stretches with chunky pixels, positions
// snapped to whole pixels; the others draw at the screen's real resolution
// (2x or 3x), with text at full sharpness. Eras that sit in a window (or a
// DOS screen with menu and status bars) shrink the layout to make room.
// On top of the canvas, a CRT overlay (scanlines, phosphor stripes,
// vignette) is drawn at the screen's own resolution, so it stays fine even
// when the game under it is chunky.
export const WIDTH = 960;
export const HEIGHT = 540;
/** A window's title bar (32-bit and 64-bit eras), and the DOS screen's menu and status bars (16-bit), in layout pixels. */
export const WINDOW_BAR = 22;
export const DOS_BAR = 18;
const NO_FRAME = { top: 0, bottom: 0, side: 0 };
const FRAMES = {
    classic: { top: WINDOW_BAR + 8, bottom: 8, side: 8 },
    modern: { top: WINDOW_BAR + 8, bottom: 8, side: 8 },
    dos: { top: DOS_BAR, bottom: DOS_BAR, side: 0 },
};
/** Canvas pixels per layout pixel: the canvas's scale, and the camera's zoom (smaller inside a frame). */
let scale = 1;
let zoom = 1;
let font = 'monospace';
let smooth = false;
let hires = false;
let frame = NO_FRAME;
/** The current era moves things in sub-pixel steps and eases transitions. */
export function isSmooth() {
    return smooth;
}
/** The current era draws at the screen's resolution (so the canvas follows the window's size). */
export function isHires() {
    return hires;
}
/** Canvas pixels per layout pixel: the canvas's scale (whole: 1-3) and the camera's zoom (smaller inside a window). */
export function pixelScale() {
    return { scale, zoom };
}
/** The base of every text style: the era's font, drawn at the canvas's resolution so it stays sharp when zoomed. */
export function textBase() {
    return { fontFamily: font, resolution: zoom };
}
/** Canvas pixels per layout pixel that fill this window without stretching (1-3). */
function nativeScale() {
    const fit = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT) * (window.devicePixelRatio || 1);
    return Math.max(1, Math.min(3, Math.ceil(fit - 0.05)));
}
/** Sets the canvas up for an era: its size, how the browser stretches it, and the font texts use. */
export function applyEra(game, era) {
    smooth = era.smooth;
    hires = era.hires;
    font = era.font;
    frame = era.window ? FRAMES[era.window.style] : NO_FRAME;
    const next = hires ? nativeScale() : 1;
    if (next !== scale || game.scale.width !== WIDTH * next) {
        scale = next;
        game.scale.setGameSize(WIDTH * scale, HEIGHT * scale);
    }
    zoom = scale * Math.min(WIDTH / (WIDTH + 2 * frame.side), HEIGHT / (HEIGHT + frame.top + frame.bottom));
    game.canvas.style.imageRendering = hires ? 'auto' : 'pixelated';
    crtOverlay(game, era);
}
let crt;
/**
 * The CRT eras' screen: scanlines, faint red / green / blue phosphor stripes
 * and a darkened edge, drawn over the canvas at the screen's own resolution
 * (one stripe or line per screen pixel) and multiplied, so black stays black.
 */
function crtOverlay(game, era) {
    if (!crt) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2;mix-blend-mode:multiply;image-rendering:pixelated';
        document.body.append(overlay);
        crt = overlay;
        // Follows the canvas, which the scale manager moves and resizes with the window.
        let last = '';
        const follow = () => {
            const r = game.canvas.getBoundingClientRect();
            const rect = `${r.left},${r.top},${r.width},${r.height}`;
            if (rect !== last) {
                last = rect;
                Object.assign(overlay.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
            }
            requestAnimationFrame(follow);
        };
        follow();
    }
    if (era.scanlines <= 0) {
        crt.style.display = 'none';
        return;
    }
    // One phosphor dot, 3 x 3 screen pixels: red, green and blue stripes over two rows, then a dark scanline.
    const tile = document.createElement('canvas');
    [tile.width, tile.height] = [3, 3];
    const ctx = tile.getContext('2d');
    if (ctx) {
        const stripe = Math.round(255 * (1 - era.scanlines * 0.45));
        [`rgb(255,${stripe},${stripe})`, `rgb(${stripe},255,${stripe})`, `rgb(${stripe},${stripe},255)`].forEach((color, x) => {
            ctx.fillStyle = color;
            ctx.fillRect(x, 0, 1, 2);
        });
        const line = Math.round(255 * (1 - era.scanlines));
        ctx.fillStyle = `rgb(${line},${line},${line})`;
        ctx.fillRect(0, 2, 3, 1);
    }
    const dot = 3 / (window.devicePixelRatio || 1);
    crt.style.display = 'block';
    crt.style.backgroundImage = `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${era.vignette}) 100%), url(${tile.toDataURL()})`;
    crt.style.backgroundSize = `100% 100%, ${dot}px ${dot}px`;
}
/** Zooms a scene's camera so the 960x540 layout fills the canvas (with room for a window's or a DOS screen's bars). */
export function fitCamera(camera) {
    camera.setSize(WIDTH * scale, HEIGHT * scale);
    camera.setZoom(zoom);
    camera.centerOn(WIDTH / 2, (HEIGHT + frame.bottom - frame.top) / 2);
    camera.roundPixels = !smooth;
}
/**
 * Each era's font, bundled in assets/fonts (credits in CREDITS.txt): period
 * PC fonts from The Ultimate Oldschool PC Font Pack (CC BY-SA 4.0) for the
 * 8-, 16- and 32-bit eras, JetBrains Mono (SIL OFL) for the 64-bit one.
 * Loaded before the game starts, so texts measure with the right font.
 */
export async function loadFonts() {
    const faces = [
        new FontFace('JetBrains Mono', 'url(assets/fonts/JetBrainsMono-Regular.woff2)', { weight: '400' }),
        new FontFace('JetBrains Mono', 'url(assets/fonts/JetBrainsMono-Bold.woff2)', { weight: '700' }),
        new FontFace('IBM BIOS', 'url(assets/fonts/Web437_IBM_BIOS-2y.woff)'),
        new FontFace('IBM VGA', 'url(assets/fonts/Web437_IBM_VGA_9x16.woff)'),
        new FontFace('IBM XGA', 'url(assets/fonts/Web437_IBM_XGA-AI_7x15.woff)'),
    ];
    // A font that fails to load falls back to the plain monospace.
    await Promise.all(faces.map((face) => face.load().then((loaded) => document.fonts.add(loaded), () => undefined)));
}
/** ?fps in the URL: frames per second in the corner, to check how smooth it runs. */
export function showFps(game) {
    const meter = document.createElement('div');
    meter.style.cssText = 'position:fixed;top:4px;right:8px;font:12px monospace;color:#8f8;z-index:10;pointer-events:none';
    document.body.append(meter);
    setInterval(() => (meter.textContent = `${Math.round(game.loop.actualFps)} FPS  ${game.scale.width}x${game.scale.height}`), 500);
}
//# sourceMappingURL=display.js.map