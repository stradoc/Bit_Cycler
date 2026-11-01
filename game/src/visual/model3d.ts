import type { Era } from '../ui/eras.ts';

// Small 3D models made of boxes, drawn the way 3D looked in each era: a green
// wireframe (8-bit), flat-shaded polygons in the 16 EGA colors (16-bit),
// low-poly color (32-bit), smooth shading (64-bit). The renderer is our own:
// rotate every corner, project it with perspective, drop faces that point
// away from the viewer, draw the parts back to front (the painter's algorithm,
// ordered part by part: `drawOrder`) and fill their faces, shaded by how
// directly each one faces the light. The models are the shop's chip
// (`chip3d.ts`) and the main menu's title (`title3d.ts`).

/** How an era draws 3D models. */
export type ModelStyle = 'wire' | 'flat' | 'lowpoly' | 'smooth';

export type Vec3 = readonly [number, number, number];
/** A point seen from above: (x, z). */
export type Plan = readonly [number, number];

export type Face<M extends string = string> = {
  readonly points: readonly Vec3[];
  /** Outward normal (unit), in model space. */
  readonly normal: Vec3;
  readonly material: M;
};

/**
 * One solid part of a model: an upright box, perhaps turned about the
 * vertical axis, with its faces, its outline seen from above, the heights of
 * its bottom and top, and any lines drawn on it (cracks on the chip's board).
 * No two parts overlap, which is what lets them be drawn in a correct order
 * (`drawOrder`); a box's own visible faces never cover each other.
 */
export type Part<M extends string = string> = {
  readonly faces: readonly Face<M>[];
  /** Its corners seen from above, in order around it. */
  readonly plan: readonly Plan[];
  readonly bottom: number;
  readonly top: number;
  /** Parts that turn about the vertical axis on their own (the chip's fan). */
  readonly spins: boolean;
  readonly lines: readonly Face<M>[];
};

/** A box from corner `a` to corner `b`. */
export function box<M extends string>(a: Vec3, b: Vec3, material: M, spins = false): Part<M> {
  const [x0, y0, z0] = a;
  const [x1, y1, z1] = b;
  const face = (points: Vec3[], normal: Vec3): Face<M> => ({ points, normal, material });
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

/** Turns a point seen from above about the vertical axis (cos and sin of the angle). */
export const turnPlan = ([x, z]: Plan, cos: number, sin: number): Plan => [x * cos - z * sin, x * sin + z * cos];

/** A box turned `angle` about the vertical axis through the origin (a fan blade). */
export function turnedBox<M extends string>(a: Vec3, b: Vec3, angle: number, material: M, spins: boolean): Part<M> {
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

/** A part as drawn this frame: its outline seen from above (turned if it spins) and its heights. */
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
 * (the same picture as the model's on screen, up to its size).
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

/** The 16 colors of an EGA card: the 16-bit era draws models only in these. */
const EGA = [
  0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xaa5500, 0xaaaaaa,
  0x555555, 0x5555ff, 0x55ff55, 0x55ffff, 0xff5555, 0xff55ff, 0xffff55, 0xffffff,
];
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

export const norm = ([x, y, z]: Vec3): Vec3 => {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
};

/** How a model's materials look: one per model (the chip's, the title's). */
export type Look<M extends string> = {
  /** Its color in the full-color eras. */
  readonly color: (material: M, era: Era) => number;
  /** How bright it is in the green eras (0-1). */
  readonly luma: Readonly<Record<M, number>>;
  /** Metal shines in the smooth era. */
  readonly shiny: ReadonlySet<M>;
  /** Its color in the 16-bit era, if not the nearest EGA color to its full color. */
  readonly ega: Readonly<Partial<Record<M, number>>>;
  /** Where the light comes from (camera space: x right, y up, negative z toward the viewer). */
  readonly light: Vec3;
};

/** Light from the upper left, toward the viewer: the chip's. */
export const UPPER_LEFT_LIGHT = norm([-0.45, 0.75, -0.5]);

/** The camera and the area a model is drawn in. */
export type ViewOptions = {
  /** The area's size (layout pixels), centered on the model's position. */
  readonly w: number;
  readonly h: number;
  /** Distance from the camera to the model's middle, and screen pixels per model unit at that distance. */
  readonly distance: number;
  readonly unitPx: number;
};

/** How the model is turned this frame (radians). */
export type Pose = {
  /** About the vertical axis. */
  readonly yaw: number;
  /** The camera's tilt: negative looks down on the model. */
  readonly tilt: number;
  /** The spinning parts' own turn. */
  readonly turn: number;
};

/** A model drawn into a scene, in its era's style. Call draw() every frame it moves. */
export class ModelView<M extends string> {
  private readonly era: Era;
  private readonly style: ModelStyle;
  private readonly look: Look<M>;
  private readonly view: ViewOptions;
  /** Halfway between the light and the view direction, for highlights. */
  private readonly half: Vec3;
  private parts: Part<M>[] = [];
  /** Draws the shapes; on the pixelated styles it's drawn into `target` at low resolution and blown up. */
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly target: Phaser.GameObjects.RenderTexture | undefined;
  /** Sprite pixels per layout pixel on the pixelated styles. */
  private readonly pixel: number;

  constructor(scene: Phaser.Scene, era: Era, x: number, y: number, look: Look<M>, view: ViewOptions) {
    this.era = era;
    this.style = era.models;
    this.look = look;
    this.view = view;
    this.half = norm([look.light[0], look.light[1], look.light[2] - 1]);
    this.pixel = this.style === 'flat' ? 3 : this.style === 'lowpoly' ? 2 : 1;
    if (this.pixel > 1) {
      this.graphics = scene.make.graphics({}, false);
      const target = scene.add.renderTexture(x - view.w / 2, y - view.h / 2, Math.ceil(view.w / this.pixel), Math.ceil(view.h / this.pixel));
      target.setOrigin(0).setScale(this.pixel);
      target.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.target = target;
    } else {
      this.graphics = scene.add.graphics();
    }
    this.moveTo(x, y);
  }

  /** The parts to draw from now on, around the model's origin. */
  setParts(parts: Part<M>[]): void {
    this.parts = parts;
  }

  /** Centers the model on (x, y). */
  moveTo(x: number, y: number): void {
    if (this.target) this.target.setPosition(Math.round(x - this.view.w / 2), Math.round(y - this.view.h / 2));
    else this.graphics.setPosition(x, y);
  }

  /** Draws the model as posed. */
  draw({ yaw, tilt, turn }: Pose): void {
    const g = this.graphics.clear();
    const { distance, unitPx } = this.view;
    // Pixelated styles draw around the middle of their small texture; the others around the graphics' position.
    const scale = 1 / this.pixel;
    const [ox, oy] = this.target ? [this.view.w / 2 / this.pixel, this.view.h / 2 / this.pixel] : [0, 0];
    const [cosA, sinA] = [Math.cos(yaw), Math.sin(yaw)];
    const [cosT, sinT] = [Math.cos(tilt), Math.sin(tilt)];
    const [cosF, sinF] = [Math.cos(turn), Math.sin(turn)];
    // Model space -> camera space: the spinning parts' own turn, the turn about the vertical axis, then the tilt.
    const toCamera = ([x, y, z]: Vec3, spins = false): Vec3 => {
      if (spins) [x, z] = [x * cosF - z * sinF, x * sinF + z * cosF];
      const [x1, z1] = [x * cosA + z * sinA, -x * sinA + z * cosA];
      return [x1, y * cosT - z1 * sinT, y * sinT + z1 * cosT];
    };
    const project = ([x, y, z]: Vec3) => {
      const k = (unitPx * distance * scale) / (distance + z);
      return { x: ox + x * k, y: oy - y * k };
    };

    // The camera (at z = -distance in camera space), back in model space: undo the tilt, then the turn.
    const [camY, camZ] = [-distance * sinT, -distance * cosT];
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
        // Facing away from the camera (which sits at z = -distance): hidden.
        if (normal[0] * center[0] + normal[1] * center[1] + normal[2] * (center[2] + distance) >= 0) continue;
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
  private fill(g: Phaser.GameObjects.Graphics, face: Face<M>, screen: { x: number; y: number }[], normal: Vec3): void {
    const { fg, bg } = this.era;
    const { look } = this;
    const light = Math.max(0, normal[0] * look.light[0] + normal[1] * look.light[1] + normal[2] * look.light[2]);
    const shade = 0.35 + 0.65 * light;
    if (this.style === 'wire') {
      // Vector-display style: hidden faces cleared to black, edges in phosphor.
      g.fillStyle(bg).fillPoints(screen, true);
      g.lineStyle(1, fg, 0.35 + 0.65 * look.luma[face.material]).strokePoints(screen, true);
    } else if (this.style === 'flat') {
      // Flat-shaded polygons in the 16 EGA colors, like late-80s PC 3D.
      const level = Math.max(1, Math.round(shade * 4)) / 4;
      const base = look.ega[face.material] ?? look.color(face.material, this.era);
      g.fillStyle(toEga(scaleColor(base, level * 1.15))).fillPoints(screen, true);
    } else if (this.style === 'lowpoly') {
      const banded = Math.round(shade * 6) / 6;
      g.fillStyle(scaleColor(look.color(face.material, this.era), banded)).fillPoints(screen, true);
    } else {
      const { half } = this;
      const highlight = look.shiny.has(face.material)
        ? Math.pow(Math.max(0, normal[0] * half[0] + normal[1] * half[1] + normal[2] * half[2]), 24) * 0.55
        : 0;
      const color = addWhite(scaleColor(look.color(face.material, this.era), shade), highlight);
      g.fillStyle(color).fillPoints(screen, true);
      g.lineStyle(0.6, scaleColor(color, 0.55), 0.6).strokePoints(screen, true);
    }
  }
}
