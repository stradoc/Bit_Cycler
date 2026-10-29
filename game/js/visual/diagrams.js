import { assemble } from '../sim/assembler.js';
import { tokens } from '../sim/isa.js';
import { codeLine } from './codeLine.js';
import { cssColor } from './terminal.js';
/** Small drawing kit for lesson diagrams, in the current era's colors. */
class Sketch {
    parts = [];
    scene;
    era;
    lines;
    constructor(scene, era) {
        this.scene = scene;
        this.era = era;
        this.lines = scene.add.graphics().lineStyle(2, era.fg, 0.8);
        this.parts.push(this.lines);
    }
    /** `bright` draws a heavier outline; `fill` (default: same as bright) tints the inside. */
    box(x, y, w, h, bright = false, fill = bright) {
        const rect = this.scene.add
            .rectangle(x, y, w, h, this.era.fg, fill ? 0.15 : 0)
            .setStrokeStyle(bright ? 2 : 1, this.era.fg, bright ? 1 : 0.6);
        this.parts.push(rect);
        return rect;
    }
    /** A solid patch of background, to hide lines behind a note (as in the real game). */
    backing(x, y, w, h) {
        this.parts.push(this.scene.add.rectangle(x, y, w, h, this.era.bg));
    }
    text(x, y, content, size = 16, alpha = 1, bold = false) {
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
    code(x, y, source, maxWidth, compact = false) {
        const [instr] = assemble(source).instructions;
        this.parts.push(codeLine(this.scene, x, y, tokens(instr, compact), this.era.syntax, { center: true, maxWidth }));
    }
    arrow(x1, y1, x2, y2) {
        this.lines.lineBetween(x1, y1, x2, y2);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = (turn) => this.lines.lineBetween(x2, y2, x2 - 12 * Math.cos(angle + turn), y2 - 12 * Math.sin(angle + turn));
        head(0.5);
        head(-0.5);
    }
    polyline(points) {
        this.lines.strokePoints(points.map(([x, y]) => new Phaser.Math.Vector2(x, y)));
    }
    /** One labelled cell of a pipeline timing chart. */
    cell(x, y, label, bright = false, w = 64, h = 26) {
        this.box(x, y, w, h, bright);
        this.text(x, y, label, 13, bright ? 1 : label === 'wait' ? 0.45 : 0.85, bright);
    }
    /** A light that pulses on a steady beat. */
    pulse(x, y) {
        const light = this.box(x, y, 18, 18, true);
        this.scene.tweens.add({ targets: light, alpha: 0.2, duration: 375, yoyo: true, repeat: -1 });
    }
}
/** Draws a lesson diagram centered on (cx, cy); returns everything it created. */
export function drawDiagram(scene, id, cx, cy, era) {
    const s = new Sketch(scene, era);
    DIAGRAMS[id](s, cx, cy);
    return s.parts;
}
const DIAGRAMS = {
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
        const points = [[left, low]];
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
        for (let i = 0; i <= 3; i++)
            s.polyline([[left + i * laneW, cy - 100], [left + i * laneW, hitY + 10]]);
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
        const col = (c) => cx - 192 + c * 48;
        s.text(cx, cy - 92, 'ONE LOAD AT A TIME: 9 STEPS', 14, 0.7);
        ['W', 'D', 'F', 'W', 'D', 'F', 'W', 'D', 'F'].forEach((step, i) => s.cell(col(i), cy - 64, `${step}${Math.floor(i / 3) + 1}`, false, 44, 24));
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
            if (i < 4)
                s.arrow(x + 76, cy, x + 92, cy);
        });
    },
    // The same pair with two stalls
    stall(s, cx, cy) {
        const col = (c) => cx - 150 + c * 68;
        for (let c = 0; c < 8; c++)
            s.text(col(c), cy - 78, `C${c + 1}`, 12, 0.6);
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
        const rowY = (row) => hitY + 34 * (row + 1);
        const lane = (i) => left + (i + 0.5) * laneW;
        for (let i = 0; i <= 3; i++)
            s.polyline([[left + i * laneW, cy - 100], [left + i * laneW, rowY(2) + 17]]);
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
        const col = (c) => cx - 150 + c * 72;
        for (let c = 0; c < 6; c++)
            s.text(col(c), cy - 78, `C${c + 1}`, 12, 0.6);
        s.code(cx - 330, cy - 40, 'addi x1, x0, 5');
        s.code(cx - 330, cy + 4, 'add x2, x1, x1');
        ['IF', 'ID', 'EX', 'MEM', 'WB'].forEach((stage, j) => s.cell(col(j), cy - 40, stage, j === 2, 64));
        ['IF', 'ID', 'EX', 'MEM', 'WB'].forEach((stage, j) => s.cell(col(1 + j), cy + 4, stage, j === 2, 64));
        s.arrow(col(2) + 20, cy - 27, col(3) - 20, cy - 9);
        s.text(cx, cy + 56, 'x1 goes straight from EXECUTE to EXECUTE: no waiting', 14);
    },
    // A load: its value only exists after MEMORY, so one wait is still needed
    loaduse(s, cx, cy) {
        const col = (c) => cx - 160 + c * 68;
        for (let c = 0; c < 7; c++)
            s.text(col(c), cy - 78, `C${c + 1}`, 12, 0.6);
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
        const rowY = (row) => hitY + 44 * (row + 1);
        const lane = (i) => left + (i + 0.5) * laneW;
        for (let i = 0; i <= 3; i++)
            s.polyline([[left + i * laneW, cy - 100], [left + i * laneW, rowY(2) + 20]]);
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
};
//# sourceMappingURL=diagrams.js.map