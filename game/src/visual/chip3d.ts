import { CLOCK, COOLING } from '../data/economy.ts';
import { formatMhz } from '../format.ts';
import { ratedMhz, tierOf, type Progress } from '../sim/progress.ts';
import { THERMAL } from '../sim/thermal.ts';
import type { Era } from './terminal.ts';

// The shop's chip as a small spinning 3D model, drawn the way 3D looked in
// each era: a green wireframe (8-bit), flat-shaded polygons in the 16 EGA
// colors (16-bit), low-poly color (32-bit), smooth shading (64-bit). The renderer is
// our own: rotate every corner, project it with perspective, drop faces that
// point away from the viewer, draw the parts back to front (the painter's
// algorithm, ordered part by part: `drawOrder`) and fill their faces, shaded
// by how directly each one faces the light.
// The model shows what's owned: the die's parts, the cooler hovering above it
// (an exploded view, so it doesn't hide the die), and cracks from wear.

/** How an era draws the chip. */
export type ChipStyle = 'wire' | 'flat' | 'lowpoly' | 'smooth';

type Vec3 = readonly [number, number, number];
/** A point seen from above: (x, z). */
type Plan = readonly [number, number];

type Material =
  | 'board' | 'pin' | 'die' | 'core' | 'stage0' | 'stage1' | 'stage2' | 'stage3' | 'stage4'
  | 'wire' | 'predictor' | 'cache' | 'oc' | 'heatsink' | 'fanFrame' | 'blade' | 'hub' | 'crack';

type Face = {
  readonly points: readonly Vec3[];
  /** Outward normal (unit), in model space. */
  readonly normal: Vec3;
  readonly material: Material;
};

/**
 * One solid part of the model: an upright box, perhaps turned about the
 * vertical axis, with its faces, its outline seen from above, the heights of
 * its bottom and top, and any lines drawn on it (cracks on the board). No two
 * parts overlap, which is what lets them be drawn in a correct order
 * (`drawOrder`); a box's own visible faces never cover each other.
 */
export type Part = {
  readonly faces: readonly Face[];
  /** Its corners seen from above, in order around it. */
  readonly plan: readonly Plan[];
  readonly bottom: number;
  readonly top: number;
  /** Fan blades and hub turn about the vertical axis on their own. */
  readonly spins: boolean;
  readonly lines: readonly Face[];
};

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

/** A box from corner `a` to corner `b`. */
function box(a: Vec3, b: Vec3, material: Material, spins = false): Part {
  const [x0, y0, z0] = a;
  const [x1, y1, z1] = b;
  const face = (points: Vec3[], normal: Vec3): Face => ({ points, normal, material });
  return {
    faces: [
      face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0]),
      face([[x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]], [0, -1, 0]),
      face([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1]),
      face([[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]], [0, 0, 1]),
      face([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0]),
      face([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [1, 0, 0]),
    ],
    plan: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]],
    bottom: y0,
    top: y1,
    spins,
    lines: [],
  };
}

/** Turns a point seen from above by `angle` about the vertical axis (the same turn as the fan's). */
const turnPlan = ([x, z]: Plan, cos: number, sin: number): Plan => [x * cos - z * sin, x * sin + z * cos];

/** A box turned `angle` about the vertical axis through the origin (a fan blade). */
function turnedBox(a: Vec3, b: Vec3, angle: number, material: Material, spins: boolean): Part {
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const turn = ([x, y, z]: Vec3): Vec3 => {
    const [tx, tz] = turnPlan([x, z], cos, sin);
    return [tx, y, tz];
  };
  const part = box(a, b, material, spins);
  return {
    ...part,
    faces: part.faces.map((f) => ({ ...f, points: f.points.map(turn), normal: turn(f.normal) })),
    plan: part.plan.map((p) => turnPlan(p, cos, sin)),
  };
}

/** Small deterministic noise, so cracks land in the same places every time. */
const noise = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** The chip for this progress: board and pins, the die with every part owned, the cooler, and cracks. */
export function buildChip(progress: Progress): Part[] {
  const parts: Part[] = [];
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
  } else {
    const stages: Material[] = ['stage0', 'stage1', 'stage2', 'stage3', 'stage4'];
    stages.forEach((material, i) => parts.push(box([-31 + i * 13, DIE_TOP, -28], [-21 + i * 13, PART_TOP, -16], material)));
    // Forwarding: a wire from EX and MEM back to the stage before them.
    if (tier >= 3) parts.push(box([-16, DIE_TOP, -12], [24, DIE_TOP + 1.5, -9], 'wire'));
    // Branch prediction, with a bit (1-bit) or two (2-bit) of history on top.
    if (tier >= 4) {
      parts.push(box([-30, DIE_TOP, 4], [-10, PART_TOP + 1, 26], 'predictor'));
      for (let bit = 0; bit < tier - 4; bit++) parts.push(box([-27 + bit * 9, PART_TOP + 1, 10], [-20 + bit * 9, PART_TOP + 5, 18], 'predictor'));
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
  const cracks: Face[] = [];
  for (let k = 0; k < wear; k++) {
    const side = k % 4;
    const along = -50 + noise(k) * 100;
    const start: Vec3 = side === 0 ? [along, BOARD_TOP, -BOARD] : side === 1 ? [BOARD, BOARD_TOP, along] : side === 2 ? [along, BOARD_TOP, BOARD] : [-BOARD, BOARD_TOP, along];
    const points: Vec3[] = [start];
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

/** A part as drawn this frame: its outline seen from above (turned with the fan if it spins) and its heights. */
export type Shape = { readonly plan: readonly Plan[]; readonly bottom: number; readonly top: number };

/** Touching parts (a die sitting on the board) count as separated. */
const TOUCH = 1e-6;

/** The directions across an outline's edges, seen from above: where a line between two outlines can run. */
function edgeNormals(plan: readonly Plan[]): Plan[] {
  return plan.map(([x, z], i) => {
    const [nx, nz] = plan[(i + 1) % plan.length];
    const [dx, dz] = [nx - x, nz - z];
    const length = Math.hypot(dx, dz);
    return [-dz / length, dx / length];
  });
}

/** How far an outline reaches along direction (ux, uz). */
function extent(plan: readonly Plan[], ux: number, uz: number): [number, number] {
  const along = plan.map(([x, z]) => x * ux + z * uz);
  return [Math.min(...along), Math.max(...along)];
}

/**
 * Whether `a` must be drawn before `b` (it's behind it), seen from `camera`
 * (model space). Two solid boxes that don't overlap have a flat plane between
 * them, and only the one on the camera's side of it can hide the other, so
 * that one is drawn last. The planes tried are level (one part above the
 * other) and upright along their outlines' edges. When several planes
 * separate them and disagree, neither part can hide the other (one that hides
 * the other is on the camera's side of every plane between them): null, no
 * order needed. Undefined if they overlap. Exact with perspective too, which
 * sorting faces by depth wasn't: big and small faces side by side swapped
 * places as the chip turned, and parts showed through each other.
 */
export function behind(a: Shape, b: Shape, camera: Vec3): boolean | null | undefined {
  const verdicts: boolean[] = [];
  if (a.top <= b.bottom + TOUCH) verdicts.push(camera[1] > (a.top + b.bottom) / 2);
  if (b.top <= a.bottom + TOUCH) verdicts.push(camera[1] < (b.top + a.bottom) / 2);
  for (const [ux, uz] of [...edgeNormals(a.plan), ...edgeNormals(b.plan)]) {
    const [aMin, aMax] = extent(a.plan, ux, uz);
    const [bMin, bMax] = extent(b.plan, ux, uz);
    const c = camera[0] * ux + camera[2] * uz;
    if (aMax <= bMin + TOUCH) verdicts.push(c > (aMax + bMin) / 2);
    else if (bMax <= aMin + TOUCH) verdicts.push(c < (bMax + aMin) / 2);
  }
  if (verdicts.length === 0) return undefined;
  return verdicts.every((v) => v === verdicts[0]) ? verdicts[0] : null;
}

type Point = { readonly x: number; readonly y: number };

/**
 * A part's outline on screen, seen from `camera` looking at the middle of
 * the model: the hull around its 8 corners, projected with perspective
 * (the same picture as the shop's, up to its size).
 */
export function screenOutline({ plan, bottom, top }: Shape, camera: Vec3): Point[] {
  const length = Math.hypot(...camera);
  const forward: Vec3 = [-camera[0] / length, -camera[1] / length, -camera[2] / length];
  // Screen right is level (the camera never rolls); screen up completes the frame.
  const flat = Math.hypot(forward[0], forward[2]);
  const right: Vec3 = [-forward[2] / flat, 0, forward[0] / flat];
  const up: Vec3 = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  const corners = plan.flatMap(([x, z]) => [bottom, top].map((y): Point => {
    const d: Vec3 = [x - camera[0], y - camera[1], z - camera[2]];
    const depth = d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2];
    return { x: (d[0] * right[0] + d[2] * right[2]) / depth, y: (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / depth };
  }));
  return hull(corners);
}

/** The convex hull of some points, in order around it (Andrew's monotone chain). */
function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
  const cross = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const half = (list: Point[]) => {
    const chain: Point[] = [];
    for (const p of list) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) chain.pop();
      chain.push(p);
    }
    chain.pop();
    return chain;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** Whether two outlines on screen overlap (more than touching): only then can one part hide the other. */
export function overlaps(a: readonly Point[], b: readonly Point[]): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i];
      const q = polygon[(i + 1) % polygon.length];
      const [nx, ny] = [q.y - p.y, p.x - q.x];
      const along = (list: readonly Point[]) => list.map((r) => r.x * nx + r.y * ny);
      const [as, bs] = [along(a), along(b)];
      if (Math.max(...as) <= Math.min(...bs) + 1e-9 || Math.max(...bs) <= Math.min(...as) + 1e-9) return false;
    }
  }
  return true;
}

/**
 * The order to draw parts in, farthest first: every part after any part it
 * can hide. Only parts whose outlines overlap on screen can hide each other,
 * so only those are ordered (by `behind`); asking it of every pair would let
 * pairs that can't, in fact, hide each other force orders that go round in
 * circles.
 */
export function drawOrder(shapes: readonly Shape[], camera: Vec3): number[] {
  const distance = shapes.map(({ plan, bottom, top }) => {
    const [x, z] = [0, 1].map((axis) => plan.reduce((sum, p) => sum + p[axis], 0) / plan.length);
    return Math.hypot(x - camera[0], (bottom + top) / 2 - camera[1], z - camera[2]);
  });
  const outlines = shapes.map((shape) => screenOutline(shape, camera));
  // drawnFirst[j]: how many parts must be drawn before j; then: the parts to draw after i.
  const drawnFirst = shapes.map(() => 0);
  const then: number[][] = shapes.map(() => []);
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      if (!overlaps(outlines[i], outlines[j])) continue;
      const verdict = behind(shapes[i], shapes[j], camera);
      if (verdict === null) continue;
      const [first, second] = verdict ?? distance[i] > distance[j] ? [i, j] : [j, i];
      then[first].push(second);
      drawnFirst[second]++;
    }
  }
  // Draw whatever is free to go next, farthest first; a loop (which boxes that don't overlap can't make) is broken by distance.
  const order: number[] = [];
  const done = shapes.map(() => false);
  while (order.length < shapes.length) {
    let next = -1;
    for (let i = 0; i < shapes.length; i++) {
      if (!done[i] && drawnFirst[i] === 0 && (next < 0 || distance[i] > distance[next])) next = i;
    }
    if (next < 0) {
      for (let i = 0; i < shapes.length; i++) if (!done[i] && (next < 0 || distance[i] > distance[next])) next = i;
    }
    done[next] = true;
    order.push(next);
    for (const k of then[next]) drawnFirst[k]--;
  }
  return order;
}

/** The lines under the model: cooler, clock, and wear. */
export function chipInfo(progress: Progress): string[] {
  const wear = Math.round((THERMAL.maxDial - progress.chipMaxDial) / THERMAL.damagePerOverheat);
  return [
    COOLING[progress.cooling].name,
    `${formatMhz(ratedMhz(progress))}  CLK ${progress.clockLevel + 1}/${CLOCK.factors.length}`,
    ...(wear > 0 ? [`CRACKED: MAX CLOCK ${Math.round(progress.chipMaxDial * 100)}%`] : []),
  ];
}

/** Colors for the full-color eras; the parts take the era's syntax colors so they match the code on screen. */
function colorOf(material: Material, era: Era): number {
  const { syntax } = era;
  const colors: Record<Material, number> = {
    board: 0x1d5c3a, pin: 0xd8b04a, die: 0x3b4352, core: syntax.op,
    stage0: syntax.op, stage1: syntax.reg, stage2: syntax.num, stage3: syntax.label, stage4: era.accent,
    wire: era.accent, predictor: era.taken, cache: 0xb4bccb, oc: era.fire[1],
    heatsink: 0xb9c0ca, fanFrame: 0x2b2f38, blade: 0x8c95a5, hub: 0x4b515d, crack: 0x000000,
  };
  return colors[material];
}

/** How bright each material is in the green eras (0-1). */
const LUMA: Record<Material, number> = {
  board: 0.4, pin: 0.9, die: 0.3, core: 1, stage0: 1, stage1: 0.85, stage2: 1, stage3: 0.85, stage4: 1,
  wire: 1, predictor: 0.9, cache: 0.95, oc: 1, heatsink: 0.75, fanFrame: 0.45, blade: 0.8, hub: 0.55, crack: 0,
};

/** Metal shines in the smooth era. */
const SHINY: ReadonlySet<Material> = new Set<Material>(['pin', 'heatsink', 'blade', 'cache']);

/** The 16 colors of an EGA card: the 16-bit chip is drawn only in these. */
const EGA = [
  0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xaa5500, 0xaaaaaa,
  0x555555, 0x5555ff, 0x55ff55, 0x55ffff, 0xff5555, 0xff55ff, 0xffff55, 0xffffff,
];
/** The 16-bit chip's materials as EGA colors (the parts keep the era's own, which are EGA already). */
const EGA_BASE: Partial<Record<Material, number>> = {
  board: 0x00aa00, pin: 0xffff55, die: 0x555555, cache: 0xaaaaaa,
  heatsink: 0xaaaaaa, fanFrame: 0x555555, blade: 0xaaaaaa, hub: 0x555555,
};
/** The nearest of the 16 EGA colors. */
const toEga = (color: number) => {
  const rgb = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
  const [r, g, b] = rgb(color);
  return EGA.reduce((best, c) => {
    const [cr, cg, cb] = rgb(c);
    const [br, bg, bb] = rgb(best);
    return (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2 < (br - r) ** 2 + (bg - g) ** 2 + (bb - b) ** 2 ? c : best;
  });
};

const scaleColor = (color: number, k: number) => {
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((color >> shift) & 0xff) * k)));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
};
const addWhite = (color: number, amount: number) => {
  const channel = (shift: number) => Math.min(255, Math.round(((color >> shift) & 0xff) + 255 * amount));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
};

const norm = ([x, y, z]: Vec3): Vec3 => {
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
  private readonly era: Era;
  private readonly style: ChipStyle;
  private parts: Part[] = [];
  /** Draws the shapes; on the pixelated styles it's drawn into `target` at low resolution and blown up. */
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly target: Phaser.GameObjects.RenderTexture | undefined;
  /** Sprite pixels per layout pixel on the pixelated styles. */
  private readonly pixel: number;
  private spin = 0;
  private fan = 0;

  constructor(scene: Phaser.Scene, era: Era, x: number, y: number) {
    this.era = era;
    this.style = era.chip;
    this.pixel = this.style === 'flat' ? 3 : this.style === 'lowpoly' ? 2 : 1;
    if (this.pixel > 1) {
      this.graphics = scene.make.graphics({}, false);
      const target = scene.add.renderTexture(x - AREA.w / 2, y - AREA.h / 2, Math.ceil(AREA.w / this.pixel), Math.ceil(AREA.h / this.pixel));
      target.setOrigin(0).setScale(this.pixel);
      target.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.target = target;
    } else {
      this.graphics = scene.add.graphics();
    }
    this.moveTo(x, y);
  }

  /** Builds the model, centered on the middle of everything stacked up (so a cooler on top doesn't push it off-center). */
  setModel(progress: Progress): void {
    const parts = buildChip(progress);
    const middle = Math.max(...parts.map((part) => part.top)) / 2;
    const lower = (face: Face): Face => ({ ...face, points: face.points.map(([x, y, z]): Vec3 => [x, y - middle, z]) });
    this.parts = parts.map((part) => ({
      ...part,
      faces: part.faces.map(lower),
      lines: part.lines.map(lower),
      bottom: part.bottom - middle,
      top: part.top - middle,
    }));
  }

  /** Centers the model on (x, y): the shop moves it to shake it. */
  moveTo(x: number, y: number): void {
    if (this.target) this.target.setPosition(Math.round(x - AREA.w / 2), Math.round(y - AREA.h / 2));
    else this.graphics.setPosition(x, y);
  }

  /** Turns the model a little and redraws it; the fan spins faster than the chip. */
  update(deltaMs: number, coolingLevel: number): void {
    this.spin += (deltaMs / 1000) * 0.55;
    if (coolingLevel >= 2) this.fan += (deltaMs / 1000) * 7;
    this.draw();
  }

  private draw(): void {
    const g = this.graphics.clear();
    // Pixelated styles draw around the middle of their small texture; the others around the graphics' position.
    const scale = 1 / this.pixel;
    const [ox, oy] = this.target ? [AREA.w / 2 / this.pixel, AREA.h / 2 / this.pixel] : [0, 0];
    const [cosA, sinA] = [Math.cos(this.spin), Math.sin(this.spin)];
    const [cosT, sinT] = [Math.cos(TILT), Math.sin(TILT)];
    const [cosF, sinF] = [Math.cos(this.fan), Math.sin(this.fan)];
    // Model space -> camera space: the fan's own turn, the spin about the vertical axis, then the tilt.
    const toCamera = ([x, y, z]: Vec3, spins = false): Vec3 => {
      if (spins) [x, z] = [x * cosF - z * sinF, x * sinF + z * cosF];
      const [x1, z1] = [x * cosA + z * sinA, -x * sinA + z * cosA];
      return [x1, y * cosT - z1 * sinT, y * sinT + z1 * cosT];
    };
    const project = ([x, y, z]: Vec3) => {
      const k = (UNIT_PX * DISTANCE * scale) / (DISTANCE + z);
      return { x: ox + x * k, y: oy - y * k };
    };

    // The camera (at z = -DISTANCE in camera space), back in model space: undo the tilt, then the spin.
    const [camY, camZ] = [-DISTANCE * sinT, -DISTANCE * cosT];
    const camera: Vec3 = [-camZ * sinA, camY, camZ * cosA];
    const shapes = this.parts.map(({ plan, bottom, top, spins }): Shape => ({
      plan: spins ? plan.map((p) => turnPlan(p, cosF, sinF)) : plan,
      bottom,
      top,
    }));

    const { fg, bg } = this.era;
    for (const index of drawOrder(shapes, camera)) {
      const part = this.parts[index];
      for (const face of part.faces) {
        const points = face.points.map((p) => toCamera(p, part.spins));
        const normal = toCamera(face.normal, part.spins);
        const center = [0, 1, 2].map((axis) => points.reduce((sum, p) => sum + p[axis], 0) / points.length);
        // Facing away from the camera (which sits at z = -DISTANCE): hidden.
        if (normal[0] * center[0] + normal[1] * center[1] + normal[2] * (center[2] + DISTANCE) >= 0) continue;
        this.fill(g, face, points.map(project), normal);
      }
      // Lines drawn on the part (cracks on the board), after its faces and before anything that can cover them.
      for (const line of part.lines) {
        const screen = line.points.map((p) => project(toCamera(p, part.spins)));
        g.lineStyle(this.style === 'smooth' ? 1.2 : 1, this.style === 'wire' ? fg : this.style === 'smooth' ? 0x050505 : bg, 0.9).strokePoints(screen, false);
      }
    }
    if (this.target) this.target.clear().draw(g);
  }

  /** Fills one face in the era's style, shaded by how directly it faces the light. */
  private fill(g: Phaser.GameObjects.Graphics, face: Face, screen: { x: number; y: number }[], normal: Vec3): void {
    const { fg, bg } = this.era;
    const light = Math.max(0, normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2]);
    const shade = 0.35 + 0.65 * light;
    if (this.style === 'wire') {
      // Vector-display style: hidden faces cleared to black, edges in phosphor.
      g.fillStyle(bg).fillPoints(screen, true);
      g.lineStyle(1, fg, 0.35 + 0.65 * LUMA[face.material]).strokePoints(screen, true);
    } else if (this.style === 'flat') {
      // Flat-shaded polygons in the 16 EGA colors, like late-80s PC 3D.
      const level = Math.max(1, Math.round(shade * 4)) / 4;
      const base = EGA_BASE[face.material] ?? colorOf(face.material, this.era);
      g.fillStyle(toEga(scaleColor(base, level * 1.15))).fillPoints(screen, true);
    } else if (this.style === 'lowpoly') {
      const banded = Math.round(shade * 6) / 6;
      g.fillStyle(scaleColor(colorOf(face.material, this.era), banded)).fillPoints(screen, true);
    } else {
      const highlight = SHINY.has(face.material)
        ? Math.pow(Math.max(0, normal[0] * HALF[0] + normal[1] * HALF[1] + normal[2] * HALF[2]), 24) * 0.55
        : 0;
      const color = addWhite(scaleColor(colorOf(face.material, this.era), shade), highlight);
      g.fillStyle(color).fillPoints(screen, true);
      g.lineStyle(0.6, scaleColor(color, 0.55), 0.6).strokePoints(screen, true);
    }
  }
}
