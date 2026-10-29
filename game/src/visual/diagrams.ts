import type { DiagramId } from '../data/lessons.ts';
import { assemble } from '../sim/assembler.ts';
import { tokens } from '../sim/isa.ts';
import { branchHint, hintColor } from './branchHint.ts';
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

  /** Text in a tier 4 hint color: the color of the key that guesses `taken`. */
  hintText(x: number, y: number, content: string, taken: boolean, size = 16): void {
    this.text(x, y, content, size, 1, true).setColor(cssColor(hintColor(this.era, taken)));
  }

  /** A branch hint (glowing ring and badge) around a w x h note at (x, y); dimmer when not `sure`. */
  hint(x: number, y: number, w: number, h: number, taken: boolean, sure = true): void {
    this.parts.push(branchHint(this.scene, w, h, taken, sure, this.era).setPosition(x, y));
  }

  /** A branch note (box, code, hint ring) as it appears in the game. */
  branchNote(x: number, y: number, source: string, taken: boolean, sure = true): void {
    this.backing(x, y, 150, 26);
    this.box(x, y, 150, 26);
    this.code(x, y, source, 140, true);
    this.hint(x, y, 150, 26, taken, sure);
  }

  /** A table of "when you see this -> the branch goes this way" rules. */
  rules(cx: number, cy: number, rows: readonly (readonly [string, string, boolean])[]): void {
    rows.forEach(([when, then, taken], i) => {
      const y = cy + (i - (rows.length - 1) / 2) * 44;
      this.text(cx - 150, y, when, 15, 0.9);
      this.arrow(cx + 40, y, cx + 80, y);
      this.hintText(cx + 200, y, then, taken, 15);
    });
  }

  /** One instruction, syntax-highlighted. `source` may define its own label. */
  code(x: number, y: number, source: string, maxWidth?: number, compact = false): void {
    let instr;
    try {
      [instr] = assemble(source).instructions;
    } catch {
      // A typo in a diagram shows as plain text instead of blanking the whole briefing.
      this.text(x, y, source, 14);
      return;
    }
    this.parts.push(codeLine(this.scene, x, y, tokens(instr, compact), this.era.syntax, { center: true, maxWidth }));
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

  /** One labelled cell of a pipeline timing chart. */
  cell(x: number, y: number, label: string, bright = false, w = 64, h = 26): void {
    this.box(x, y, w, h, bright);
    this.text(x, y, label, 13, bright ? 1 : label === 'wait' ? 0.45 : 0.85, bright);
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

  // Three loads of laundry: one at a time (9 steps) vs overlapped (5 steps)
  laundry(s, cx, cy) {
    const col = (c: number) => cx - 192 + c * 48;
    s.text(cx, cy - 92, 'ONE LOAD AT A TIME: 9 STEPS', 14, 0.7);
    ['W', 'D', 'F', 'W', 'D', 'F', 'W', 'D', 'F'].forEach((step, i) =>
      s.cell(col(i), cy - 64, `${step}${Math.floor(i / 3) + 1}`, false, 44, 24),
    );
    s.text(cx, cy - 26, 'OVERLAPPED: 5 STEPS', 14, 0.7);
    for (let load = 0; load < 3; load++) {
      ['W', 'D', 'F'].forEach((step, j) => s.cell(col(load + j), cy + 2 + load * 30, `${step}${load + 1}`, true, 44, 24));
    }
    s.text(cx + 290, cy + 32, 'W = WASH\nD = DRY\nF = FOLD', 13, 0.7);
  },

  // The five stages, left to right
  stages(s, cx, cy) {
    const stages = [
      ['IF', 'FETCH', 'get instruction'],
      ['ID', 'DECODE', 'read registers'],
      ['EX', 'EXECUTE', 'ALU math'],
      ['MEM', 'MEMORY', 'load / store'],
      ['WB', 'WRITE BACK', 'save result'],
    ];
    stages.forEach(([name, word, detail], i) => {
      const x = cx + (i - 2) * 168;
      s.box(x, cy, 146, 96);
      s.text(x, cy - 26, name, 24, 1, true);
      s.text(x, cy + 8, word, 14);
      s.text(x, cy + 30, detail, 12, 0.7);
      if (i < 4) s.arrow(x + 76, cy, x + 92, cy);
    });
  },

  // The same pair with two stalls
  stall(s, cx, cy) {
    const col = (c: number) => cx - 150 + c * 68;
    for (let c = 0; c < 8; c++) s.text(col(c), cy - 78, `C${c + 1}`, 12, 0.6);
    s.code(cx - 330, cy - 40, 'addi x1, x0, 5');
    s.code(cx - 330, cy + 4, 'add x2, x1, x1');
    ['IF', 'ID', 'EX', 'MEM', 'WB'].forEach((stage, j) => s.cell(col(j), cy - 40, stage, stage === 'WB', 62));
    ['IF', 'wait', 'wait', 'ID', 'EX', 'MEM', 'WB'].forEach((stage, j) => s.cell(col(1 + j), cy + 4, stage, j === 3, 62));
    s.text(cx, cy + 56, 'add waits 2 cycles, until x1 is written', 14);
  },

  // The tier 2 screen in miniature: the waiting note linked to the instruction below it
  pipeplay(s, cx, cy) {
    const laneW = 140;
    const left = cx - 400;
    const hitY = cy - 20;
    const rowY = (row: number) => hitY + 34 * (row + 1);
    const lane = (i: number) => left + (i + 0.5) * laneW;
    for (let i = 0; i <= 3; i++) s.polyline([[left + i * laneW, cy - 100], [left + i * laneW, rowY(2) + 17]]);
    s.polyline([[left, hitY], [left + 3 * laneW, hitY]]);
    ['ID', 'EX', 'MEM', 'WB'].forEach((stage, i) => s.text(left - 24, i === 0 ? hitY : rowY(i - 1), stage, 12, 0.7));

    s.backing(lane(1), hitY - 64, laneW - 8, 24);
    s.box(lane(1), hitY - 64, laneW - 8, 24);
    s.code(lane(1), hitY - 64, 'lb x4, 0(x1)', laneW - 16, true);

    s.backing(lane(0), hitY, laneW - 8, 24);
    s.box(lane(0), hitY, laneW - 8, 24, true, false);
    s.code(lane(0), hitY, 'add x2, x1, x1', laneW - 16, true);
    s.text(lane(0), hitY - 24, 'x1 NOT READY', 12, 1, true);

    s.backing(lane(0), rowY(0), laneW - 8, 24);
    s.box(lane(0), rowY(0), laneW - 8, 24, true, false);
    s.code(lane(0), rowY(0), 'addi x1, x0, 5', laneW - 16, true);
    s.polyline([[lane(0) + 14, hitY + 12], [lane(0) + 14, rowY(0) - 12]]);

    s.text(cx + 200, hitY - 10, 'addi is still computing x1', 15, 0.8);
    s.text(cx + 200, hitY + 24, 'PRESS SPACE', 20, 1, true);
    s.text(cx + 200, hitY + 58, 'until the link is gone', 15, 0.8);
  },

  // Higher CPI, shorter cycles, faster overall
  speedup(s, cx, cy) {
    s.box(cx, cy - 56, 640, 46, true);
    s.text(cx, cy - 56, 'CPU TIME = INSTRUCTIONS x CPI x CLOCK PERIOD', 20, 1, true);
    s.text(cx, cy + 6, 'SINGLE-CYCLE (1 MHz): 20 x 1.00 x 1.00 µs = 20.0 µs', 16, 0.7);
    s.text(cx, cy + 38, 'PIPELINED (4 MHz):    20 x 2.15 x 0.25 µs = 10.8 µs', 16);
    s.text(cx, cy + 74, '1.9x FASTER', 16, 1, true);
  },

  // An ALU result forwarded from one EXECUTE straight into the next
  forward(s, cx, cy) {
    const col = (c: number) => cx - 150 + c * 72;
    for (let c = 0; c < 6; c++) s.text(col(c), cy - 78, `C${c + 1}`, 12, 0.6);
    s.code(cx - 330, cy - 40, 'addi x1, x0, 5');
    s.code(cx - 330, cy + 4, 'add x2, x1, x1');
    ['IF', 'ID', 'EX', 'MEM', 'WB'].forEach((stage, j) => s.cell(col(j), cy - 40, stage, j === 2, 64));
    ['IF', 'ID', 'EX', 'MEM', 'WB'].forEach((stage, j) => s.cell(col(1 + j), cy + 4, stage, j === 2, 64));
    s.arrow(col(2) + 20, cy - 27, col(3) - 20, cy - 9);
    s.text(cx, cy + 56, 'x1 goes straight from EXECUTE to EXECUTE: no waiting', 14);
  },

  // A load: its value only exists after MEMORY, so one wait is still needed
  loaduse(s, cx, cy) {
    const col = (c: number) => cx - 160 + c * 68;
    for (let c = 0; c < 7; c++) s.text(col(c), cy - 78, `C${c + 1}`, 12, 0.6);
    s.code(cx - 340, cy - 40, 'lb x1, 0(x2)');
    s.code(cx - 340, cy + 4, 'add x2, x1, x1');
    ['IF', 'ID', 'EX', 'MEM', 'WB'].forEach((stage, j) => s.cell(col(j), cy - 40, stage, j === 3, 62));
    ['IF', 'ID', 'wait', 'EX', 'MEM', 'WB'].forEach((stage, j) => s.cell(col(1 + j), cy + 4, stage, j === 3, 62));
    s.arrow(col(3) + 20, cy - 27, col(4) - 20, cy - 9);
    s.text(cx, cy + 56, 'the loaded value is ready after MEMORY: one wait', 14);
  },

  // The tier 3 screen in miniature: a value jumping up the forwarding wire
  forwardplay(s, cx, cy) {
    const laneW = 130;
    const left = cx - 330;
    const hitY = cy - 40;
    const rowY = (row: number) => hitY + 44 * (row + 1);
    const lane = (i: number) => left + (i + 0.5) * laneW;
    for (let i = 0; i <= 3; i++) s.polyline([[left + i * laneW, cy - 100], [left + i * laneW, rowY(2) + 20]]);
    s.polyline([[left, hitY], [left + 3 * laneW, hitY]]);
    ['DECODE', 'EXECUTE', 'MEMORY', 'WRITE BACK'].forEach((stage, i) => s.text(left - 46, i === 0 ? hitY : rowY(i - 1), stage, 11, 0.7));

    const noteW = laneW - 30;
    s.backing(lane(0) - 8, hitY, noteW, 24);
    s.box(lane(0) - 8, hitY, noteW, 24, true, false);
    s.code(lane(0) - 8, hitY, 'add x2, x1, x1', noteW - 8, true);
    s.backing(lane(0) - 8, rowY(0), noteW, 24);
    s.box(lane(0) - 8, rowY(0), noteW, 24, false, false);
    s.code(lane(0) - 8, rowY(0), 'addi x1, x0, 5', noteW - 8, true);

    // The forwarding wire: out of EXECUTE, up the side, into the waiting note
    const edge = lane(0) - 8 + noteW / 2;
    s.polyline([[edge, rowY(0)], [edge + 18, rowY(0)], [edge + 18, hitY]]);
    s.arrow(edge + 18, hitY, edge + 2, hitY);
    s.text(edge + 46, (hitY + rowY(0)) / 2, 'x1=5', 13, 1, true);

    s.text(cx + 250, hitY - 10, 'x1 is forwarded from EXECUTE:', 15, 0.8);
    s.text(cx + 250, hitY + 24, 'ROUTE IT (D)', 20, 1, true);
    s.text(cx + 250, hitY + 58, 'no stall needed', 15, 0.8);
  },

  // Same clock, fewer stalls
  speedup3(s, cx, cy) {
    s.box(cx, cy - 56, 640, 46, true);
    s.text(cx, cy - 56, 'CPU TIME = INSTRUCTIONS x CPI x CLOCK PERIOD', 20, 1, true);
    s.text(cx, cy + 6, 'NO FORWARDING (TIER 2): 20 x 2.15 x 0.25 µs = 10.8 µs', 16, 0.7);
    s.text(cx, cy + 38, 'WITH FORWARDING:        20 x 1.75 x 0.25 µs =  8.8 µs', 16);
    s.text(cx, cy + 74, '1.2x FASTER, SAME CLOCK', 16, 1, true);
  },

  // A branch with two possible next instructions
  fork(s, cx, cy) {
    s.backing(cx - 150, cy, 200, 30);
    s.box(cx - 150, cy, 200, 30, true, false);
    s.code(cx - 150, cy, 'loop: bne x1, x2, loop', 184);
    s.arrow(cx - 40, cy - 8, cx + 90, cy - 60);
    s.arrow(cx - 40, cy + 8, cx + 90, cy + 60);
    s.box(cx + 200, cy - 60, 200, 30);
    s.code(cx + 200, cy - 60, 'lb x4, 0(x1)', 184);
    s.text(cx + 200, cy - 90, 'TAKEN: jump back to loop:', 13, 0.8);
    s.box(cx + 200, cy + 60, 200, 30);
    s.code(cx + 200, cy + 60, 'sb x3, 8(x0)', 184);
    s.text(cx + 200, cy + 90, 'NOT TAKEN: carry on', 13, 0.8);
    s.text(cx - 150, cy + 40, 'which one to fetch next?', 13, 0.8);
  },

  // A wrong guess: the fetched instruction is thrown away, costing a cycle
  guess(s, cx, cy) {
    const col = (c: number) => cx - 140 + c * 68;
    for (let c = 0; c < 7; c++) s.text(col(c), cy - 92, `C${c + 1}`, 12, 0.6);
    s.code(cx - 330, cy - 56, 'loop: bne x1, x2, loop');
    s.text(cx - 330, cy - 14, 'sb: wrong guess', 13, 0.8);
    s.text(cx - 330, cy + 28, 'lb: right path', 13, 0.8);
    ['IF', 'ID', 'EX', 'MEM', 'WB'].forEach((stage, j) => s.cell(col(j), cy - 56, stage, j === 1, 62));
    s.cell(col(1), cy - 14, 'IF', false, 62);
    s.text(col(1), cy - 14, '----', 14, 1, true);
    ['IF', 'ID', 'EX', 'MEM', 'WB'].forEach((stage, j) => s.cell(col(2 + j), cy + 28, stage, false, 62));
    s.text(cx, cy + 72, 'decided in C2: sb was the wrong guess, flushed; lb starts a cycle late', 13);
  },

  // The tier 4 screen in miniature: a branch on the line asking for a guess
  guessplay(s, cx, cy) {
    const laneW = 130;
    const left = cx - 330;
    const hitY = cy;
    const lane = (i: number) => left + (i + 0.5) * laneW;
    for (let i = 0; i <= 3; i++) s.polyline([[left + i * laneW, cy - 100], [left + i * laneW, hitY + 40]]);
    s.polyline([[left, hitY], [left + 3 * laneW, hitY]]);
    ['ALU', 'MEM', 'BRANCH J/K'].forEach((label, i) => s.text(lane(i), hitY + 58, label, 12, 0.8));
    s.backing(lane(2), hitY, laneW - 10, 24);
    s.box(lane(2), hitY, laneW - 10, 24, true, false);
    s.code(lane(2), hitY, 'loop: bne x1, x2, loop', laneW - 18, true);
    s.hint(lane(2), hitY, laneW - 10, 24, true);
    s.hintText(lane(2) - 34, hitY - 32, 'J: NOT', false, 12);
    s.hintText(lane(2) + 30, hitY - 32, 'K: TAKEN', true, 12);
    s.text(cx + 250, hitY - 40, 'its glow = what it did last time', 14, 0.8);
    s.hintText(cx + 250, hitY - 4, 'J = NOT TAKEN', false, 20);
    s.hintText(cx + 250, hitY + 28, 'K = TAKEN', true, 20);
  },

  // Tier 4: reading a branch instruction
  branchread(s, cx, cy) {
    s.box(cx, cy - 64, 260, 40, true, false);
    s.code(cx, cy - 64, 'loop: bne x1, x2, loop');
    s.arrow(cx - 150, cy - 10, cx - 66, cy - 50);
    s.text(cx - 210, cy, 'Branch if Not Equal', 13, 0.8);
    s.arrow(cx, cy - 10, cx - 4, cy - 46);
    s.text(cx, cy, 'compare x1 with x2', 13, 0.8);
    s.arrow(cx + 150, cy - 10, cx + 60, cy - 50);
    s.text(cx + 210, cy, 'where to jump', 13, 0.8);
    s.hintText(cx - 160, cy + 56, 'DIFFERENT: jump to loop:', true, 16);
    s.text(cx - 160, cy + 80, 'TAKEN', 13, 0.7);
    s.hintText(cx + 160, cy + 56, 'EQUAL: next line', false, 16);
    s.text(cx + 160, cy + 80, 'NOT TAKEN', 13, 0.7);
  },

  // Tier 4: SUM ARRAY's loop, pass by pass, until x1 reaches x2
  loopend(s, cx, cy) {
    const col = (i: number) => cx - 60 + i * 100;
    const rowY = [cy - 70, cy - 30, cy + 4, cy + 44];
    ['PASS', 'x1 (after +1)', 'x2', 'bne x1, x2, loop'].forEach((label, r) => s.text(cx - 250, rowY[r], label, 14, 0.8));
    for (let i = 0; i < 4; i++) {
      const last = i === 3;
      s.text(col(i), rowY[0], String(i + 1), 14, 0.8, true);
      s.text(col(i), rowY[1], String(i + 1), 18);
      s.text(col(i), rowY[2], '4', 18, 0.7);
      s.hintText(col(i), rowY[3], last ? 'NOT TAKEN' : 'TAKEN', !last, 15);
    }
    s.box(col(3), cy - 13, 96, 140, true, false);
    s.text(col(3), cy + 78, 'LAST PASS: x1 = x2', 13, 1, true);
  },

  // Tier 4: two clues for a guess: the glow (the past) and the registers (what is coming)
  howguess(s, cx, cy) {
    s.branchNote(cx - 200, cy - 30, 'loop: bne x1, x2, loop', true);
    s.text(cx - 200, cy + 14, 'glow: TAKEN last time', 13, 0.8);
    s.text(cx - 200, cy + 36, '(right on every pass but the last)', 12, 0.6);
    s.box(cx + 170, cy - 30, 250, 64);
    s.text(cx + 170, cy - 72, 'REGISTERS', 13, 0.7);
    s.text(cx + 170, cy - 44, 'x1  0x03   3 <-MEM', 15);
    s.text(cx + 170, cy - 16, 'x2  0x04   4      ', 15, 0.8);
    s.text(cx + 170, cy + 20, 'x1 is being +1\'d: 3 + 1 = 4 = x2', 13, 0.9);
    s.hintText(cx + 170, cy + 46, 'LAST PASS: NOT TAKEN', false, 15);
  },

  // Tier 5: fetch reads a table holding each branch's last outcome
  table1(s, cx, cy) {
    s.backing(cx - 220, cy, 150, 26);
    s.box(cx - 220, cy, 150, 26);
    s.code(cx - 220, cy, 'col: bne x1, x2, col', 140, true);
    s.hint(cx - 220, cy, 150, 26, true);
    s.text(cx - 220, cy + 44, 'glow = its guess', 13, 0.8);
    s.arrow(cx + 2, cy, cx - 130, cy);
    s.box(cx + 170, cy, 320, 120);
    s.text(cx + 170, cy - 44, 'PREDICTOR: 1 BIT PER BRANCH', 13, 0.8, true);
    s.text(cx + 120, cy - 10, 'bne ... col', 15, 0.9);
    s.hintText(cx + 260, cy - 10, 'TAKEN', true, 15);
    s.text(cx + 120, cy + 22, 'bne ... row', 15, 0.9);
    s.hintText(cx + 260, cy + 22, 'NOT', false, 15);
    s.text(cx, cy + 82, 'read at FETCH, so the guess is ready before the branch is decided', 13, 0.8);
  },

  // Tier 5: the predictor's guess glows; the player follows it or overrides it
  override(s, cx, cy) {
    s.backing(cx - 200, cy, 150, 26);
    s.box(cx - 200, cy, 150, 26);
    s.code(cx - 200, cy, 'col: bne x1, x2, col', 140, true);
    s.hint(cx - 200, cy, 150, 26, true);
    s.hintText(cx - 236, cy - 34, 'J: NOT', false, 12);
    s.hintText(cx - 168, cy - 34, 'K: TAKEN', true, 12);
    s.text(cx + 170, cy - 46, 'it guesses TAKEN:', 15, 0.8);
    s.hintText(cx + 170, cy - 12, 'K = FOLLOW', true, 20);
    s.hintText(cx + 170, cy + 22, 'J = OVERRIDE', false, 20);
    s.text(cx, cy + 74, 'right override: BEAT THE PREDICTOR    wrong override: flushed, 1 cycle', 13, 0.8);
  },

  // Tier 5: SUM GRID's two loops over the grid in memory
  grid(s, cx, cy) {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 2, 4, 6];
    const x = (c: number) => cx - 250 + c * 52;
    const y = (r: number) => cy - 62 + r * 36;
    values.forEach((value, i) => {
      const [r, c] = [Math.floor(i / 3), i % 3];
      s.box(x(c), y(r), 44, 28, r === 0, false);
      s.text(x(c), y(r), String(value), 16);
    });
    s.arrow(x(0) - 22, y(0) - 26, x(2) + 22, y(0) - 26);
    s.arrow(x(2) + 40, y(0), x(2) + 40, y(3));
    s.text(cx + 120, cy - 60, 'col loop: across a row', 15);
    s.text(cx + 120, cy - 38, 'bne x1, x2, col   (x2 = end of row)', 13, 0.8);
    s.text(cx + 120, cy + 6, 'row loop: down to the next row', 15);
    s.text(cx + 120, cy + 28, 'bne x1, x6, row   (x6 = 12, end of grid)', 13, 0.8);
    s.text(cx + 120, cy + 70, 'x1 = the address of the next number', 13, 0.7);
  },

  misses1(s, cx, cy) {
    predictorTrace(s, cx, cy, '1-bit');
  },

  // Tier 6: the 2-bit counter's four states
  counter2(s, cx, cy) {
    const states = ['STRONG\nNOT', 'WEAK\nNOT', 'WEAK\nTAKEN', 'STRONG\nTAKEN'];
    const x = (i: number) => cx + (i - 1.5) * 170;
    states.forEach((label, i) => {
      s.box(x(i), cy, 116, 56, i === 1, false);
      s.hintText(x(i), cy, label, i >= 2, 15);
      s.text(x(i), cy + 40, i === 1 ? '1 (START)' : String(i), 12, 0.6);
    });
    for (let i = 0; i < 3; i++) {
      s.arrow(x(i) + 62, cy - 16, x(i + 1) - 62, cy - 16);
      s.arrow(x(i + 1) - 62, cy + 16, x(i) + 62, cy + 16);
    }
    s.hintText(cx, cy - 62, 'TAKEN: one step right', true, 15);
    s.hintText(cx, cy + 66, 'NOT TAKEN: one step left', false, 15);
  },

  // Tier 5: reading the registers to know when the predictor is wrong
  when1(s, cx, cy) {
    whenRules(s, cx, cy);
    s.text(cx, cy + 92, 'col: the 1-bit predictor is wrong at every row end, and again at every row start', 13, 0.8);
  },

  misses2(s, cx, cy) {
    predictorTrace(s, cx, cy, '2-bit');
  },

  // Tier 6: a sure guess glows bright, an unsure one dim
  weak2(s, cx, cy) {
    s.branchNote(cx - 170, cy - 20, 'col: bne x1, x2, col', true, true);
    s.text(cx - 170, cy + 24, 'SURE: counter 3 (T)', 15);
    s.text(cx - 170, cy + 48, 'it has been right lately', 12, 0.7);
    s.branchNote(cx + 170, cy - 20, 'col: bne x1, x2, col', true, false);
    s.text(cx + 170, cy + 24, 'UNSURE: counter 2 (t)', 15);
    s.text(cx + 170, cy + 48, 'e.g. it just missed a row end', 12, 0.7);
  },

  // Tier 6: the one place the 2-bit predictor still misses
  when2(s, cx, cy) {
    whenRules(s, cx, cy);
    s.text(cx, cy + 92, 'col: the 2-bit predictor is wrong at every row end (and once while it warms up)', 13, 0.8);
  },

  // Tier 6: branch misses on SUM GRID for each way of guessing
  score2(s, cx, cy) {
    const rows: [string, number][] = [
      ['ALWAYS NOT TAKEN', 11],
      ['1-BIT PREDICTOR', 10],
      ['2-BIT PREDICTOR', 7],
      ['YOU, OVERRIDING EVERY ROW END', 0],
    ];
    s.text(cx, cy - 74, 'SUM GRID: 16 BRANCHES. EACH MISS COSTS 1 CYCLE.', 15, 0.8, true);
    rows.forEach(([label, misses], i) => {
      const y = cy - 34 + i * 34;
      s.text(cx - 180, y, label, 15, 0.9);
      if (misses > 0) s.box(cx + 30 + misses * 11, y, misses * 22, 18, i === 3);
      s.text(cx + 30 + misses * 22 + 52, y, `${misses} MISSES`, 14, 0.9);
    });
  },

  // Perfect guesses vs always guessing not taken
  speedup4(s, cx, cy) {
    s.box(cx, cy - 56, 640, 46, true);
    s.text(cx, cy - 56, 'CPU TIME = INSTRUCTIONS x CPI x CLOCK PERIOD', 20, 1, true);
    s.text(cx, cy + 6, 'ALWAYS NOT TAKEN (TIER 3): 20 x 1.75 x 0.25 µs = 8.8 µs', 16, 0.7);
    s.text(cx, cy + 38, 'EVERY GUESS RIGHT:         20 x 1.60 x 0.25 µs = 8.0 µs', 16);
    s.text(cx, cy + 74, '3 LOOP BRANCHES GUESSED RIGHT = 3 CYCLES SAVED', 16, 1, true);
  },
};

/**
 * The inner branch of SUM GRID over its first two rows: what it did, what the
 * predictor guessed, and where it missed. Runs the predictor's counter, so the
 * chart can't disagree with the game.
 */
function predictorTrace(s: Sketch, cx: number, cy: number, predictor: '1-bit' | '2-bit'): void {
  const outcomes = [true, true, false, true, true, false];
  const max = predictor === '1-bit' ? 1 : 3;
  let state = predictor === '1-bit' ? 0 : 1;
  const col = (i: number) => cx - 110 + i * 64 + (i >= 3 ? 24 : 0);
  const rowY = { title: cy - 82, actual: cy - 42, guess: cy - 4, state: cy + 30, miss: cy + 64 };
  s.text(cx - 270, rowY.actual, 'IT DID', 14, 0.8);
  s.text(cx - 270, rowY.guess, `${predictor.toUpperCase()} GUESSED`, 14, 0.8);
  if (predictor === '2-bit') s.text(cx - 270, rowY.state, 'COUNTER', 14, 0.6);
  s.text(cx - 270, rowY.miss, 'MISS?', 14, 0.8);
  s.text((col(0) + col(2)) / 2, rowY.title, 'ROW 1', 14, 0.8, true);
  s.text((col(3) + col(5)) / 2, rowY.title, 'ROW 2', 14, 0.8, true);
  s.polyline([[col(2) + 44, rowY.actual - 22], [col(2) + 44, rowY.miss + 20]]);
  outcomes.forEach((taken, i) => {
    const guess = predictor === '1-bit' ? state === 1 : state >= 2;
    s.hintText(col(i), rowY.actual, taken ? 'T' : 'N', taken, 18);
    s.hintText(col(i), rowY.guess, guess ? 'T' : 'N', guess, 18);
    if (predictor === '2-bit') s.text(col(i), rowY.state, String(state), 14, 0.6);
    if (guess !== taken) s.text(col(i), rowY.miss, 'X', 20, 1, true);
    state = Math.max(0, Math.min(max, state + (taken ? 1 : -1)));
  });
}

/** How to work out SUM GRID's branches from the registers (lessons 5 and 6). */
function whenRules(s: Sketch, cx: number, cy: number): void {
  s.rules(cx, cy - 12, [
    ['x1 two or more below x2', 'col: TAKEN', true],
    ['x1 one below x2 (+1 on the way)', 'col: NOT TAKEN', false],
    ['x2 below 12 (not the last row)', 'row: TAKEN', true],
    ['x2 is 12 (the last row)', 'row: NOT TAKEN', false],
  ]);
}
