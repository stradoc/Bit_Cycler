import { CLOCK, COOLING } from '../data/economy.js';
import { formatMhz } from '../format.js';
import { ratedMhz, tierOf } from '../sim/progress.js';
import { THERMAL } from '../sim/thermal.js';
/** Model units: the board is 120 x 120, y is up. */
const BOARD = 60;
const BOARD_TOP = 6;
const DIE = 36;
const DIE_TOP = 10;
const PART_TOP = 14;
/** The cooler hovers this high above the board, so the die's parts stay in view. */
const COOLER_Y = 64;
const LAYER = { board: 0, die: 1, part: 2, cooler: 3, fan: 4 };
/** The six faces of a box from corner `a` to corner `b`. */
function box(a, b, material, layer, spins = false) {
    const [x0, y0, z0] = a;
    const [x1, y1, z1] = b;
    const face = (points, normal) => ({ points, normal, material, layer, spins });
    return [
        face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0]),
        face([[x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]], [0, -1, 0]),
        face([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1]),
        face([[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]], [0, 0, 1]),
        face([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0]),
        face([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [1, 0, 0]),
    ];
}
/** A box turned `angle` about the vertical axis through the origin (a fan blade). */
function turnedBox(a, b, angle, material, layer, spins) {
    const turn = ([x, y, z]) => [x * Math.cos(angle) - z * Math.sin(angle), y, x * Math.sin(angle) + z * Math.cos(angle)];
    return box(a, b, material, layer, spins).map((f) => ({ ...f, points: f.points.map(turn), normal: turn(f.normal) }));
}
/** Small deterministic noise, so cracks land in the same places every time. */
const noise = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
};
/** The chip for this progress: board and pins, the die with every part owned, the cooler, and cracks. */
export function buildChip(progress) {
    const faces = [];
    const tier = tierOf(progress).number;
    faces.push(...box([-BOARD, 0, -BOARD], [BOARD, BOARD_TOP, BOARD], 'board', LAYER.board));
    // Pins on all four sides.
    for (let i = 0; i < 9; i++) {
        const p = -48 + i * 12;
        faces.push(...box([p - 2, 1, -BOARD - 9], [p + 2, 3, -BOARD], 'pin', LAYER.board));
        faces.push(...box([p - 2, 1, BOARD], [p + 2, 3, BOARD + 9], 'pin', LAYER.board));
        faces.push(...box([-BOARD - 9, 1, p - 2], [-BOARD, 3, p + 2], 'pin', LAYER.board));
        faces.push(...box([BOARD, 1, p - 2], [BOARD + 9, 3, p + 2], 'pin', LAYER.board));
    }
    faces.push(...box([-DIE, BOARD_TOP, -DIE], [DIE, DIE_TOP, DIE], 'die', LAYER.die));
    // The die's parts.
    if (tier === 1) {
        faces.push(...box([-20, DIE_TOP, -20], [20, PART_TOP + 2, 20], 'core', LAYER.part));
    }
    else {
        const stages = ['stage0', 'stage1', 'stage2', 'stage3', 'stage4'];
        stages.forEach((material, i) => faces.push(...box([-31 + i * 13, DIE_TOP, -28], [-21 + i * 13, PART_TOP, -16], material, LAYER.part)));
        // Forwarding: a wire from EX and MEM back to the stage before them.
        if (tier >= 3)
            faces.push(...box([-16, DIE_TOP, -12], [24, DIE_TOP + 1.5, -9], 'wire', LAYER.part));
        // Branch prediction, with a bit (1-bit) or two (2-bit) of history on top.
        if (tier >= 4) {
            faces.push(...box([-30, DIE_TOP, 4], [-10, PART_TOP + 1, 26], 'predictor', LAYER.part));
            for (let bit = 0; bit < tier - 4; bit++)
                faces.push(...box([-27 + bit * 9, PART_TOP + 1, 10], [-20 + bit * 9, PART_TOP + 5, 18], 'predictor', LAYER.part));
        }
    }
    // The L1 cache: 4 lines of 4 bytes, a little grid of memory cells.
    if (progress.cacheLevels > 0) {
        for (let line = 0; line < 4; line++) {
            for (let byte = 0; byte < 4; byte++) {
                const [x, z] = [6 + byte * 6.5, 4 + line * 6.5];
                faces.push(...box([x, DIE_TOP, z], [x + 5, DIE_TOP + 3, z + 5], 'cache', LAYER.part));
            }
        }
    }
    // Overclocking: a hot rim around the die.
    if (progress.overclocking) {
        faces.push(...box([-DIE, DIE_TOP, -DIE], [DIE, DIE_TOP + 1, -DIE + 2], 'oc', LAYER.part));
        faces.push(...box([-DIE, DIE_TOP, DIE - 2], [DIE, DIE_TOP + 1, DIE], 'oc', LAYER.part));
        faces.push(...box([-DIE, DIE_TOP, -DIE + 2], [-DIE + 2, DIE_TOP + 1, DIE - 2], 'oc', LAYER.part));
        faces.push(...box([DIE - 2, DIE_TOP, -DIE + 2], [DIE, DIE_TOP + 1, DIE - 2], 'oc', LAYER.part));
    }
    // The cooler, hovering above: a heatsink (base and fins), and a fan on top of it.
    if (progress.cooling >= 1) {
        faces.push(...box([-40, COOLER_Y, -40], [40, COOLER_Y + 4, 40], 'heatsink', LAYER.cooler));
        for (let i = 0; i < 7; i++) {
            const x = -37 + i * 12;
            faces.push(...box([x, COOLER_Y + 4, -40], [x + 3, COOLER_Y + 26, 40], 'heatsink', LAYER.cooler));
        }
    }
    if (progress.cooling >= 2) {
        const y = COOLER_Y + 28;
        faces.push(...box([-42, y, -42], [42, y + 6, -38], 'fanFrame', LAYER.fan));
        faces.push(...box([-42, y, 38], [42, y + 6, 42], 'fanFrame', LAYER.fan));
        faces.push(...box([-42, y, -38], [-38, y + 6, 38], 'fanFrame', LAYER.fan));
        faces.push(...box([38, y, -38], [42, y + 6, 38], 'fanFrame', LAYER.fan));
        for (let blade = 0; blade < 5; blade++) {
            faces.push(...turnedBox([6, y + 2, -5], [34, y + 3.5, 5], (blade * 2 * Math.PI) / 5, 'blade', LAYER.fan, true));
        }
        faces.push(...box([-7, y + 1, -7], [7, y + 5, 7], 'hub', LAYER.fan, true));
    }
    // Cracks across the board for each 10% of wear (drawn on the board's top, under the die).
    const wear = Math.round((THERMAL.maxDial - progress.chipMaxDial) / THERMAL.damagePerOverheat);
    for (let k = 0; k < wear; k++) {
        const side = k % 4;
        const along = -50 + noise(k) * 100;
        const start = side === 0 ? [along, BOARD_TOP, -BOARD] : side === 1 ? [BOARD, BOARD_TOP, along] : side === 2 ? [along, BOARD_TOP, BOARD] : [-BOARD, BOARD_TOP, along];
        const points = [start];
        let [x, , z] = start;
        for (let s = 1; s <= 4; s++) {
            x += (-x / 5) * (0.6 + noise(k * 7 + s)) + (noise(k * 13 + s) - 0.5) * 10;
            z += (-z / 5) * (0.6 + noise(k * 11 + s)) + (noise(k * 17 + s) - 0.5) * 10;
            points.push([x, BOARD_TOP + 0.05, z]);
        }
        faces.push({ points, normal: [0, 1, 0], material: 'crack', layer: LAYER.board, line: true });
    }
    return faces;
}
/** The lines under the model: cooler, clock, and wear. */
export function chipInfo(progress) {
    const wear = Math.round((THERMAL.maxDial - progress.chipMaxDial) / THERMAL.damagePerOverheat);
    return [
        COOLING[progress.cooling].name,
        `${formatMhz(ratedMhz(progress))}  CLK ${progress.clockLevel + 1}/${CLOCK.factors.length}`,
        ...(wear > 0 ? [`CRACKED: MAX CLOCK ${Math.round(progress.chipMaxDial * 100)}%`] : []),
    ];
}
/** Colors for the full-color eras; the parts take the era's syntax colors so they match the code on screen. */
function colorOf(material, era) {
    const { syntax } = era;
    const colors = {
        board: 0x1d5c3a, pin: 0xd8b04a, die: 0x3b4352, core: syntax.op,
        stage0: syntax.op, stage1: syntax.reg, stage2: syntax.num, stage3: syntax.label, stage4: era.accent,
        wire: era.accent, predictor: era.taken, cache: 0xb4bccb, oc: era.fire[1],
        heatsink: 0xb9c0ca, fanFrame: 0x2b2f38, blade: 0x8c95a5, hub: 0x4b515d, crack: 0x000000,
    };
    return colors[material];
}
/** How bright each material is in the green eras (0-1). */
const LUMA = {
    board: 0.4, pin: 0.9, die: 0.3, core: 1, stage0: 1, stage1: 0.85, stage2: 1, stage3: 0.85, stage4: 1,
    wire: 1, predictor: 0.9, cache: 0.95, oc: 1, heatsink: 0.75, fanFrame: 0.45, blade: 0.8, hub: 0.55, crack: 0,
};
/** Metal shines in the smooth era. */
const SHINY = new Set(['pin', 'heatsink', 'blade', 'cache']);
/** The 16 colors of an EGA card: the 16-bit chip is drawn only in these. */
const EGA = [
    0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xaa5500, 0xaaaaaa,
    0x555555, 0x5555ff, 0x55ff55, 0x55ffff, 0xff5555, 0xff55ff, 0xffff55, 0xffffff,
];
/** The 16-bit chip's materials as EGA colors (the parts keep the era's own, which are EGA already). */
const EGA_BASE = {
    board: 0x00aa00, pin: 0xffff55, die: 0x555555, cache: 0xaaaaaa,
    heatsink: 0xaaaaaa, fanFrame: 0x555555, blade: 0xaaaaaa, hub: 0x555555,
};
/** The nearest of the 16 EGA colors. */
const toEga = (color) => {
    const rgb = (c) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
    const [r, g, b] = rgb(color);
    return EGA.reduce((best, c) => {
        const [cr, cg, cb] = rgb(c);
        const [br, bg, bb] = rgb(best);
        return (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2 < (br - r) ** 2 + (bg - g) ** 2 + (bb - b) ** 2 ? c : best;
    });
};
const scaleColor = (color, k) => {
    const channel = (shift) => Math.max(0, Math.min(255, Math.round(((color >> shift) & 0xff) * k)));
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
};
const addWhite = (color, amount) => {
    const channel = (shift) => Math.min(255, Math.round(((color >> shift) & 0xff) + 255 * amount));
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
};
const norm = ([x, y, z]) => {
    const length = Math.hypot(x, y, z);
    return [x / length, y / length, z / length];
};
/** Light from the upper left, toward the viewer (camera space). */
const LIGHT = norm([-0.45, 0.75, -0.5]);
/** Halfway between the light and the view direction, for highlights. */
const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] - 1]);
/** Camera tilt: looking down at the chip from about 35 degrees above. */
const TILT = -0.62;
/** Distance from the camera to the model, and screen pixels per model unit at that distance. */
const DISTANCE = 420;
const UNIT_PX = 1.55;
/** Size of the area the model is drawn in (layout pixels). */
const AREA = { w: 340, h: 310 };
/** A spinning chip model drawn into the shop. Call update() every frame. */
export class ChipView {
    era;
    style;
    faces = [];
    /** Draws the shapes; on the pixelated styles it's drawn into `target` at low resolution and blown up. */
    graphics;
    target;
    /** Sprite pixels per layout pixel on the pixelated styles. */
    pixel;
    spin = 0;
    fan = 0;
    constructor(scene, era, x, y) {
        this.era = era;
        this.style = era.chip;
        this.pixel = this.style === 'flat' ? 3 : this.style === 'lowpoly' ? 2 : 1;
        if (this.pixel > 1) {
            this.graphics = scene.make.graphics({}, false);
            const target = scene.add.renderTexture(x - AREA.w / 2, y - AREA.h / 2, Math.ceil(AREA.w / this.pixel), Math.ceil(AREA.h / this.pixel));
            target.setOrigin(0).setScale(this.pixel);
            target.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
            this.target = target;
        }
        else {
            this.graphics = scene.add.graphics();
        }
        this.moveTo(x, y);
    }
    /** Builds the model, centered on the middle of everything stacked up (so a cooler on top doesn't push it off-center). */
    setModel(progress) {
        const faces = buildChip(progress);
        const middle = Math.max(...faces.flatMap((face) => face.points.map((p) => p[1]))) / 2;
        this.faces = faces.map((face) => ({ ...face, points: face.points.map(([x, y, z]) => [x, y - middle, z]) }));
    }
    /** Centers the model on (x, y): the shop moves it to shake it. */
    moveTo(x, y) {
        if (this.target)
            this.target.setPosition(Math.round(x - AREA.w / 2), Math.round(y - AREA.h / 2));
        else
            this.graphics.setPosition(x, y);
    }
    /** Turns the model a little and redraws it; the fan spins faster than the chip. */
    update(deltaMs, coolingLevel) {
        this.spin += (deltaMs / 1000) * 0.55;
        if (coolingLevel >= 2)
            this.fan += (deltaMs / 1000) * 7;
        this.draw();
    }
    draw() {
        const g = this.graphics.clear();
        // Pixelated styles draw around the middle of their small texture; the others around the graphics' position.
        const scale = 1 / this.pixel;
        const [ox, oy] = this.target ? [AREA.w / 2 / this.pixel, AREA.h / 2 / this.pixel] : [0, 0];
        const [cosA, sinA] = [Math.cos(this.spin), Math.sin(this.spin)];
        const [cosT, sinT] = [Math.cos(TILT), Math.sin(TILT)];
        const [cosF, sinF] = [Math.cos(this.fan), Math.sin(this.fan)];
        // Model space -> camera space: the fan's own turn, the spin about the vertical axis, then the tilt.
        const toCamera = ([x, y, z], spins = false) => {
            if (spins)
                [x, z] = [x * cosF - z * sinF, x * sinF + z * cosF];
            const [x1, z1] = [x * cosA + z * sinA, -x * sinA + z * cosA];
            return [x1, y * cosT - z1 * sinT, y * sinT + z1 * cosT];
        };
        const project = ([x, y, z]) => {
            const k = (UNIT_PX * DISTANCE * scale) / (DISTANCE + z);
            return { x: ox + x * k, y: oy - y * k };
        };
        const drawn = [];
        for (const face of this.faces) {
            const points = face.points.map((p) => toCamera(p, face.spins));
            const normal = toCamera(face.normal, face.spins);
            const center = [0, 1, 2].map((axis) => points.reduce((sum, p) => sum + p[axis], 0) / points.length);
            // Facing away from the camera (which sits at z = -DISTANCE): hidden.
            if (!face.line && normal[0] * center[0] + normal[1] * center[1] + normal[2] * (center[2] + DISTANCE) >= 0)
                continue;
            drawn.push({ face, points, normal, depth: center[2] });
        }
        // Layer by layer, back to front within each; a crack goes after the board it's drawn on.
        drawn.sort((a, b) => a.face.layer - b.face.layer || Number(Boolean(a.face.line)) - Number(Boolean(b.face.line)) || b.depth - a.depth);
        const { fg, bg } = this.era;
        for (const { face, points, normal } of drawn) {
            const screen = points.map(project);
            if (face.line) {
                g.lineStyle(this.style === 'smooth' ? 1.2 : 1, this.style === 'wire' ? fg : this.style === 'smooth' ? 0x050505 : bg, 0.9).strokePoints(screen, false);
                continue;
            }
            const light = Math.max(0, normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2]);
            const shade = 0.35 + 0.65 * light;
            if (this.style === 'wire') {
                // Vector-display style: hidden faces cleared to black, edges in phosphor.
                g.fillStyle(bg).fillPoints(screen, true);
                g.lineStyle(1, fg, 0.35 + 0.65 * LUMA[face.material]).strokePoints(screen, true);
            }
            else if (this.style === 'flat') {
                // Flat-shaded polygons in the 16 EGA colors, like late-80s PC 3D.
                const level = Math.max(1, Math.round(shade * 4)) / 4;
                const base = EGA_BASE[face.material] ?? colorOf(face.material, this.era);
                g.fillStyle(toEga(scaleColor(base, level * 1.15))).fillPoints(screen, true);
            }
            else if (this.style === 'lowpoly') {
                const banded = Math.round(shade * 6) / 6;
                g.fillStyle(scaleColor(colorOf(face.material, this.era), banded)).fillPoints(screen, true);
            }
            else {
                const highlight = SHINY.has(face.material)
                    ? Math.pow(Math.max(0, normal[0] * HALF[0] + normal[1] * HALF[1] + normal[2] * HALF[2]), 24) * 0.55
                    : 0;
                const color = addWhite(scaleColor(colorOf(face.material, this.era), shade), highlight);
                g.fillStyle(color).fillPoints(screen, true);
                g.lineStyle(0.6, scaleColor(color, 0.55), 0.6).strokePoints(screen, true);
            }
        }
        if (this.target)
            this.target.clear().draw(g);
    }
}
//# sourceMappingURL=chip3d.js.map