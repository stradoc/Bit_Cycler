import { AT_REST, characterFrame, characterLayers, pixelFrame, POSES, poseKey, TICK_LOOKS, vectorPose } from '../data/tick.js';
import { cssColor } from '../ui/eras.js';
import { drawPixels } from './pixels.js';
import { TEXT } from '../ui/theme.js';
import { eraText } from '../ui/widgets.js';
/** TICK, drawn the way `era` draws him. */
export function tickFigure(scene, era) {
    const look = TICK_LOOKS[era.tick];
    switch (look.kind) {
        case 'characters':
            return new CharacterFigure(scene, era, look.sheet);
        case 'pixels':
            return new PixelFigure(scene, look.sheet, look.scale);
        case 'vector':
            return new VectorFigure(scene, era);
    }
}
// ---- characters ----
/** Room under the last line, so fonts that draw _ on their lowest pixel row don't lose his feet. */
const FEET_PAD = 4;
/**
 * Behind him, the screen's own color in his own shape: one strip per line,
 * from the first character any pose draws on it to the last. Whatever is
 * underneath (dimmed text during a tour) doesn't show through his lines, and
 * he has no outline of his own, like text-mode art on the screen's background.
 */
function backing(scene, era, sheet, width, height) {
    const frames = POSES.map((pose) => characterFrame(sheet, pose));
    const lines = sheet.lines.length;
    const charW = width / frames[0][0].length;
    const lineH = (height - FEET_PAD) / lines;
    const shape = scene.add.graphics().fillStyle(era.bg, 1);
    for (let row = 0; row < lines; row++) {
        const first = Math.min(...frames.map((frame) => frame[row].search(/\S/)).filter((at) => at >= 0));
        const last = Math.max(...frames.map((frame) => frame[row].trimEnd().length));
        // The last line reaches down over the padding, under his feet.
        const extra = row === lines - 1 ? FEET_PAD : 0;
        shape.fillRoundedRect(first * charW - 4, row * lineH - 1, (last - first) * charW + 8, lineH + 2 + extra, 5);
    }
    return shape;
}
/** TICK in characters (the 8-bit and DOS eras): the sheet's ink in the era's text color, and its accent slots in its accent color over it. */
class CharacterFigure {
    view;
    width;
    height;
    sheet;
    ink;
    accent;
    shown = '';
    constructor(scene, era, sheet) {
        this.sheet = sheet;
        const size = TEXT.body + 3;
        const layer = (color) => eraText(scene, era, 0, 0, '', size).setColor(cssColor(color)).setPadding(0, 0, 0, FEET_PAD);
        this.ink = layer(era.fg);
        this.accent = sheet.accent ? layer(era.accent) : undefined;
        this.draw(AT_REST);
        this.width = this.ink.width;
        this.height = this.ink.height;
        this.view = scene.add.container(0, 0, [backing(scene, era, sheet, this.width, this.height), this.ink, ...(this.accent ? [this.accent] : [])]);
    }
    show(pose) {
        this.draw(pose);
    }
    draw(pose) {
        const key = poseKey(pose);
        if (key === this.shown)
            return;
        this.shown = key;
        const { ink, accent } = characterLayers(this.sheet, pose);
        this.ink.setText(ink.join('\n'));
        this.accent?.setText(accent.join('\n'));
    }
}
// ---- pixels ----
/** TICK as a pixel sprite (the 90s desktop), redrawn when his pose changes. */
class PixelFigure {
    view;
    width;
    height;
    sheet;
    scale;
    g;
    shown = '';
    constructor(scene, sheet, scale) {
        this.sheet = sheet;
        this.scale = scale;
        this.width = sheet.base[0].length * scale;
        this.height = sheet.base.length * scale;
        this.g = scene.add.graphics();
        this.view = scene.add.container(0, 0, [this.g]);
        this.show(AT_REST);
    }
    show(pose) {
        const key = poseKey(pose);
        if (key === this.shown)
            return;
        this.shown = key;
        drawPixels(this.g.clear(), pixelFrame(this.sheet, pose), this.sheet.palette, 0, 0, this.scale);
    }
}
// ---- vector shapes ----
/** The modern era's TICK: soft grays on black, his eyes and antenna bulb in the era's accent, status lights on his chest. */
const VECTOR = {
    width: 74,
    height: 100,
    shell: 0xd8dde6,
    shade: 0xa9b1be,
    joint: 0x8a93a3,
    visor: 0x14171d,
    mouth: 0x3a404c,
    feet: 0x6b7383,
    lights: [0xff5f56, 0xffbd2e],
};
/** How fast his shapes ease to a new pose (ms). */
const VECTOR_EASE_MS = 45;
/** TICK in vector shapes (the modern era), easing from pose to pose. */
class VectorFigure {
    view;
    width = VECTOR.width;
    height = VECTOR.height;
    accent;
    g;
    now;
    shape;
    last = performance.now();
    drawn = false;
    constructor(scene, era) {
        this.accent = era.accent;
        this.g = scene.add.graphics();
        this.view = scene.add.container(0, 0, [this.g]);
        const { eyeShape, ...numbers } = vectorPose(AT_REST);
        this.now = numbers;
        this.shape = eyeShape;
        this.draw();
    }
    show(pose, now) {
        const dt = Math.min(100, Math.max(0, now - this.last));
        this.last = now;
        const { eyeShape, ...goal } = vectorPose(pose);
        const k = 1 - Math.exp(-dt / VECTOR_EASE_MS);
        let changed = eyeShape !== this.shape || !this.drawn;
        for (const name of Object.keys(goal)) {
            const gap = goal[name] - this.now[name];
            if (gap === 0)
                continue;
            this.now[name] = Math.abs(gap) < 0.01 ? goal[name] : this.now[name] + gap * k;
            changed = true;
        }
        this.shape = eyeShape;
        if (changed)
            this.draw();
    }
    draw() {
        this.drawn = true;
        const { g, accent } = this;
        const p = this.now;
        const mid = VECTOR.width / 2;
        g.clear();
        // Antenna, its bulb glowing.
        g.lineStyle(2, VECTOR.joint, 1).lineBetween(mid, 15, mid, 7);
        g.fillStyle(accent, 0.25).fillCircle(mid, 6, 6).fillStyle(accent, 1).fillCircle(mid, 6, 3.5);
        // Arms, behind the body: from the shoulder to a hand that rises as he cheers.
        for (const side of [-1, 1]) {
            const at = (x) => mid + side * (mid - x);
            // Raised, the hand goes out past his head, so it shows beside it.
            const hand = { x: at(12 - 11 * p.armsUp), y: 82 - 36 * p.armsUp };
            g.lineStyle(7, VECTOR.shade, 1).lineBetween(at(19), 63, hand.x, hand.y);
            g.fillStyle(VECTOR.shade, 1).fillCircle(at(19), 63, 3.5);
            g.fillStyle(VECTOR.joint, 1).fillCircle(hand.x, hand.y, 4.5);
        }
        // Ears, head (a darker lip along its bottom), visor.
        g.fillStyle(VECTOR.joint, 1).fillRoundedRect(4, 27, 6, 16, 3).fillRoundedRect(64, 27, 6, 16, 3);
        g.fillStyle(VECTOR.shade, 1).fillRoundedRect(9, 14, 56, 40, 12);
        g.fillStyle(VECTOR.shell, 1).fillRoundedRect(9, 14, 56, 37, 12);
        g.fillStyle(VECTOR.visor, 1).fillRoundedRect(15, 21, 44, 22, 9);
        // Eyes: pills that look and blink, closed arcs when happy, under raised brows when worried.
        for (const x of [29, 45]) {
            const cx = x + 4 * p.look;
            if (this.shape === 'happy') {
                g.lineStyle(3, accent, 1).beginPath().arc(cx, 35, 4.5, Math.PI * 1.1, Math.PI * 1.9).strokePath();
                continue;
            }
            const h = Math.max(1.5, (this.shape === 'worried' ? 10 : 12) * p.eyesOpen);
            g.fillStyle(accent, 1).fillRoundedRect(cx - 4, 32 - h / 2, 8, h, Math.min(4, h / 2));
            if (this.shape === 'worried') {
                const inner = x < mid ? 1 : -1;
                g.lineStyle(2.5, VECTOR.joint, 1).lineBetween(cx - 5 * inner, 25, cx + 4 * inner, 23);
            }
        }
        // Mouth: open as he talks, else a line that curves into a smile or a frown.
        if (p.mouthOpen > 0.08) {
            g.fillStyle(VECTOR.mouth, 1).fillEllipse(mid, 47.5, 7 + 3 * p.mouthOpen, 2 + 6 * p.mouthOpen);
        }
        else {
            const points = [-6, -4, -2, 0, 2, 4, 6].map((dx) => ({ x: mid + dx, y: 47.5 + p.mouthCurve * 2.5 * (1 - (dx / 6) ** 2) }));
            g.lineStyle(2.5, VECTOR.mouth, 1).strokePoints(points);
        }
        // Neck, body (with its lip), and a chest panel of status lights.
        g.fillStyle(VECTOR.joint, 1).fillRect(32, 53, 10, 6);
        g.fillStyle(VECTOR.shade, 1).fillRoundedRect(17, 58, 40, 29, 9);
        g.fillStyle(VECTOR.shell, 1).fillRoundedRect(17, 58, 40, 26, 9);
        g.fillStyle(VECTOR.visor, 1).fillRoundedRect(26, 64, 22, 11, 4);
        [...VECTOR.lights, accent].forEach((color, i) => g.fillStyle(color, 1).fillCircle(31 + 6 * i, 69.5, 2.2));
        // Legs and feet, a foot lifting with each step.
        for (const [x, lift] of [[27, p.leftFoot], [41, p.rightFoot]]) {
            const top = 93 - 4 * lift;
            g.fillStyle(VECTOR.joint, 1).fillRect(x, 86, 6, top - 85);
            g.fillStyle(VECTOR.feet, 1).fillRoundedRect(x - 5 + (x < mid ? 0 : 4), top, 12, 6, 3);
        }
    }
}
//# sourceMappingURL=tickFigure.js.map