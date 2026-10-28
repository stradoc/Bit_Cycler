// The terminal look modernizes as the CPU's word size grows: from a flickering
// green-phosphor CRT to a flat modern terminal. This is era styling, not a
// claim that word size affects the display.

export type Era = {
  readonly name: string;
  readonly fg: number; // phosphor / text color
  readonly dim: number; // unlit or secondary elements
  readonly bg: number;
  readonly bloom: number; // 0 = none
  readonly scanlines: number; // overlay opacity, 0 = none
  readonly curve: number; // barrel distortion, 0 = flat
  readonly vignette: number; // 0 = none
  readonly flicker: number; // random brightness wobble, 0 = none
};

export const ERAS: readonly Era[] = [
  { name: '8-BIT', fg: 0x39ff14, dim: 0x0f4a06, bg: 0x030803, bloom: 1.8, scanlines: 0.25, curve: 0.04, vignette: 0.3, flicker: 0.02 },
  { name: '16-BIT', fg: 0x8cff7a, dim: 0x1f4d1a, bg: 0x040904, bloom: 1.2, scanlines: 0.15, curve: 0.02, vignette: 0.2, flicker: 0 },
  { name: '32-BIT', fg: 0xf0f5f0, dim: 0x3c453c, bg: 0x0a0c0a, bloom: 0.6, scanlines: 0.06, curve: 0, vignette: 0.1, flicker: 0 },
  { name: '64-BIT', fg: 0xe8e8e8, dim: 0x45474d, bg: 0x1a1b1e, bloom: 0, scanlines: 0, curve: 0, vignette: 0, flicker: 0 },
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
