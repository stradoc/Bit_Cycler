import { Conductor } from '../audio/conductor.ts';
import { LayeredMusic } from '../audio/music.ts';
import { blip } from '../audio/sfx.ts';
import { PROGRAMS } from '../data/programs.ts';
import { keyOf, onKeyDown } from '../input/keys.ts';
import { NORMAL_WINDOWS, RELAXED_WINDOWS } from '../rhythm/judge.ts';
import { evaluate, PipelineRun, type Action, type CycleReport, type Decision } from '../rhythm/pipelineRun.ts';
import { tempoForClock } from '../rhythm/tempo.ts';
import { getSettings } from '../settings.ts';
import { assemble } from '../sim/assembler.ts';
import { Cpu } from '../sim/cpu.ts';
import { describe, destReg, tokens, UNIT_ROLES, UNITS, unitOf, type Unit } from '../sim/isa.ts';
import { STAGES, type Hazard, type Slot } from '../sim/pipeline.ts';
import { codeLine } from '../visual/codeLine.ts';
import { cssColor, ERAS, TerminalLook } from '../visual/terminal.ts';

// Pipelining shortens each stage, so the clock can run 4x faster than tier 1's.
const CLOCK_MHZ = 4;
const SINGLE_CYCLE_MHZ = 1;
/** Cycle c happens on beat FIRST_BEAT + c, so the first decision lands on beat 4. */
const FIRST_BEAT = 2;
const REGISTER_COUNT = 8;
const LOOKAHEAD = 7;

const LANE_X0 = 24;
const LANE_W = 150;
const LANES_W = UNITS.length * LANE_W;
const HIT_Y = 452;
const PX_PER_BEAT = 72;
const NOTE_W = LANE_W - 8;
const PANEL_X = 496;
const STAGE_W = 86;
const STAGE_GAP = 6;
const LINE = 20;
const FLASH_MS = 120;

const LANE_KEYS: Record<Unit, string> = { ALU: 'D', MEM: 'F', BRANCH: 'J' };
const KEY_UNITS: Readonly<Record<string, Unit>> = { D: 'ALU', F: 'MEM', J: 'BRANCH' };
const UNIT_PITCH: Record<Unit, number> = { ALU: 660, MEM: 523, BRANCH: 784 };

type NoteView = {
  box: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Container;
  /** Beat this note is drawn as due; eases toward `target` when the schedule shifts. */
  due: number;
  target: number;
  /** In ID and already on the hit line: it stays pinned there until it leaves. */
  pinned: boolean;
};

type StageView = { box: Phaser.GameObjects.Rectangle; op: Phaser.GameObjects.Text; dest: Phaser.GameObjects.Text };

const noteKey = (slot: Slot) => `${slot.seq}:${slot.pc}`;
const laneCenter = (unit: Unit) => LANE_X0 + LANE_W * (UNITS.indexOf(unit) + 0.5);
const hex = (value: number) => value.toString(16).toUpperCase().padStart(2, '0');

/**
 * Tier 2: a 5-stage pipeline. Each beat, route the instruction in ID to its
 * unit, or stall (Space) if it reads a register still being computed.
 */
export class PipelineScene extends Phaser.Scene {
  private look!: TerminalLook;
  private ctx!: AudioContext;
  private conductor: Conductor | undefined;
  private run!: PipelineRun;
  private notes = new Map<string, NoteView>();
  private stageViews = {} as Record<(typeof STAGES)[number], StageView>;
  private laneFlash = {} as Record<Unit | 'STALL', Phaser.GameObjects.Rectangle>;
  private flashAt: Record<Unit | 'STALL', number> = { ALU: -Infinity, MEM: -Infinity, BRANCH: -Infinity, STALL: -Infinity };
  private regTexts: Phaser.GameObjects.Text[] = [];
  private throughputText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private feedback!: Phaser.GameObjects.Text;
  private callout!: Phaser.GameObjects.Container;
  private calloutText!: Phaser.GameObjects.Text;
  private lastFrameMs = 0;
  private finished = false;
  private practice = false;
  private chartOffset = 0;
  private explained = new Set<string>();
  private readonly autoplay = new URLSearchParams(location.search).has('autoplay');

  constructor() {
    super('pipeline');
  }

  init(data?: { practice?: boolean }): void {
    // ?practice in the URL starts in practice mode (dev shortcut).
    this.practice = data?.practice ?? new URLSearchParams(location.search).has('practice');
    this.conductor = undefined;
    this.notes = new Map();
    this.regTexts = [];
    this.flashAt = { ALU: -Infinity, MEM: -Infinity, BRANCH: -Infinity, STALL: -Infinity };
    this.lastFrameMs = performance.now();
    this.finished = false;
    this.chartOffset = 0;
    this.explained = new Set();
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
    const easy = settings.relaxed || this.practice;
    const bpm = tempoForClock(CLOCK_MHZ, easy);
    const cpu = new Cpu(assemble(spec.source, REGISTER_COUNT), 8, spec.memory, REGISTER_COUNT);
    this.run = new PipelineRun(cpu, false, FIRST_BEAT, 60 / bpm, easy ? RELAXED_WINDOWS : NORMAL_WINDOWS);

    this.drawHighway();
    this.drawPanel(spec.name);
    this.drawCallout();
    onKeyDown(this, (event) => this.onKey(event));

    const music = new LayeredMusic(this.ctx);
    this.conductor = new Conductor(this.ctx, bpm);
    this.conductor.offset = settings.offset;
    this.conductor.clickVolume = 0.04;
    this.conductor.onBeat = (beat, time) => {
      if (beat > FIRST_BEAT && !this.finished) {
        music.playBeat(beat - FIRST_BEAT - 1, time, 60 / bpm, this.run.pipeline.occupancy);
      }
    };
    this.conductor.start();
    this.events.once('shutdown', () => this.conductor?.stop());
    this.refreshPanel();
  }

  update(): void {
    this.look.update();
    const now = performance.now();
    const elapsed = now - this.lastFrameMs;
    this.lastFrameMs = now;
    for (const key of [...UNITS, 'STALL'] as const) {
      const fade = 1 - (now - this.flashAt[key]) / FLASH_MS;
      this.laneFlash[key]?.setAlpha(0.35 * Math.max(0, fade));
    }
    if (!this.conductor || this.finished) return;

    let beat = this.chartBeat();
    if (this.practice) beat = this.holdForPlayer(beat);
    if (this.autoplay) {
      // One cycle at a time, so autoplay stays perfect even when a frame spans several beats.
      while (!this.run.done && beat >= this.run.dueBeat) {
        if (this.run.pipeline.stages.ID && !this.run.decided) this.act(this.bestAction(), this.run.dueBeat);
        const reports = this.run.update(Math.min(beat, this.run.dueBeat + 0.5));
        for (const report of reports) this.onCycle(report);
        if (reports.length === 0) break;
      }
    }
    this.advanceTo(beat);
    this.syncNotes(beat, elapsed);
    if (this.run.done) this.finish();
  }

  // ---- input ----

  private onKey(event: KeyboardEvent): void {
    const key = keyOf(event);
    const unit = KEY_UNITS[key];
    if (unit || key === ' ') {
      event.preventDefault();
      const action: Action = unit ? { kind: 'route', unit } : { kind: 'stall' };
      this.act(action, this.chartBeat(event.timeStamp));
    } else if (key === 'Escape' || key === 'Q') {
      this.scene.start('title');
    } else if (key === 'Enter' && this.finished) {
      this.scene.restart({ practice: false });
    }
  }

  private act(action: Action, beat: number): void {
    if (!this.conductor || this.finished) return;
    this.flashAt[action.kind === 'stall' ? 'STALL' : action.unit] = performance.now();

    if (this.practice) {
      // Practice grades the choice, not the timing, and explains mistakes.
      const outcome = evaluate(this.run.pipeline, action);
      if (!outcome) return;
      if (outcome !== 'issued' && outcome !== 'stalled') {
        this.buzz();
        this.showCallout(this.explainMistake(outcome));
        return;
      }
      this.callout.setVisible(false);
      beat = this.run.dueBeat;
    }

    // Close any cycles that ended before this press, so it applies to the right
    // cycle even if a slow frame hasn't caught up yet.
    this.advanceTo(beat);
    const decision = this.run.press(action, beat);
    if (decision) this.showDecision(decision);
  }

  private advanceTo(beat: number): void {
    for (const report of this.run.update(beat)) this.onCycle(report);
  }

  /**
   * Practice: close cycles one at a time and hold the chart at the first
   * instruction in ID still waiting for the player (even if a slow frame
   * spans several beats). Returns the chart beat to use this frame.
   */
  private holdForPlayer(beat: number): number {
    while (!this.run.done) {
      if (this.run.pipeline.stages.ID && !this.run.decided) {
        if (beat > this.run.dueBeat) {
          this.chartOffset += beat - this.run.dueBeat;
          beat = this.run.dueBeat;
          this.explainSituation();
        }
        return beat;
      }
      const reports = this.run.update(Math.min(beat, this.run.dueBeat + 0.5));
      for (const report of reports) this.onCycle(report);
      if (reports.length === 0) return beat;
    }
    return beat;
  }

  private bestAction(): Action {
    const slot = this.run.pipeline.stages.ID;
    return this.run.pipeline.hazard() || !slot ? { kind: 'stall' } : { kind: 'route', unit: unitOf(slot.instr) };
  }

  /** Beat of the chart (conductor beat minus practice holds) at a performance.now() time. */
  private chartBeat(performanceMs = performance.now()): number {
    return (this.conductor?.beatAt(performanceMs) ?? 0) - this.chartOffset;
  }

  // ---- feedback ----

  private showDecision(d: Decision): void {
    const op = d.slot.instr.op;
    switch (d.outcome) {
      case 'issued': {
        const unit = unitOf(d.slot.instr);
        blip(this.ctx, UNIT_PITCH[unit]);
        const streak = this.run.streak + 1;
        this.feedback.setText(`${d.judgment}${streak >= 4 ? `   STREAK ${streak}` : ''}`);
        const view = this.notes.get(noteKey(d.slot));
        if (view) this.removeNote(noteKey(d.slot), view, false);
        return;
      }
      case 'stalled':
        blip(this.ctx, 330, this.ctx.currentTime, 0.08, 'triangle', 0.08);
        this.feedback.setText(`STALL: x${d.hazard?.reg} NOT READY YET\n(${this.hazardWhere(d.hazard)})`);
        return;
      case 'wasted-stall':
        this.buzz();
        this.feedback.setText('NO HAZARD HERE:\nTHAT STALL WASTED A CYCLE');
        return;
      case 'violation': {
        this.buzz();
        this.cameras.main.shake(120, 0.004);
        const h = d.hazard;
        const stale = h ? this.run.pipeline.regs[h.reg] : 0;
        this.feedback.setText(
          `DATA HAZARD! ${op} READ x${h?.reg} = ${stale}\n` +
            `BUT ${h?.producer.instr.op} IS STILL COMPUTING ${h?.producer.value}\nFLUSH: FETCHING IT AGAIN`,
        );
        return;
      }
      case 'wrong-unit':
        this.buzz();
        this.feedback.setText(`WRONG UNIT: ${op} RUNS ON ${unitOf(d.slot.instr)}\nSTALL: +1 CYCLE`);
        return;
      case 'off-beat':
        this.buzz();
        this.feedback.setText('OFF BEAT\nSTALL: +1 CYCLE');
        return;
      case 'missed':
        return; // reported when the cycle closes
    }
  }

  private onCycle(report: CycleReport): void {
    if (report.decision?.outcome === 'missed') {
      this.buzz();
      this.feedback.setText('MISSED\nSTALL: +1 CYCLE');
    }
    for (const slot of report.flushed) {
      const view = this.notes.get(noteKey(slot));
      if (view) this.removeNote(noteKey(slot), view, true);
    }
    if (report.event.kind === 'issued' && report.event.slot.step?.taken && report.flushed.length > 0) {
      this.feedback.setText('BRANCH TAKEN: THE NEXT\nINSTRUCTION WAS WRONG. FLUSHED.');
      if (this.practice && !this.explained.has('branch')) {
        this.explained.add('branch');
        this.showCallout(
          'BRANCH TAKEN: the instruction fetched\nbehind it was the wrong one, so it was\nflushed. Costs 1 cycle, not your fault.',
        );
      }
    }
    this.refreshPanel(report.committed);
  }

  private hazardWhere(hazard: Hazard | null): string {
    if (!hazard) return '';
    const stage = this.run.pipeline.stageOf(hazard.producer.seq) ?? 'EX';
    return `${hazard.producer.instr.op} IS STILL IN ${stage}`;
  }

  private buzz(): void {
    blip(this.ctx, 110, this.ctx.currentTime, 0.15, 'sawtooth', 0.08);
  }

  // ---- practice ----

  private explainSituation(): void {
    const hazard = this.run.pipeline.hazard();
    const slot = this.run.pipeline.stages.ID;
    if (!slot) return;
    if (hazard && !this.explained.has('hazard')) {
      this.explained.add('hazard');
      this.showCallout(
        `HAZARD: ${slot.instr.op} needs x${hazard.reg}, but\n${hazard.producer.instr.op} is still computing it (in ${this.run.pipeline.stageOf(hazard.producer.seq)}).\nPress SPACE to stall.`,
      );
    } else if (!hazard && !this.explained.has('route')) {
      this.explained.add('route');
      const unit = unitOf(slot.instr);
      this.showCallout(`NO HAZARD: every register it reads\nis ready. Route it as before:\npress ${LANE_KEYS[unit]} (${unit})`);
    }
  }

  private explainMistake(outcome: string): string {
    const slot = this.run.pipeline.stages.ID;
    const hazard = this.run.pipeline.hazard();
    if (!slot) return '';
    const unit = unitOf(slot.instr);
    if (outcome === 'violation' && hazard) {
      return `WAIT! ${slot.instr.op} reads x${hazard.reg}, still being\ncomputed by ${hazard.producer.instr.op} (in ${this.run.pipeline.stageOf(hazard.producer.seq)}).\nPress SPACE to stall.`;
    }
    if (outcome === 'wasted-stall') return `NO NEED TO STALL: its registers\nare ready. Route it: ${LANE_KEYS[unit]} (${unit})`;
    return `${describe(slot.instr)}\n${UNIT_ROLES[unit]} -> press ${LANE_KEYS[unit]} (${unit})`;
  }

  // ---- drawing ----

  private text(x: number, y: number, content: string, size = 16): Phaser.GameObjects.Text {
    return this.add.text(x, y, content, {
      fontFamily: 'monospace',
      fontSize: `${size}px`,
      color: cssColor(this.look.era.fg),
    });
  }

  private drawHighway(): void {
    const { fg, dim } = this.look.era;
    const lines = this.add.graphics().lineStyle(1, dim);
    for (let i = 0; i <= UNITS.length; i++) {
      lines.lineBetween(LANE_X0 + i * LANE_W, 0, LANE_X0 + i * LANE_W, HIT_Y + 16);
    }
    lines.lineStyle(1, fg).lineBetween(LANE_X0, HIT_Y, LANE_X0 + LANES_W, HIT_Y);
    for (const unit of UNITS) {
      this.laneFlash[unit] = this.add.rectangle(laneCenter(unit), HIT_Y, LANE_W - 4, 28, fg).setAlpha(0);
      this.text(laneCenter(unit), HIT_Y + 32, `${unit} [${LANE_KEYS[unit]}]`).setOrigin(0.5);
    }
    this.laneFlash.STALL = this.add.rectangle(LANE_X0 + LANES_W / 2, 512, LANES_W - 4, 24, fg).setAlpha(0);
    this.text(LANE_X0 + LANES_W / 2, 512, 'STALL [SPACE]').setOrigin(0.5);
  }

  private drawPanel(name: string): void {
    const { dim } = this.look.era;
    this.text(PANEL_X, 8, `PIPELINE   PROGRAM: ${name}`).setAlpha(0.7);
    STAGES.forEach((stage, i) => {
      const x = PANEL_X + i * (STAGE_W + STAGE_GAP) + STAGE_W / 2;
      const box = this.add.rectangle(x, 62, STAGE_W, 60).setStrokeStyle(1, dim);
      this.text(x, 40, stage, 14).setOrigin(0.5).setAlpha(0.7);
      const op = this.text(x, 62, '', 16).setOrigin(0.5);
      const dest = this.text(x, 82, '', 13).setOrigin(0.5);
      this.stageViews[stage] = { box, op, dest };
    });

    this.throughputText = this.text(PANEL_X, 104, '');
    let y = 140;
    this.text(PANEL_X, y, 'REGISTERS  (<- = STILL BEING COMPUTED)').setAlpha(0.7);
    y += 24;
    for (let r = 0; r < REGISTER_COUNT; r++) {
      const column = Math.floor(r / 4);
      this.regTexts.push(this.text(PANEL_X + column * 230, y + (r % 4) * LINE, '').setAlpha(0.8));
    }
    y += 4 * LINE + 16;
    this.statsText = this.text(PANEL_X, y, '').setLineSpacing(4);
    y += 52;
    this.feedback = this.text(
      PANEL_X,
      y,
      this.practice ? 'PRACTICE: NOTES WAIT FOR YOU' : 'GET READY...',
      18,
    ).setLineSpacing(6);
    this.text(PANEL_X, 512, '[Q] QUIT')
      .setAlpha(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('title'));
  }

  private drawCallout(): void {
    const { fg, bg } = this.look.era;
    const box = this.add.rectangle(0, 0, LANES_W - 8, 130, bg).setStrokeStyle(2, fg);
    this.calloutText = this.text(0, 0, '').setOrigin(0.5).setAlign('center').setLineSpacing(8);
    this.callout = this.add.container(LANE_X0 + LANES_W / 2, 290, [box, this.calloutText]).setDepth(600).setVisible(false);
  }

  private showCallout(message: string): void {
    this.calloutText.setText(message);
    this.callout.setVisible(true);
  }

  /** Redraws the pipeline strip, registers, throughput and stats. */
  private refreshPanel(committed?: Slot): void {
    const pipeline = this.run.pipeline;
    const { fg, dim } = this.look.era;
    const hazard = pipeline.hazard();

    for (const stage of STAGES) {
      const slot = pipeline.stages[stage];
      const view = this.stageViews[stage];
      const involved = hazard && slot && (slot.seq === hazard.producer.seq || stage === 'ID');
      view.box.setStrokeStyle(involved ? 2 : 1, involved ? fg : dim);
      view.op.setText(slot ? slot.instr.op : '-').setAlpha(slot ? 1 : 0.4);
      const rd = slot ? destReg(slot.instr) : undefined;
      view.dest.setText(rd !== undefined && rd !== 0 ? `-> x${rd}` : '').setAlpha(0.8);
    }

    const pending = new Map<number, string>();
    for (const stage of ['MEM', 'EX'] as const) {
      const slot = pipeline.stages[stage];
      const rd = slot ? destReg(slot.instr) : undefined;
      if (rd !== undefined && rd !== 0) pending.set(rd, stage); // EX overrides MEM: it's newer
    }
    pipeline.regs.forEach((value, r) => {
      const where = pending.get(r);
      this.regTexts[r]
        .setText(`x${r}`.padEnd(4) + `0x${hex(value)} ${String(value).padStart(3)}` + (where ? `  <- ${where}` : ''))
        .setAlpha(where ? 1 : 0.8);
    });
    const wrote = committed?.step?.wrote;
    if (wrote !== undefined) this.highlight(this.regTexts[wrote]);

    const filled = Math.round(this.run.throughput * 8);
    this.throughputText.setText(
      `THROUGHPUT [${'#'.repeat(filled)}${'.'.repeat(8 - filled)}] ${this.run.throughput.toFixed(2)} INSTR/CYCLE`,
    );
    this.statsText.setText(
      `CYCLE ${pipeline.cycle}   DONE ${pipeline.instructions}   CPI ${pipeline.cpi.toFixed(2)}\n` +
        `STALLS ${pipeline.stalls}   FLUSHED ${pipeline.flushed}   STREAK ${this.run.streak}`,
    );
  }

  private highlight(text: Phaser.GameObjects.Text | undefined): void {
    if (!text) return;
    this.tweens.killTweensOf(text);
    text.setAlpha(1);
    this.tweens.add({ targets: text, alpha: 0.8, duration: 400 });
  }

  // ---- notes ----

  /** Keeps one note per upcoming instruction: ID, IF, then the next fetches. */
  private syncNotes(beat: number, elapsed: number): void {
    const pipeline = this.run.pipeline;
    const { ID, IF } = pipeline.stages;
    const wanted: { slot: Slot; k: number }[] = [];
    if (ID && this.run.decided?.outcome !== 'issued') wanted.push({ slot: ID, k: 0 });
    if (IF) wanted.push({ slot: IF, k: 1 });
    pipeline.upcoming(LOOKAHEAD).forEach((slot, i) => wanted.push({ slot, k: 2 + i }));

    const keep = new Set<string>();
    for (const { slot, k } of wanted) {
      const key = noteKey(slot);
      keep.add(key);
      const target = this.run.dueBeat + k;
      const view = this.notes.get(key) ?? this.createNote(key, slot, target);
      view.target = target;
      view.due += (view.target - view.due) * Math.min(1, elapsed / 60);
      if (k === 0 && beat >= view.due) view.pinned = true;
      const y = k === 0 && view.pinned ? HIT_Y : HIT_Y - (view.due - beat) * PX_PER_BEAT;
      view.box.setY(y);
      view.label.setY(y);
    }
    // Predictions that will never be fetched (a branch redirected fetch) fade away quietly.
    for (const [key, view] of this.notes) if (!keep.has(key)) this.removeNote(key, view, false);
  }

  private createNote(key: string, slot: Slot, due: number): NoteView {
    const { fg, bg, syntax } = this.look.era;
    const x = laneCenter(unitOf(slot.instr));
    const box = this.add.rectangle(x, -40, NOTE_W, 24, bg).setStrokeStyle(1, fg, 0.6);
    const label = codeLine(this, x, -40, tokens(slot.instr, true), syntax, { maxWidth: NOTE_W - 8, center: true });
    const view: NoteView = { box, label, due, target: due, pinned: false };
    this.notes.set(key, view);
    return view;
  }

  /** Removes a note; flushed notes are struck through and fade out. */
  private removeNote(key: string, view: NoteView, flushed: boolean): void {
    this.notes.delete(key);
    if (!flushed) {
      view.box.destroy();
      view.label.destroy();
      return;
    }
    const strike = this.add
      .rectangle(view.box.x, view.box.y, NOTE_W + 6, 2, this.look.era.fg)
      .setDepth(10);
    this.tweens.add({
      targets: [view.box, view.label, strike],
      alpha: 0,
      duration: 600,
      onComplete: () => {
        view.box.destroy();
        view.label.destroy();
        strike.destroy();
      },
    });
  }

  // ---- results ----

  private finish(): void {
    this.finished = true;
    this.conductor?.stop();
    const p = this.run.pipeline;
    const period = 1 / CLOCK_MHZ;
    const pipelined = p.cycle * period;
    const single = p.instructions * (1 / SINGLE_CYCLE_MHZ);
    const ratio = single / pipelined;

    const lines = this.practice
      ? [
          'PRACTICE COMPLETE',
          '',
          `ALL ${p.instructions} INSTRUCTIONS RAN SAFELY, WITH`,
          `${this.run.counts.stalled} STALLS WHERE VALUES WEREN'T READY.`,
          '',
          "NOW PLAY FOR REAL: NOTES WON'T WAIT.",
          '',
          '[ENTER] PLAY    [Q] TITLE',
        ]
      : [
          'PROGRAM COMPLETE',
          '',
          `INSTRUCTIONS ${p.instructions}   CYCLES ${p.cycle}   CPI ${p.cpi.toFixed(2)}`,
          `STALLS ${p.stalls}   FLUSHED ${p.flushed}   BEST STREAK ${this.run.bestStreak}`,
          '',
          'CPU TIME = INSTRUCTIONS x CPI x CLOCK PERIOD',
          `PIPELINED (4 MHz):    ${p.instructions} x ${p.cpi.toFixed(2)} x 0.25 µs = ${pipelined.toFixed(1)} µs`,
          `SINGLE-CYCLE (1 MHz): ${p.instructions} x 1.00 x 1.00 µs = ${single.toFixed(1)} µs`,
          '',
          ratio >= 1
            ? `${ratio.toFixed(1)}x FASTER, EVEN WITH A HIGHER CPI`
            : `${(1 / ratio).toFixed(1)}x SLOWER: TOO MANY STALLS AND FLUSHES`,
          '',
          '[ENTER] RETRY    [Q] TITLE',
        ];
    const { width, height } = this.scale;
    const { fg, bg } = this.look.era;
    this.add.rectangle(width / 2, height / 2, 760, 400, bg).setStrokeStyle(1, fg).setDepth(500);
    this.text(width / 2, height / 2, lines.join('\n')).setOrigin(0.5).setDepth(501).setLineSpacing(6);
  }
}
