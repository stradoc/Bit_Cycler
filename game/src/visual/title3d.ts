import { blockPixels } from '../data/menuFiles.ts';
import type { Era } from '../ui/eras.ts';
import { HEIGHT, WIDTH } from './display.ts';
import { box, ModelView, norm, type Look, type Part } from './model3d.ts';

// The main menu's title as a 3D model: the block letters (data/menuFiles.ts)
// as solid blocks, drawn by model3d.ts in the era's style. It hovers, sways a
// little, and turns to face the mouse pointer.

/** Model units: one pixel of a block letter is PIXEL across; the letters are DEPTH deep. */
const PIXEL = 10;
const DEPTH = 16;

/** A rectangle of lit pixels: its first column and row, and its size in pixels. */
export type Block = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/**
 * The lit pixels ('#') as a few rectangles, which makes fewer boxes to sort
 * and draw than one per pixel: each takes the longest run along its row from
 * the first pixel not yet covered, then as many rows down as stay lit.
 */
export function pixelBlocks(rows: readonly string[]): Block[] {
  const covered = rows.map((row) => [...row].map(() => false));
  const free = (x: number, y: number) => rows[y]?.[x] === '#' && !covered[y][x];
  const blocks: Block[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!free(x, y)) continue;
      let w = 1;
      while (free(x + w, y)) w++;
      let h = 1;
      while (Array.from({ length: w }, (_, i) => free(x + i, y + h)).every(Boolean)) h++;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) covered[y + dy][x + dx] = true;
      blocks.push({ x, y, w, h });
    }
  });
  return blocks;
}

/**
 * The title's model, centered on the whole word: its first `shown` letters
 * (the rest still to be typed), then a block cursor if `cursor`.
 */
export function buildTitle(word: string, shown = word.length, cursor = false): Part<'letter'>[] {
  const width = blockPixels(word)[0].length;
  const typed = blockPixels(word.slice(0, shown));
  const start = shown > 0 ? typed[0].length + 1 : 0;
  const rows = typed.map((row) =>
    [...row.padEnd(width, '.')].map((pixel, x) => (cursor && x >= start && x < start + 5 ? '#' : pixel)).join(''),
  );
  const [left, top] = [(-width / 2) * PIXEL, (rows.length / 2) * PIXEL];
  return pixelBlocks(rows).map(({ x, y, w, h }) =>
    box([left + x * PIXEL, top - (y + h) * PIXEL, -DEPTH / 2], [left + (x + w) * PIXEL, top - y * PIXEL, DEPTH / 2], 'letter'),
  );
}

/** The letters in the era's accent color, lit mostly from the front so their faces stay bright. */
const TITLE_LOOK: Look<'letter'> = {
  color: (_material, era) => era.accent,
  luma: { letter: 1 },
  shiny: new Set(),
  ega: {},
  light: norm([-0.35, 0.45, -0.85]),
};

/** The camera: far enough that the word's ends don't stretch much as it turns. */
const VIEW = { w: 600, h: 130, distance: 900, unitPx: 0.85 } as const;

/** How the title moves (radians, layout pixels and seconds). */
const MOTION = {
  /** Looking down a little, so the letters' tops show their depth. */
  tilt: -0.18,
  /** Hovering up and down. */
  bob: { px: 4, seconds: 3.2 },
  /** Swaying on its own, slowly. */
  sway: { yaw: 0.07, tilt: 0.03, seconds: 7 },
  /** Turning toward the pointer at the screen's edges, and drifting toward it. */
  follow: { yaw: 0.32, tilt: 0.2, x: 10, y: 5 },
  /** How quickly it catches up with the pointer (the gap shrinks by e each 1 / ease seconds). */
  ease: 3,
} as const;

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/** The main menu's 3D title. Call update() every frame. */
export class TitleLogo {
  private readonly view: ModelView<'letter'>;
  private readonly word: string;
  private readonly x: number;
  private readonly y: number;
  /** Where the pointer is, from -1 to 1 across and down the screen (0, 0: the middle, or no pointer); and where the title faces now, catching up. */
  private target = { x: 0, y: 0 };
  private aim = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, era: Era, x: number, y: number, word: string) {
    this.view = new ModelView(scene, era, x, y, TITLE_LOOK, VIEW);
    this.word = word;
    this.x = x;
    this.y = y;
    this.show(word.length);
    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.target = { x: clamp((pointer.worldX - WIDTH / 2) / (WIDTH / 2)), y: clamp((pointer.worldY - HEIGHT / 2) / (HEIGHT / 2)) };
    });
    // The pointer leaving the game: back to facing front.
    scene.input.on('gameout', () => (this.target = { x: 0, y: 0 }));
  }

  /** Shows the first `letters` letters, and a block cursor after them if `cursor` (the title typing itself). */
  show(letters: number, cursor = false): void {
    this.view.setParts(buildTitle(this.word, letters, cursor));
  }

  /** Moves it on and redraws it (`timeMs`: the scene's clock). */
  update(timeMs: number, deltaMs: number): void {
    const catchUp = 1 - Math.exp((-MOTION.ease * deltaMs) / 1000);
    this.aim = { x: this.aim.x + (this.target.x - this.aim.x) * catchUp, y: this.aim.y + (this.target.y - this.aim.y) * catchUp };
    const wave = (seconds: number, phase = 0) => Math.sin((2 * Math.PI * timeMs) / 1000 / seconds + phase);
    const { bob, sway, follow } = MOTION;
    // Facing the pointer: to the right turns the front rightward (a negative yaw); above tilts it up.
    this.view.draw({
      yaw: -this.aim.x * follow.yaw + sway.yaw * wave(sway.seconds),
      tilt: MOTION.tilt - this.aim.y * follow.tilt + sway.tilt * wave(sway.seconds * 0.77, 1),
      turn: 0,
    });
    this.view.moveTo(this.x + this.aim.x * follow.x, this.y + this.aim.y * follow.y + bob.px * wave(bob.seconds));
  }
}
