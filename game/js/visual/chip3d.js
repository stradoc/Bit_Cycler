import { CLOCK, COOLING } from '../data/economy.js';
import { formatMhz } from '../format.js';
import { ratedMhz, tierOf } from '../sim/progress.js';
import { THERMAL } from '../sim/thermal.js';
import { box, ModelView, turnedBox, UPPER_LEFT_LIGHT } from './model3d.js';
/** Model units: the board is 120 x 120, y is up. */
const BOARD = 60;
const BOARD_TOP = 6;
const DIE = 36;
const DIE_TOP = 10;
const PART_TOP = 14;
/** The cooler hovers this high above the board, so the die's parts stay in view. */
const COOLER_Y = 64;
/** The fan's hub, and where its blades start (clear of the hub's corners at every turn: 7 x sqrt 2 < 10). */
const HUB = 7;
const BLADE_ROOT = 10;
/** Small deterministic noise, so cracks land in the same places every time. */
const noise = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
};
/** The chip for this progress: board and pins, the die with every part owned, the cooler, and cracks. */
export function buildChip(progress) {
    const parts = [];
    const tier = tierOf(progress).number;
    const board = box([-BOARD, 0, -BOARD], [BOARD, BOARD_TOP, BOARD], 'board');
    // Pins on all four sides.
    for (let i = 0; i < 9; i++) {
        const p = -48 + i * 12;
        parts.push(box([p - 2, 1, -BOARD - 9], [p + 2, 3, -BOARD], 'pin'));
        parts.push(box([p - 2, 1, BOARD], [p + 2, 3, BOARD + 9], 'pin'));
        parts.push(box([-BOARD - 9, 1, p - 2], [-BOARD, 3, p + 2], 'pin'));
        parts.push(box([BOARD, 1, p - 2], [BOARD + 9, 3, p + 2], 'pin'));
    }
    parts.push(box([-DIE, BOARD_TOP, -DIE], [DIE, DIE_TOP, DIE], 'die'));
    // The die's parts.
    if (tier === 1) {
        parts.push(box([-20, DIE_TOP, -20], [20, PART_TOP + 2, 20], 'core'));
    }
    else {
        const stages = ['stage0', 'stage1', 'stage2', 'stage3', 'stage4'];
        stages.forEach((material, i) => parts.push(box([-31 + i * 13, DIE_TOP, -28], [-21 + i * 13, PART_TOP, -16], material)));
        // Superscalar: a second row of the five stages, so two instructions can go through side by side.
        if (tier >= 7)
            stages.forEach((material, i) => parts.push(box([-31 + i * 13, DIE_TOP, -7], [-21 + i * 13, PART_TOP, 2], material)));
        // Forwarding: a wire from EX and MEM back to the stage before them.
        if (tier >= 3)
            parts.push(box([-16, DIE_TOP, -12], [24, DIE_TOP + 1.5, -9], 'wire'));
        // Branch prediction, with a bit (1-bit) or two (2-bit) of history on top.
        if (tier >= 4) {
            parts.push(box([-30, DIE_TOP, 4], [-10, PART_TOP + 1, 26], 'predictor'));
            for (let bit = 0; bit < tier - 4; bit++)
                parts.push(box([-27 + bit * 9, PART_TOP + 1, 10], [-20 + bit * 9, PART_TOP + 5, 18], 'predictor'));
        }
    }
    // The L1 cache: 4 lines of 4 bytes, a little grid of memory cells.
    if (progress.cacheLevels > 0) {
        for (let line = 0; line < 4; line++) {
            for (let byte = 0; byte < 4; byte++) {
                const [x, z] = [6 + byte * 6.5, 4 + line * 6.5];
                parts.push(box([x, DIE_TOP, z], [x + 5, DIE_TOP + 3, z + 5], 'cache'));
            }
        }
    }
    // Overclocking: a hot rim around the die.
    if (progress.overclocking) {
        parts.push(box([-DIE, DIE_TOP, -DIE], [DIE, DIE_TOP + 1, -DIE + 2], 'oc'));
        parts.push(box([-DIE, DIE_TOP, DIE - 2], [DIE, DIE_TOP + 1, DIE], 'oc'));
        parts.push(box([-DIE, DIE_TOP, -DIE + 2], [-DIE + 2, DIE_TOP + 1, DIE - 2], 'oc'));
        parts.push(box([DIE - 2, DIE_TOP, -DIE + 2], [DIE, DIE_TOP + 1, DIE - 2], 'oc'));
    }
    // The cooler, hovering above: a heatsink (base and fins), and a fan on top of it.
    if (progress.cooling >= 1) {
        parts.push(box([-40, COOLER_Y, -40], [40, COOLER_Y + 4, 40], 'heatsink'));
        for (let i = 0; i < 7; i++) {
            const x = -37 + i * 12;
            parts.push(box([x, COOLER_Y + 4, -40], [x + 3, COOLER_Y + 26, 40], 'heatsink'));
        }
    }
    if (progress.cooling >= 2) {
        const y = COOLER_Y + 28;
        parts.push(box([-42, y, -42], [42, y + 6, -38], 'fanFrame'));
        parts.push(box([-42, y, 38], [42, y + 6, 42], 'fanFrame'));
        parts.push(box([-42, y, -38], [-38, y + 6, 38], 'fanFrame'));
        parts.push(box([38, y, -38], [42, y + 6, 38], 'fanFrame'));
        for (let blade = 0; blade < 5; blade++) {
            parts.push(turnedBox([BLADE_ROOT, y + 2, -5], [34, y + 3.5, 5], (blade * 2 * Math.PI) / 5, 'blade', true));
        }
        parts.push(box([-HUB, y + 1, -HUB], [HUB, y + 5, HUB], 'hub', true));
    }
    // Cracks across the board for each 10% of wear (drawn on the board's top, under the die).
    const wear = Math.round((THERMAL.maxDial - progress.chipMaxDial) / THERMAL.damagePerOverheat);
    const cracks = [];
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
        cracks.push({ points, normal: [0, 1, 0], material: 'crack' });
    }
    parts.unshift({ ...board, lines: cracks });
    return parts;
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
/** The chip's colors: the parts take the era's syntax colors so they match the code on screen. */
const CHIP_LOOK = {
    color: (material, era) => {
        const { syntax } = era;
        const colors = {
            board: 0x1d5c3a, pin: 0xd8b04a, die: 0x3b4352, core: syntax.op,
            stage0: syntax.op, stage1: syntax.reg, stage2: syntax.num, stage3: syntax.label, stage4: era.accent,
            wire: era.accent, predictor: era.taken, cache: 0xb4bccb, oc: era.fire[1],
            heatsink: 0xb9c0ca, fanFrame: 0x2b2f38, blade: 0x8c95a5, hub: 0x4b515d, crack: 0x000000,
        };
        return colors[material];
    },
    luma: {
        board: 0.4, pin: 0.9, die: 0.3, core: 1, stage0: 1, stage1: 0.85, stage2: 1, stage3: 0.85, stage4: 1,
        wire: 1, predictor: 0.9, cache: 0.95, oc: 1, heatsink: 0.75, fanFrame: 0.45, blade: 0.8, hub: 0.55, crack: 0,
    },
    shiny: new Set(['pin', 'heatsink', 'blade', 'cache']),
    // The parts keep the era's own colors, which are EGA already.
    ega: { board: 0x00aa00, pin: 0xffff55, die: 0x555555, cache: 0xaaaaaa, heatsink: 0xaaaaaa, fanFrame: 0x555555, blade: 0xaaaaaa, hub: 0x555555 },
    light: UPPER_LEFT_LIGHT,
};
/** Looking down at the chip from about 35 degrees above, 420 units away, in a 340 x 310 area. */
const TILT = -0.62;
const CHIP_VIEW = { w: 340, h: 310, distance: 420, unitPx: 1.55 };
/** The shop's spinning chip. Call update() every frame. */
export class ChipView extends ModelView {
    spin = 0;
    fan = 0;
    constructor(scene, era, x, y) {
        super(scene, era, x, y, CHIP_LOOK, CHIP_VIEW);
    }
    /** Builds the model, centered on the middle of everything stacked up (so a cooler on top doesn't push it off-center). */
    setModel(progress) {
        const parts = buildChip(progress);
        const middle = Math.max(...parts.map((part) => part.top)) / 2;
        const lower = (face) => ({ ...face, points: face.points.map(([x, y, z]) => [x, y - middle, z]) });
        this.setParts(parts.map((part) => ({
            ...part,
            faces: part.faces.map(lower),
            lines: part.lines.map(lower),
            bottom: part.bottom - middle,
            top: part.top - middle,
        })));
    }
    /** Turns the model a little and redraws it; the fan spins faster than the chip. */
    update(deltaMs, coolingLevel) {
        this.spin += (deltaMs / 1000) * 0.55;
        if (coolingLevel >= 2)
            this.fan += (deltaMs / 1000) * 7;
        this.draw({ yaw: this.spin, tilt: TILT, turn: this.fan });
    }
}
//# sourceMappingURL=chip3d.js.map