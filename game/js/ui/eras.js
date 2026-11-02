// Everything that changes from one era to the next, in one place. The era is
// the computer you own: it follows the CPU chip in the save (its word size,
// data/economy.ts CHIPS), and the look modernizes as the chips get wider: a
// flickering green-phosphor CRT, a DOS app, a mid-90s desktop, a terminal
// window on a modern LCD. This is the look of each period's computers, not a
// claim that word size changes the screen.
//
// An era says what its computer is like; the shared modules read it and do
// the rest: the screen's rendering (visual/display.ts, visual/terminal.ts),
// the widgets (ui/widgets.ts, ui/list.ts), the boot and the files
// (data/boot.ts, data/menuFiles.ts) and the sound (audio/). Changing an era,
// or adding one, happens here.
import { getProgress } from '../save.js';
import { getSettings } from '../settings.js';
/** Gray, as the 90s shipped it. */
export const CLASSIC = {
    light: 0xffffff, soft: 0xdfdfdf, face: 0xc0c0c0, shadow: 0x808080, dark: 0x000000,
    field: 0xffffff, select: 0x000080, selectText: 0xffffff,
};
/** The dark variant: charcoal, like the period's slate and high-contrast color schemes. */
export const CLASSIC_DARK = {
    light: 0x707070, soft: 0x555555, face: 0x3a3a3a, shadow: 0x222222, dark: 0x000000,
    field: 0x1a1a1a, select: 0x2d5a96, selectText: 0xffffff,
};
const NO_GLOW = { glow: 0, bootGlow: 1.2, menuGlow: 0 };
const NO_CRT = { scanlines: 0, curve: 0, vignette: 0, flicker: 0, lcd: 0 };
/** A mid-90s desktop: a gray window with 3D edges on teal, black text, the 16-color VGA palette. */
const DESKTOP = {
    name: '32-BIT', bits: 32, kind: 'desktop',
    fg: 0x000000, dim: 0x808080, bg: CLASSIC.face, accent: 0x000080,
    syntax: { op: 0x000080, reg: 0x008080, num: 0x800000, label: 0x800080, punct: 0x606060 },
    taken: 0x0050c8, notTaken: 0xb85c00,
    fire: [0xffff60, 0xff8000, 0xc00000],
    // A thin early-90s PC font, closer to the period's light interface text than DOS's heavy one.
    font: "'IBM XGA', monospace",
    screen: {
        hires: true, smooth: false, ...NO_GLOW, ...NO_CRT,
        frame: { style: 'classic', desk: 0x008080, bar: 0x000080, bar2: 0x1084d0, title: 0xffffff, border: CLASSIC.dark, palette: CLASSIC },
    },
    computer: { display: 'crt', drive: 'disk', bios: 'BIT CYCLER BIOS 4.0', bootText: 0xaaaaaa, root: 'C:\\BITCYCLR', shell: false, splash: 0xffffff, beam: 0xffffff },
    sound: { whine: true, beep: true },
    motion: { style: 'tween' },
    models: 'lowpoly',
    tick: 'pixels',
};
export const ERAS = [
    {
        name: '8-BIT', bits: 8, kind: 'terminal',
        fg: 0x39ff14, dim: 0x0f4a06, bg: 0x030803, accent: 0x39ff14,
        syntax: { op: 0x39ff14, reg: 0x2ccc10, num: 0x1f9a0b, label: 0x1f9a0b, punct: 0x177508 },
        taken: 0x39ff14, notTaken: 0x26b80d,
        fire: [0xd8ffc8, 0x39ff14, 0x1f9a0b],
        // The original IBM PC's ROM font, drawn tall as CGA text looked on screen.
        font: "'IBM BIOS', monospace",
        screen: { hires: false, smooth: false, glow: 1.8, bootGlow: 1.2, menuGlow: 0.5, scanlines: 0.4, curve: 0.02, vignette: 0.4, flicker: 0.02, lcd: 0 },
        computer: { display: 'crt', drive: 'floppy', bios: 'BIT CYCLER BIOS 1.0', bootText: 0x39ff14, root: 'A:', shell: false, splash: 0x39ff14, beam: 0xd8ffc8 },
        sound: { whine: true, beep: true },
        // A phosphor screen: nothing slides, but what goes dark fades over a quarter second.
        motion: { style: 'cut', afterglow: 250 },
        models: 'wire',
        tick: 'ascii',
    },
    {
        // A late-80s DOS app in text mode on a CRT: blue, the 16-color palette, double-line boxes, drop shadows.
        name: '16-BIT', bits: 16, kind: 'dos',
        fg: 0xd0d0d0, dim: 0x3a3ac8, bg: 0x0000aa, accent: 0x55ffff,
        syntax: { op: 0xffffff, reg: 0xffff55, num: 0x55ff55, label: 0xff55ff, punct: 0xaaaaaa },
        taken: 0x55ffff, notTaken: 0xffaa00,
        fire: [0xffff55, 0xff5555, 0xaa0000],
        // DOS's own: the VGA text-mode font.
        font: "'IBM VGA', monospace",
        screen: {
            hires: true, smooth: false, ...NO_GLOW, ...NO_CRT, scanlines: 0.22, vignette: 0.25,
            frame: {
                style: 'dos', desk: 0x0000aa, bar: 0xaaaaaa, bar2: 0xaaaaaa, title: 0x000000, border: 0x000000,
                palette: { light: 0xffffff, soft: 0xaaaaaa, face: 0xaaaaaa, shadow: 0x000000, dark: 0x000000, field: 0x0000aa, select: 0x00aaaa, selectText: 0x000000 },
            },
        },
        computer: { display: 'crt', drive: 'disk', bios: 'BIT CYCLER BIOS 2.0', bootText: 0xaaaaaa, root: 'C:\\BITCYCLR', shell: false, splash: 0x55ffff, beam: 0xffffff },
        sound: { whine: true, beep: true },
        // Text mode: redrawn about ten times a second, in whole character cells.
        motion: { style: 'step', fps: 10, cell: { x: 8, y: 16 } },
        models: 'flat',
        tick: 'cp437',
    },
    {
        ...DESKTOP,
        dark: {
            // Its dark variant: charcoal windows, light text, the bright VGA colors.
            ...DESKTOP,
            fg: 0xe0e0e0, dim: 0x6a6a6a, bg: CLASSIC_DARK.face, accent: 0x7ab8ff,
            syntax: { op: 0x55ffff, reg: 0x55ff55, num: 0xffff55, label: 0xff77ff, punct: 0xa0a0a0 },
            taken: 0x5fb3ff, notTaken: 0xffa040,
            screen: {
                ...DESKTOP.screen,
                frame: { style: 'classic', desk: 0x1c2a33, bar: 0x1c2f5e, bar2: 0x4a6aa5, title: 0xf0f0f0, border: CLASSIC_DARK.dark, palette: CLASSIC_DARK },
            },
        },
    },
    {
        // A terminal window on a modern LCD: black, with colored accents and syntax.
        name: '64-BIT', bits: 64, kind: 'modern',
        fg: 0xe6e6e6, dim: 0x30343c, bg: 0x000000, accent: 0x4fd6be,
        syntax: { op: 0x7ee787, reg: 0x79c0ff, num: 0xffd479, label: 0xd2a8ff, punct: 0x8b949e },
        taken: 0x56b4e9, notTaken: 0xe69f00,
        fire: [0xfff3b0, 0xff8c1a, 0xd62a0a],
        // A modern programmer's font, at full resolution.
        font: "'JetBrains Mono', monospace",
        screen: {
            hires: true, smooth: true, glow: 0, bootGlow: 1.2, menuGlow: 1, ...NO_CRT, lcd: 0.5,
            frame: { style: 'modern', desk: 0x14171d, bar: 0x22262e, bar2: 0x22262e, title: 0x9aa3b2, border: 0x3a404c },
        },
        computer: { display: 'lcd', drive: 'ssd', bios: '', bootText: 0xe6e6e6, root: '~/bit-cycler', shell: true, splash: 0x4fd6be, beam: 0xffffff },
        sound: { whine: false, beep: false },
        motion: { style: 'ease' },
        models: 'smooth',
        tick: 'vector',
    },
];
/** An era shown for this session only (?era=N, for previews and testing), in place of the save's. */
let preview;
/** Shows ERAS[index] until the page reloads; undefined goes back to the save's era. */
export function previewEra(index) {
    preview = index === undefined ? undefined : ERAS.at(index);
}
/** The era of the computer you own: the active save's chip (or a preview), before dark mode. */
export function baseEra() {
    return preview ?? ERAS.find((era) => era.bits === getProgress().wordBits) ?? ERAS[0];
}
/** The era on screen: the save's, in its dark variant if dark mode is on and it has one. */
export function currentEra() {
    const era = baseEra();
    return getSettings().dark && era.dark ? era.dark : era;
}
export function cssColor(color) {
    return `#${color.toString(16).padStart(6, '0')}`;
}
/** The era's desktop colors (the light gray ones if it has none). */
export function palette(era) {
    return era.screen.frame?.palette ?? CLASSIC;
}
//# sourceMappingURL=eras.js.map