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

import type { WordBits } from '../data/economy.ts';
import { getProgress } from '../save.ts';
import type { TokenKind } from '../sim/isa.ts';
import { getSettings } from '../settings.ts';
import type { EraMotion } from '../data/motions.ts';
import type { TickLook } from '../data/tick.ts';
import type { ModelStyle } from '../visual/model3d.ts';

/** Color per syntax token kind. */
export type SyntaxColors = Readonly<Record<TokenKind, number>>;

/**
 * What kind of computer an era is: it decides how widgets are drawn. A
 * green-phosphor terminal (reverse-video selections, plain frames), a DOS app
 * (solid selection bars, double lines, black drop shadows), a 90s desktop
 * (3D buttons that press in, sunken fields) or a modern terminal (outlined
 * selections that glide).
 */
export type EraKind = 'terminal' | 'dos' | 'desktop' | 'modern';

/** A 90s desktop's colors: its edges' highlights and shadows, the face of windows and buttons, text fields, and selections. */
export type ClassicPalette = {
  readonly light: number;
  readonly soft: number;
  readonly face: number;
  readonly shadow: number;
  readonly dark: number;
  /** Inside a sunken text field. */
  readonly field: number;
  /** A selected item, and its text. */
  readonly select: number;
  readonly selectText: number;
};

/** Gray, as the 90s shipped it. */
export const CLASSIC: ClassicPalette = {
  light: 0xffffff, soft: 0xdfdfdf, face: 0xc0c0c0, shadow: 0x808080, dark: 0x000000,
  field: 0xffffff, select: 0x000080, selectText: 0xffffff,
};

/** The dark variant: charcoal, like the period's slate and high-contrast color schemes. */
export const CLASSIC_DARK: ClassicPalette = {
  light: 0x707070, soft: 0x555555, face: 0x3a3a3a, shadow: 0x222222, dark: 0x000000,
  field: 0x1a1a1a, select: 0x2d5a96, selectText: 0xffffff,
};

/** The screen around the game: a window on a desktop, or a DOS app's menu and status bars. */
export type Frame = {
  readonly style: 'classic' | 'modern' | 'dos';
  readonly desk: number;
  /** The title bar, as a gradient from left to right. */
  readonly bar: number;
  readonly bar2: number;
  readonly title: number;
  readonly border: number;
  /** The colors for 3D edges, fields and selections. */
  readonly palette?: ClassicPalette;
};

export type Era = {
  readonly name: string;
  /** The chip whose era this is: buying it moves the computer here. */
  readonly bits: WordBits;
  readonly kind: EraKind;

  // ---- colors ----
  readonly fg: number; // phosphor / text color
  readonly dim: number; // unlit or secondary elements
  readonly bg: number;
  /** Box frames and titles, the hit line, selections: the text color on the CRTs, a color on the modern terminal. */
  readonly accent: number;
  // Monochrome CRTs highlight with brightness; color arrives in later eras.
  readonly syntax: SyntaxColors;
  // Tier 4 branch hints: what a branch did last time, matching its key (K taken, J not taken).
  // Monochrome eras tell them apart by brightness; later eras use a colorblind-safe blue / orange.
  readonly taken: number;
  readonly notTaken: number;
  /** Heat effects, hottest first (core, flame, ember): phosphor-green fire on the CRTs, real fire later. Warnings use the flame. */
  readonly fire: readonly [number, number, number];
  /** CSS font family for all text. */
  readonly font: string;

  /** The screen: how the picture is made (visual/display.ts, visual/terminal.ts). */
  readonly screen: {
    /** Drawn at the screen's real resolution (else a 960x540 canvas stretched with chunky pixels). */
    readonly hires: boolean;
    /** Sub-pixel motion and eased transitions (else snapped to pixels, and changes show at once). */
    readonly smooth: boolean;
    /** Glow (bloom) everywhere, 0 = none; and extra on the dark boot screen and main menu. */
    readonly glow: number;
    readonly bootGlow: number;
    readonly menuGlow: number;
    /** How dark the CRT overlay's scanlines are (0 = no CRT overlay). */
    readonly scanlines: number;
    /** Barrel distortion, 0 = flat. */
    readonly curve: number;
    /** The CRT overlay's darkened edges, 0 = none. */
    readonly vignette: number;
    /** Random brightness wobble, 0 = none. */
    readonly flicker: number;
    /** Strength of the LCD's red / green / blue subpixel grid over the screen (0 = none). */
    readonly lcd: number;
    /** A window on a desktop or a DOS app's bars; without one, the screen is the terminal. */
    readonly frame?: Frame;
  };

  /** The computer itself: what the intro shows and plays, and how files are named. */
  readonly computer: {
    /** A CRT degausses on and squeezes shut; an LCD's backlight fades. */
    readonly display: 'crt' | 'lcd';
    /** What it loads from: a floppy's stepping head, a hard drive's ticks, a silent SSD. */
    readonly drive: 'floppy' | 'disk' | 'ssd';
    /** The boot screen's BIOS banner and its text color on black. */
    readonly bios: string;
    readonly bootText: number;
    /** Where its files live, and whether they're listed by a shell (lowercase, ls) rather than DOS (8.3 capitals, DIR). */
    readonly root: string;
    readonly shell: boolean;
    /** The title splash's color on the black boot screen, and a CRT's bright line as its picture opens or collapses. */
    readonly splash: number;
    readonly beam: number;
  };

  /** Sounds that belong to this computer (audio/). */
  readonly sound: {
    /** A CRT's high whine in the hum (an LCD makes none). */
    readonly whine: boolean;
    /** The PC speaker's beep when the power-on self test passes. */
    readonly beep: boolean;
  };

  /**
   * How things move on its screen (data/motions.ts): the green CRT jumps but
   * lets fading things glow off, DOS steps in character cells, the 90s
   * desktop slides plainly, the modern era eases; and its own versions of any animation.
   */
  readonly motion: EraMotion;

  /** How 3D models (the shop's chip, the main menu's title) are drawn: the way 3D looked at the time (visual/model3d.ts). */
  readonly models: ModelStyle;
  /**
   * How TICK, the guide, is drawn (data/tick.ts): in plain characters, in the
   * PC's own box and block characters, as a 16-color pixel sprite, or in smooth vector shapes.
   */
  readonly tick: TickLook;
  /** A dark variant of this era, chosen in the settings (the era itself never is). */
  readonly dark?: Era;
};

const NO_GLOW = { glow: 0, bootGlow: 1.2, menuGlow: 0 } as const;
const NO_CRT = { scanlines: 0, curve: 0, vignette: 0, flicker: 0, lcd: 0 } as const;

/** A mid-90s desktop: a gray window with 3D edges on teal, black text, the 16-color VGA palette. */
const DESKTOP: Era = {
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

export const ERAS: readonly Era[] = [
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
let preview: Era | undefined;

/** Shows ERAS[index] until the page reloads; undefined goes back to the save's era. */
export function previewEra(index: number | undefined): void {
  preview = index === undefined ? undefined : ERAS.at(index);
}

/** The era of the computer you own: the active save's chip (or a preview), before dark mode. */
export function baseEra(): Era {
  return preview ?? ERAS.find((era) => era.bits === getProgress().wordBits) ?? ERAS[0];
}

/** The era on screen: the save's, in its dark variant if dark mode is on and it has one. */
export function currentEra(): Era {
  const era = baseEra();
  return getSettings().dark && era.dark ? era.dark : era;
}

export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** The era's desktop colors (the light gray ones if it has none). */
export function palette(era: Era): ClassicPalette {
  return era.screen.frame?.palette ?? CLASSIC;
}
