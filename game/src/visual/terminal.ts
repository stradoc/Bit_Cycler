// The terminal look modernizes as the CPU's word size grows: from a flickering
// green-phosphor CRT to a flat modern terminal. This is era styling, not a
// claim that word size affects the display.

import type { TokenKind } from '../sim/isa.ts';

/** Color per syntax token kind. */
export type SyntaxColors = Readonly<Record<TokenKind, number>>;

export type Era = {
  readonly name: string;
  readonly fg: number; // phosphor / text color
  readonly dim: number; // unlit or secondary elements
  readonly bg: number;
  // Monochrome CRTs highlight with brightness; color arrives in later eras.
  readonly syntax: SyntaxColors;
  // Tier 4 branch hints: what a branch did last time, matching its key (K taken, J not taken).
  // Monochrome eras tell them apart by brightness; later eras use a colorblind-safe blue / orange.
  readonly taken: number;
  readonly notTaken: number;
  readonly bloom: number; // 0 = none
  readonly scanlines: number; // overlay opacity, 0 = none
  readonly curve: number; // barrel distortion, 0 = flat
  readonly vignette: number; // 0 = none
  readonly flicker: number; // random brightness wobble, 0 = none
};

export const ERAS: readonly Era[] = [
  {
    name: '8-BIT', fg: 0x39ff14, dim: 0x0f4a06, bg: 0x030803,
    syntax: { op: 0x39ff14, reg: 0x2ccc10, num: 0x1f9a0b, label: 0x1f9a0b, punct: 0x177508 },
    taken: 0x39ff14, notTaken: 0x26b80d,
    bloom: 1.8, scanlines: 0.25, curve: 0.02, vignette: 0.3, flicker: 0.02,
  },
  {
    name: '16-BIT', fg: 0x8cff7a, dim: 0x1f4d1a, bg: 0x040904,
    syntax: { op: 0x8cff7a, reg: 0x70d661, num: 0x52ab45, label: 0x52ab45, punct: 0x3e8034 },
    taken: 0x8cff7a, notTaken: 0x52ab45,
    bloom: 1.2, scanlines: 0.15, curve: 0.01, vignette: 0.2, flicker: 0,
  },
  {
    name: '32-BIT', fg: 0xf0f5f0, dim: 0x3c453c, bg: 0x0a0c0a,
    syntax: { op: 0xffffff, reg: 0x9fd8dc, num: 0xe6d49a, label: 0xd4b4e6, punct: 0x8a948a },
    taken: 0x56b4e9, notTaken: 0xe69f00,
    bloom: 0.6, scanlines: 0.06, curve: 0, vignette: 0.1, flicker: 0,
  },
  {
    name: '64-BIT', fg: 0xe8e8e8, dim: 0x45474d, bg: 0x1a1b1e,
    syntax: { op: 0xffffff, reg: 0x56d4dd, num: 0xe5c07b, label: 0xc678dd, punct: 0x8a8f98 },
    taken: 0x56b4e9, notTaken: 0xe69f00,
    bloom: 0, scanlines: 0, curve: 0, vignette: 0, flicker: 0,
  },
];

export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

const SCANLINE_TEXTURE = 'scanlines';

/** Applies an era's CRT effects to a scene's main camera. Call update() every frame. */
export class TerminalLook {
  era: Era;
  private readonly scene: Phaser.Scene;
  private readonly scanlines: Phaser.GameObjects.TileSprite;

  constructor(scene: Phaser.Scene, era: Era) {
    this.scene = scene;
    this.era = era;

    // A 1x2 tile: one clear row, one dark row, repeated down the screen.
    if (!scene.textures.exists(SCANLINE_TEXTURE)) {
      const tile = scene.textures.createCanvas(SCANLINE_TEXTURE, 1, 2);
      tile?.context.fillRect(0, 1, 1, 1);
      tile?.refresh();
    }
    const { width, height } = scene.scale;
    this.scanlines = scene.add
      .tileSprite(0, 0, width, height, SCANLINE_TEXTURE)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1000);

    this.setEra(era);
  }

  setEra(era: Era): void {
    this.era = era;
    const camera = this.scene.cameras.main;
    camera.setBackgroundColor(era.bg).setAlpha(1);
    this.scanlines.setAlpha(era.scanlines).setVisible(era.scanlines > 0);

    const fx = camera.postFX;
    if (!fx) return; // Canvas renderer: no shader effects
    fx.clear();
    if (era.bloom > 0) fx.addBloom(0xffffff, 1, 1, 1, era.bloom, 4);
    if (era.curve > 0) fx.addBarrel(1 + era.curve);
    if (era.vignette > 0) fx.addVignette(0.5, 0.5, 0.9, era.vignette);
  }

  update(): void {
    if (this.era.flicker > 0) {
      this.scene.cameras.main.setAlpha(1 - Math.random() * this.era.flicker);
    }
  }
}
