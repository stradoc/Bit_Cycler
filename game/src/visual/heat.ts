import type { Era } from './terminal.ts';

// How hot the screen looks, building up in stages as the chip heats:
//   warm  a red glow behind the highway
//   hot   smoke and sparks rising from the bottom
//   critical  flames along the base and up the sides, just before throttling
// Exaggerated on purpose: a real chip throttles long before anything burns.

// Each stage starts this many degrees below the overheat point (95°C on a new chip: 75, 85, 91).
const WARM = 20;
const HOT = 10;
const CRITICAL = 4;
const DOT = 'heat-dot';

type Area = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** A soft white dot the particles are tinted from. */
function ensureTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(DOT)) return;
  const g = scene.make.graphics({}, false);
  for (let r = 8; r > 0; r--) g.fillStyle(0xffffff, 0.12 + 0.88 * (1 - r / 8)).fillCircle(8, 8, r);
  g.generateTexture(DOT, 16, 16);
  g.destroy();
}

/** Particles start at random points in this rectangle. */
function band(x: number, y: number, width: number, height: number): Phaser.GameObjects.Particles.Zones.RandomZone {
  return new Phaser.GameObjects.Particles.Zones.RandomZone({
    getRandomPoint: (point) => {
      point.x = x + Math.random() * width;
      point.y = y + Math.random() * height;
      return point;
    },
  });
}

/** 0 below `from`, rising to 1 at `to`. */
const ramp = (value: number, from: number, to: number) => Math.min(1, Math.max(0, (value - from) / (to - from)));

export class HeatEffects {
  private readonly glow: Phaser.GameObjects.Rectangle;
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly flames: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sideFlames: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, era: Era, area: Area) {
    ensureTexture(scene);
    const [core, flame, ember] = era.fire;
    const { x, y, width, height } = area;
    const bottom = y + height;
    // Behind the notes (their boxes are filled), so the fire shows around them.
    const depth = -1;

    this.glow = scene.add.rectangle(x, y, width, height, ember).setOrigin(0).setAlpha(0).setDepth(depth - 1);
    this.smoke = scene.add
      .particles(0, 0, DOT, {
        emitZone: band(x, bottom - 20, width, 20),
        speedY: { min: -70, max: -30 },
        speedX: { min: -12, max: 12 },
        scale: { start: 1.2, end: 4 },
        alpha: { start: 0.18, end: 0 },
        tint: era.dim,
        lifespan: 3200,
        frequency: -1,
      })
      .setDepth(depth);
    this.sparks = scene.add
      .particles(0, 0, DOT, {
        emitZone: band(x, bottom - 6, width, 6),
        speedY: { min: -220, max: -110 },
        speedX: { min: -40, max: 40 },
        gravityY: 160,
        scale: { start: 0.35, end: 0.05 },
        alpha: { start: 1, end: 0 },
        tint: core,
        lifespan: 900,
        blendMode: 'ADD',
        frequency: -1,
      })
      .setDepth(depth);
    // Many small, quick particles read as flickering tongues of flame rather than blobs.
    const fire = {
      speedY: { min: -190, max: -80 },
      speedX: { min: -18, max: 18 },
      scale: { start: 1.1, end: 0.05 },
      alpha: { start: 0.9, end: 0 },
      color: [core, flame, ember],
      colorEase: 'quad.out',
      lifespan: { min: 350, max: 750 },
      blendMode: 'ADD',
      frequency: -1,
    };
    this.flames = scene.add
      .particles(0, 0, DOT, { ...fire, emitZone: band(x, bottom - 10, width, 10) })
      .setDepth(depth);
    this.sideFlames = scene.add
      .particles(0, 0, DOT, {
        ...fire,
        scale: { start: 0.9, end: 0.05 },
        // Either edge of the highway, from the bottom up to about the hit line.
        emitZone: new Phaser.GameObjects.Particles.Zones.RandomZone({
          getRandomPoint: (point) => {
            point.x = Math.random() < 0.5 ? x + 4 : x + width - 4;
            point.y = bottom - Math.random() * height * 0.55;
            return point;
          },
        }),
      })
      .setDepth(depth);
  }

  /** Call every frame with the chip's temperature and the one it overheats at (lower on a worn chip). */
  update(temperature: number, limit: number, halted: boolean, now: number): void {
    const warm = ramp(temperature, limit - WARM, limit);
    const flicker = 0.85 + 0.15 * Math.sin(now / 70) * Math.sin(now / 23);
    this.glow.setAlpha((halted ? 0.22 : 0.16 * warm) * flicker);
    this.rate(this.smoke, ramp(temperature, limit - HOT - 3, limit), 260, 60);
    this.rate(this.sparks, ramp(temperature, limit - HOT, limit), 200, 25);
    const blaze = halted ? 1 : ramp(temperature, limit - CRITICAL, limit);
    this.rate(this.flames, blaze, 30, 3);
    this.rate(this.sideFlames, blaze, 40, 5);
  }

  /** Emits faster as `level` goes 0 -> 1 (one particle every `slowMs` ... `fastMs`); off at 0. */
  private rate(emitter: Phaser.GameObjects.Particles.ParticleEmitter, level: number, slowMs: number, fastMs: number): void {
    if (level <= 0) {
      if (emitter.emitting) emitter.stop();
      return;
    }
    emitter.frequency = slowMs + (fastMs - slowMs) * level;
    if (!emitter.emitting) emitter.start();
  }

  /** Stops new particles (e.g. when the song ends); ones in flight finish. */
  stop(): void {
    for (const emitter of [this.smoke, this.sparks, this.flames, this.sideFlames]) emitter.stop();
    this.glow.setAlpha(0);
  }
}
