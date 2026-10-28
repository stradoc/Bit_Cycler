import { Conductor } from '../audio/conductor.ts';
import { blip } from '../audio/sfx.ts';
import { PROGRAMS } from '../data/programs.ts';
import { NORMAL_WINDOWS, RELAXED_WINDOWS } from '../rhythm/judge.ts';
import { SingleCycleRun, type NoteResult } from '../rhythm/run.ts';
import { tempoForClock } from '../rhythm/tempo.ts';
import { keyOf, onKeyDown } from '../input/keys.ts';
import { getSettings } from '../settings.ts';
import { assemble } from '../sim/assembler.ts';
import { Cpu, type Step } from '../sim/cpu.ts';
import { describe, format, tokens, UNIT_ROLES, UNITS, unitOf, type Instruction, type Program, type Unit } from '../sim/isa.ts';
import { codeLine } from '../visual/codeLine.ts';
import { cssColor, ERAS, TerminalLook } from '../visual/terminal.ts';

// Tier 1 clock. Clock-speed upgrades will raise it (and the tempo with it).
const CLOCK_MHZ = 1;
const COUNT_IN = 4;
const REGISTER_COUNT = 8;

const LANE_X0 = 24;
const LANE_W = 150;
const HIT_Y = 452;
const PX_PER_BEAT = 72;
const PANEL_X = 496;
const NOTE_W = LANE_W - 8;
const LISTING_INDENT = 30; // room for the '>' program-counter marker
const LANE_FLASH_MS = 120;
const LANE_FLASH_ALPHA = 0.35;
const LINE = 20; // panel line height

const LANE_KEYS: Record<Unit, string> = { ALU: 'D', MEM: 'F', BRANCH: 'J' };
const KEY_UNITS: Readonly<Record<string, Unit>> = { D: 'ALU', F: 'MEM', J: 'BRANCH' };
const UNIT_PITCH: Record<Unit, number> = { ALU: 660, MEM: 523, BRANCH: 784 };

type NoteView = { box: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Container };
type ListingLine = { marker: Phaser.GameObjects.Text; code: Phaser.GameObjects.Container };

const laneCenter = (unit: Unit) => LANE_X0 + LANE_W * (UNITS.indexOf(unit) + 0.5);
const hex = (value: number) => value.toString(16).toUpperCase().padStart(2, '0');

/**
 * Tier 1: a single-cycle CPU. Route each instruction to its functional unit on the beat.
 * Practice mode: notes wait at the hit line, new instructions are explained, and
 * wrong keys explain instead of stalling.
 */
export class PlayScene extends Phaser.Scene {
  private look!: TerminalLook;
  private ctx!: AudioContext;
  private conductor: Conductor | undefined;
  private run!: SingleCycleRun;
  private noteViews = new Map<number, NoteView>();
  private laneFlash = {} as Record<Unit, Phaser.GameObjects.Rectangle>;
  private laneFlashAt: Record<Unit, number> = { ALU: -Infinity, MEM: -Infinity, BRANCH: -Infinity };
  private listing: ListingLine[] = []; // indexed by pc
  private regTexts: Phaser.GameObjects.Text[] = [];
  private memTexts: Phaser.GameObjects.Text[] = [];
  private statsText!: Phaser.GameObjects.Text;
  private feedback!: Phaser.GameObjects.Text;
  private shownStalls = 0;
  private lastFrameMs = 0;
  private finished = false;
  private practice = false;
  /** Beats the chart has been held while waiting for the player (practice only). */
  private chartOffset = 0;
  private explainedOps = new Set<string>();
  private callout!: Phaser.GameObjects.Container;
  private calloutText!: Phaser.GameObjects.Text;
  /** Dev/demo: ?autoplay in the URL plays every note perfectly. */
  private readonly autoplay = new URLSearchParams(location.search).has('autoplay');

  constructor() {
    super('play');
  }

  /** scene.restart() reuses this instance, so reset per-run state here. */
  init(data?: { practice?: boolean }): void {
    this.practice = data?.practice === true;
    this.chartOffset = 0;
    this.explainedOps = new Set();
    this.conductor = undefined;
    this.noteViews = new Map();
    this.listing = [];
    this.regTexts = [];
    this.memTexts = [];
    this.shownStalls = 0;
    this.lastFrameMs = performance.now();
    this.laneFlashAt = { ALU: -Infinity, MEM: -Infinity, BRANCH: -Infinity };
    this.finished = false;
  }

  create(): void {
    const settings = getSettings();
    this.look = new TerminalLook(this, ERAS.at(settings.eraIndex) ?? ERAS[0]);
    if (!(this.sound instanceof Phaser.Sound.WebAudioSoundManager)) {
      this.text(480, 270, 'WEB AUDIO NOT AVAILABLE', 20).setOrigin(0.5);
      return;
    }
    this.ctx = this.sound.context;

    const spec = PROGRAMS[0];
    const program = assemble(spec.source, REGISTER_COUNT);
    const easy = settings.relaxed || this.practice;
    const bpm = tempoForClock(CLOCK_MHZ, easy);
    const windows = easy ? RELAXED_WINDOWS : NORMAL_WINDOWS;
    this.run = new SingleCycleRun(new Cpu(program, 8, spec.memory, REGISTER_COUNT), COUNT_IN, 60 / bpm, windows);

    this.drawHighway();
    this.drawPanel(program, spec.name);
    this.drawCallout();
    this.bindKeys();

    this.conductor = new Conductor(this.ctx, bpm);
    this.conductor.offset = settings.offset;
    this.conductor.clickVolume = 0.08;
    this.conductor.start();
    this.events.once('shutdown', () => this.conductor?.stop());
  }

  update(): void {
    this.look.update();
    const now = performance.now();
    for (const unit of UNITS) {
      const fade = 1 - (now - this.laneFlashAt[unit]) / LANE_FLASH_MS;
      this.laneFlash[unit]?.setAlpha(LANE_FLASH_ALPHA * Math.max(0, fade));
    }
    if (!this.conductor || this.finished) return;

    let beat = this.chartBeat();
    if (this.practice && !this.run.done) {
      // Hold the chart so the next note waits on the hit line for the player.
      const due = this.run.dueBeat(this.run.head);
      if (beat > due) {
        this.chartOffset += beat - due;
        beat = due;
        this.explainOnce(this.run.notes[this.run.head].instr);
      }
    }
    // Autoplay presses at the exact due beat, so it stays perfect even at a low frame rate.
    while (this.autoplay && !this.run.done && beat >= this.run.dueBeat(this.run.head)) {
      this.press(unitOf(this.run.notes[this.run.head].instr), this.run.dueBeat(this.run.head));
    }
    for (const result of this.run.update(beat)) this.show(result);

    // Ease notes back after a stall instead of jumping. Uses real elapsed time:
    // Phaser's frame delta is capped, which made notes lag on slow machines.
    const elapsed = now - this.lastFrameMs;
    this.lastFrameMs = now;
    this.shownStalls += (this.run.stalls - this.shownStalls) * Math.min(1, elapsed / 60);
    for (const [index, view] of this.noteViews) {
      const y = HIT_Y - (this.run.firstBeat + index + this.shownStalls - beat) * PX_PER_BEAT;
      view.box.setY(y);
      view.label.setY(y);
    }

    if (this.run.done) this.finish();
  }

  private text(x: number, y: number, content: string, size = 16): Phaser.GameObjects.Text {
    return this.add.text(x, y, content, {
      fontFamily: 'monospace',
      fontSize: `${size}px`,
      color: cssColor(this.look.era.fg),
    });
  }

  private drawHighway(): void {
    const { fg, dim, bg, syntax } = this.look.era;
    const lanesRight = LANE_X0 + UNITS.length * LANE_W;
    const lines = this.add.graphics().lineStyle(1, dim);
    for (let i = 0; i <= UNITS.length; i++) {
      lines.lineBetween(LANE_X0 + i * LANE_W, 0, LANE_X0 + i * LANE_W, HIT_Y + 16);
    }
    lines.lineStyle(1, fg).lineBetween(LANE_X0, HIT_Y, lanesRight, HIT_Y);

    for (const unit of UNITS) {
      this.laneFlash[unit] = this.add.rectangle(laneCenter(unit), HIT_Y, LANE_W - 4, 28, fg).setAlpha(0);
      this.text(laneCenter(unit), HIT_Y + 32, `${unit} [${LANE_KEYS[unit]}]`).setOrigin(0.5);
    }

    this.run.notes.forEach((step, index) => {
      const x = laneCenter(unitOf(step.instr));
      const box = this.add.rectangle(x, -40, NOTE_W, 24, bg).setStrokeStyle(1, fg, 0.6);
      const label = codeLine(this, x, -40, tokens(step.instr, true), syntax, { maxWidth: NOTE_W - 8, center: true });
      this.noteViews.set(index, { box, label });
    });
  }

  private drawPanel(program: Program, name: string): void {
    const { syntax } = this.look.era;
    let y = 16;
    this.text(PANEL_X, y, `PROGRAM: ${name}`);
    y += 24;
    program.instructions.forEach((instr, pc) => {
      for (const [label, target] of program.labels) {
        if (target !== pc) continue;
        this.text(PANEL_X, y, `${label}:`).setColor(cssColor(syntax.label)).setAlpha(0.8);
        y += LINE;
      }
      const marker = this.text(PANEL_X, y, '>').setVisible(false);
      const code = codeLine(this, PANEL_X + LISTING_INDENT, y, tokens(instr), syntax, { originY: 0 }).setAlpha(0.6);
      this.listing[pc] = { marker, code };
      y += LINE;
    });

    y += 12;
    this.text(PANEL_X, y, 'REGISTERS');
    y += 24;
    for (let r = 0; r < REGISTER_COUNT; r++) {
      const column = Math.floor(r / 4);
      this.regTexts.push(this.text(PANEL_X + column * 220, y + (r % 4) * LINE, '').setAlpha(0.75));
    }
    y += 4 * LINE + 12;
    this.text(PANEL_X, y, 'MEMORY');
    y += 24;
    for (let row = 0; row < 2; row++) this.memTexts.push(this.text(PANEL_X, y + row * LINE, '').setAlpha(0.75));
    y += 2 * LINE + 12;
    this.statsText = this.text(PANEL_X, y, '');
    y += 28;
    this.feedback = this.text(PANEL_X, y, this.practice ? 'PRACTICE: NOTES WAIT\nFOR YOU' : 'GET READY...', 20);
    this.text(PANEL_X, 512, '[ESC] QUIT').setAlpha(0.5);

    this.refreshPanel();
  }

  /** Presses are judged at the key event's own timestamp, not at the next frame. */
  private bindKeys(): void {
    onKeyDown(this, (event) => this.onKeyDown(event));
  }

  private onKeyDown(event: KeyboardEvent): void {
    const unit = KEY_UNITS[keyOf(event)];
    if (unit) {
      event.preventDefault();
      this.press(unit, this.chartBeat(event.timeStamp));
    } else if (event.key === 'Escape') {
      this.scene.start('title');
    } else if (event.key === 'Enter' && this.finished) {
      this.scene.restart({ practice: false });
    }
  }

  private press(unit: Unit, atBeat?: number): void {
    if (!this.conductor || this.finished) return;
    this.laneFlashAt[unit] = performance.now();
    let beat = atBeat ?? this.chartBeat();

    if (this.practice && !this.run.done) {
      // Practice grades the choice of unit, not the timing.
      const due = this.run.dueBeat(this.run.head);
      if ((beat - due) * this.run.secondsPerBeat < -this.run.windows.early) return;
      const instr = this.run.notes[this.run.head].instr;
      if (unit !== unitOf(instr)) {
        blip(this.ctx, 110, this.ctx.currentTime, 0.15, 'sawtooth', 0.08);
        this.showCallout(`NOT QUITE. ${this.hint(instr)}`);
        return;
      }
      this.callout.setVisible(false);
      beat = due;
    }

    const result = this.run.press(unit, beat);
    if (result) this.show(result);
  }

  private show(result: NoteResult): void {
    if (result.judgment === 'MISS') {
      blip(this.ctx, 110, this.ctx.currentTime, 0.15, 'sawtooth', 0.08);
      const op = result.step.instr.op;
      const reason =
        result.pressed === null ? 'MISSED'
        : result.pressed !== result.expected ? `WRONG UNIT: ${op} RUNS ON ${result.expected}`
        : 'OFF BEAT';
      this.feedback.setText(`${reason}\nSTALL: +1 CYCLE`);
      this.cameras.main.shake(80, 0.003);
      this.refreshPanel();
      return;
    }

    blip(this.ctx, UNIT_PITCH[result.expected]);
    this.feedback.setText(this.practice ? 'CORRECT' : result.judgment);
    const view = this.noteViews.get(result.index);
    view?.box.destroy();
    view?.label.destroy();
    this.noteViews.delete(result.index);
    this.refreshPanel(result.step);
  }

  /** Redraws the program counter, registers, memory and stats. `executed` highlights what changed. */
  private refreshPanel(executed?: Step): void {
    const cpu = this.run.cpu;

    this.listing.forEach(({ marker, code }, pc) => {
      const current = pc === cpu.pc;
      marker.setVisible(current);
      code.setAlpha(current ? 1 : 0.6);
    });

    cpu.regs.forEach((value, r) => {
      this.regTexts[r].setText(`x${r}`.padEnd(4) + `0x${hex(value)} ${String(value).padStart(3)}`);
    });
    this.memTexts.forEach((row, i) => {
      const bytes = Array.from(cpu.memory.subarray(i * 8, i * 8 + 8), hex);
      row.setText(`${hex(i * 8)}: ${bytes.join(' ')}`);
    });
    this.statsText.setText(
      `CYCLES ${this.run.cycles}  INSTR ${this.run.instructions}  CPI ${this.run.cpi.toFixed(2)}`,
    );

    if (executed?.wrote !== undefined) this.highlight(this.regTexts[executed.wrote]);
    if (executed?.stored !== undefined) this.highlight(this.memTexts[Math.floor(executed.stored / 8)]);
  }

  private highlight(text: Phaser.GameObjects.Text | undefined): void {
    if (!text) return;
    this.tweens.killTweensOf(text);
    text.setAlpha(1);
    this.tweens.add({ targets: text, alpha: 0.75, duration: 400 });
  }

  /** Beat of the chart (the conductor's beat minus any practice holds) at a performance.now() time. */
  private chartBeat(performanceMs = performance.now()): number {
    return (this.conductor?.beatAt(performanceMs) ?? 0) - this.chartOffset;
  }

  private hint(instr: Instruction): string {
    const unit = unitOf(instr);
    return `${format(instr)}\n${describe(instr)}\n${UNIT_ROLES[unit]} -> press ${LANE_KEYS[unit]} (${unit})`;
  }

  /** The first time each kind of instruction reaches the line in practice, explain it. */
  private explainOnce(instr: Instruction): void {
    if (this.explainedOps.has(instr.op)) return;
    this.explainedOps.add(instr.op);
    this.showCallout(`NEW INSTRUCTION: ${this.hint(instr)}`);
  }

  private drawCallout(): void {
    const { fg, bg } = this.look.era;
    const x = LANE_X0 + (UNITS.length * LANE_W) / 2;
    const box = this.add.rectangle(0, 0, UNITS.length * LANE_W - 8, 120, bg).setStrokeStyle(2, fg);
    this.calloutText = this.text(0, 0, '').setOrigin(0.5).setAlign('center').setLineSpacing(8);
    this.callout = this.add.container(x, 300, [box, this.calloutText]).setDepth(600).setVisible(false);
  }

  private showCallout(message: string): void {
    this.calloutText.setText(message);
    this.callout.setVisible(true);
  }

  private finish(): void {
    this.finished = true;
    this.conductor?.stop();

    const { instructions, cycles, cpi, stalls, counts } = this.run;
    const period = 1 / CLOCK_MHZ;
    const lines = this.practice ? [
      'PRACTICE COMPLETE',
      '',
      `YOU RAN ALL ${instructions} INSTRUCTIONS AND`,
      `STORED THE SUM (${this.run.cpu.memory[8]}) IN MEMORY.`,
      '',
      'NOW PLAY FOR REAL: NOTES WON\'T WAIT,',
      'SO HIT EACH ONE ON THE BEAT.',
      '',
      '[ENTER] PLAY    [ESC] TITLE',
    ] : [
      'PROGRAM COMPLETE',
      '',
      `INSTRUCTIONS  ${instructions}`,
      `CYCLES        ${cycles}  (${stalls} STALLS)`,
      `CPI           ${cpi.toFixed(2)}`,
      `CLOCK         ${CLOCK_MHZ} MHz = ${period.toFixed(1)} µs/CYCLE`,
      '',
      'CPU TIME = INSTR x CPI x PERIOD',
      `         = ${instructions} x ${cpi.toFixed(2)} x ${period.toFixed(1)} µs`,
      `         = ${(cycles * period).toFixed(1)} µs`,
      '',
      `PERFECT ${counts.PERFECT}   GOOD ${counts.GOOD}   MISS ${counts.MISS}`,
      '',
      '[ENTER] RETRY    [ESC] TITLE',
    ];
    const { width, height } = this.scale;
    const { fg, bg } = this.look.era;
    this.add.rectangle(width / 2, height / 2, 680, 400, bg).setStrokeStyle(1, fg).setDepth(500);
    this.text(width / 2, height / 2, lines.join('\n')).setOrigin(0.5).setDepth(501).setLineSpacing(6);
  }
}
