import type { DiagramId } from '../data/lessons.ts';
import { assemble } from '../sim/assembler.ts';
import { tokens } from '../sim/isa.ts';
import { codeLine } from './codeLine.ts';
import { cssColor, type Era } from './terminal.ts';

type Parts = Phaser.GameObjects.GameObject[];

/** Small drawing kit for lesson diagrams, in the current era's colors. */
class Sketch {
  readonly parts: Parts = [];
  private readonly scene: Phaser.Scene;
  private readonly era: Era;
  private readonly lines: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, era: Era) {
    this.scene = scene;
    this.era = era;
    this.lines = scene.add.graphics().lineStyle(2, era.fg, 0.8);
    this.parts.push(this.lines);
  }

  /** `bright` draws a heavier outline; `fill` (default: same as bright) tints the inside. */
  box(x: number, y: number, w: number, h: number, bright = false, fill = bright): Phaser.GameObjects.Rectangle {
    const rect = this.scene.add
      .rectangle(x, y, w, h, this.era.fg, fill ? 0.15 : 0)
      .setStrokeStyle(bright ? 2 : 1, this.era.fg, bright ? 1 : 0.6);
    this.parts.push(rect);
    return rect;
  }

  /** A solid patch of background, to hide lines behind a note (as in the real game). */
  backing(x: number, y: number, w: number, h: number): void {
    this.parts.push(this.scene.add.rectangle(x, y, w, h, this.era.bg));
  }

  text(x: number, y: number, content: string, size = 16, alpha = 1, bold = false): Phaser.GameObjects.Text {
    const text = this.scene.add
      .text(x, y, content, {
        fontFamily: 'monospace',
        fontSize: `${size}px`,
        fontStyle: bold ? 'bold' : '',
        color: cssColor(this.era.fg),
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(alpha);
    this.parts.push(text);
    return text;
  }

  /** One instruction, syntax-highlighted. `source` may define its own label. */
  code(x: number, y: number, source: string, maxWidth?: number): void {
    const [instr] = assemble(source).instructions;
    this.parts.push(codeLine(this.scene, x, y, tokens(instr), this.era.syntax, { center: true, maxWidth }));
  }

  arrow(x1: number, y1: number, x2: number, y2: number): void {
    this.lines.lineBetween(x1, y1, x2, y2);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = (turn: number) =>
      this.lines.lineBetween(x2, y2, x2 - 12 * Math.cos(angle + turn), y2 - 12 * Math.sin(angle + turn));
    head(0.5);
    head(-0.5);
  }

  polyline(points: readonly [number, number][]): void {
    this.lines.strokePoints(points.map(([x, y]) => new Phaser.Math.Vector2(x, y)));
  }

  /** A light that pulses on a steady beat. */
  pulse(x: number, y: number): void {
    const light = this.box(x, y, 18, 18, true);
    this.scene.tweens.add({ targets: light, alpha: 0.2, duration: 375, yoyo: true, repeat: -1 });
  }
}

/** Draws a lesson diagram centered on (cx, cy); returns everything it created. */
export function drawDiagram(scene: Phaser.Scene, id: DiagramId, cx: number, cy: number, era: Era): Parts {
  const s = new Sketch(scene, era);
  DIAGRAMS[id](s, cx, cy);
  return s.parts;
}

const DIAGRAMS: Record<DiagramId, (s: Sketch, cx: number, cy: number) => void> = {
  // PROGRAM -> CPU -> RESULT
  cpu(s, cx, cy) {
    s.text(cx - 270, cy - 80, 'PROGRAM', 16, 0.7);
    s.box(cx - 270, cy, 220, 120);
    s.code(cx - 270, cy - 32, 'addi x1, x0, 5');
    s.code(cx - 270, cy, 'addi x2, x0, 7');
    s.code(cx - 270, cy + 32, 'add x3, x1, x2');
    s.arrow(cx - 150, cy, cx - 80, cy);
    s.box(cx, cy, 140, 100, true);
    s.text(cx, cy, 'CPU', 32, 1, true);
    s.arrow(cx + 80, cy, cx + 150, cy);
    s.text(cx + 270, cy - 80, 'RESULT', 16, 0.7);
    s.box(cx + 270, cy, 220, 120);
    s.text(cx + 270, cy, 'x3 = 12', 24, 1, true);
  },

  // A square wave with labelled cycles and a light pulsing on the beat
  clock(s, cx, cy) {
    const left = cx - 300;
    const high = cy - 30;
    const low = cy + 30;
    const points: [number, number][] = [[left, low]];
    for (let i = 0; i < 4; i++) {
      const x = left + i * 150;
      points.push([x, low], [x, high], [x + 75, high], [x + 75, low], [x + 150, low]);
      s.text(x + 75, cy + 60, `CYCLE ${i + 1}`, 14, 0.7);
    }
    s.polyline(points);
    s.pulse(cx, cy - 75);
  },

  // ALU / MEM / BRANCH boxes with example instructions and keys
  units(s, cx, cy) {
    const units = [
      { name: 'ALU', role: 'math and logic', key: 'D', code: ['add x3, x1, x2', 'addi x1, x1, 1'] },
      { name: 'MEM', role: 'memory', key: 'F', code: ['lb x4, 0(x1)', 'sb x3, 8(x0)'] },
      { name: 'BRANCH', role: 'decisions', key: 'J', code: ['loop: bne x1, x2, loop', 'done: beq x1, x0, done'] },
    ];
    units.forEach((unit, i) => {
      const x = cx + (i - 1) * 280;
      s.box(x, cy, 240, 150);
      s.text(x, cy - 50, unit.name, 24, 1, true);
      s.text(x, cy - 22, unit.role, 14, 0.7);
      s.code(x, cy + 12, unit.code[0], 220);
      s.code(x, cy + 42, unit.code[1], 220);
      s.text(x, cy + 95, `KEY [${unit.key}]`, 16, 0.8);
    });
  },

  // Registers <-> memory, with lb and sb arrows
  storage(s, cx, cy) {
    s.text(cx - 300, cy - 85, 'REGISTERS', 16, 0.7);
    for (let r = 0; r < 8; r++) {
      const x = cx - 340 + (r >= 4 ? 84 : 0);
      const y = cy - 45 + (r % 4) * 34;
      s.box(x, y, 76, 28);
      s.text(x, y, `x${r}`, 14);
    }
    s.text(cx + 250, cy - 85, 'MEMORY', 16, 0.7);
    const bytes = ['03', '05', '07', '02'];
    for (let i = 0; i < 16; i++) {
      const x = cx + 166 + (i % 4) * 56;
      const y = cy - 45 + Math.floor(i / 4) * 34;
      s.box(x, y, 50, 28);
      s.text(x, y, bytes[i] ?? '00', 14, 0.8);
    }
    s.arrow(cx + 120, cy - 20, cx - 230, cy - 20);
    s.text(cx - 55, cy - 40, 'lb = LOAD: memory -> register', 14);
    s.arrow(cx - 230, cy + 40, cx + 120, cy + 40);
    s.text(cx - 55, cy + 60, 'sb = STORE: register -> memory', 14);
  },

  // A tiny version of the play screen
  highway(s, cx, cy) {
    const laneW = 130;
    const left = cx - 1.5 * laneW;
    const hitY = cy + 50;
    for (let i = 0; i <= 3; i++) s.polyline([[left + i * laneW, cy - 100], [left + i * laneW, hitY + 10]]);
    s.polyline([[left, hitY], [left + 3 * laneW, hitY]]);
    ['ALU [D]', 'MEM [F]', 'BRANCH [J]'].forEach((label, i) => s.text(left + (i + 0.5) * laneW, hitY + 30, label, 14));
    s.box(left + 0.5 * laneW, cy - 40, laneW - 10, 26);
    s.code(left + 0.5 * laneW, cy - 40, 'add x3, x3, x4', laneW - 20);
    s.backing(left + 1.5 * laneW, hitY, laneW - 10, 26);
    s.box(left + 1.5 * laneW, hitY, laneW - 10, 26, true, false); // no fill: keeps the code readable
    s.code(left + 1.5 * laneW, hitY, 'lb x4, 0(x1)', laneW - 20);
    s.arrow(left + 3 * laneW + 120, hitY, left + 3 * laneW + 20, hitY);
    s.text(left + 3 * laneW + 120, hitY - 28, 'lb uses memory:', 14, 0.8);
    s.text(left + 3 * laneW + 120, hitY + 28, 'PRESS F NOW', 16, 1, true);
  },

  // The CPU time equation with a perfect and a stalled run
  score(s, cx, cy) {
    s.box(cx, cy - 50, 640, 50, true);
    s.text(cx, cy - 50, 'CPU TIME = INSTRUCTIONS x CPI x CLOCK PERIOD', 20, 1, true);
    s.text(cx, cy + 20, 'PERFECT RUN:  20 x 1.00 x 1 µs = 20 µs', 18);
    s.text(cx, cy + 55, '5 STALLS:     20 x 1.25 x 1 µs = 25 µs', 18, 0.7);
  },
};
