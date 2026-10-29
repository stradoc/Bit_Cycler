import { Conductor } from '../audio/conductor.js';
import { LayeredMusic } from '../audio/music.js';
import { blip } from '../audio/sfx.js';
import { PROGRAMS } from '../data/programs.js';
import { keyOf, onKeyDown } from '../input/keys.js';
import { NORMAL_WINDOWS, RELAXED_WINDOWS } from '../rhythm/judge.js';
import { evaluate, PipelineRun, } from '../rhythm/pipelineRun.js';
import { tempoForClock } from '../rhythm/tempo.js';
import { getSettings } from '../settings.js';
import { assemble } from '../sim/assembler.js';
import { Cpu } from '../sim/cpu.js';
import { describe, tokens, UNIT_ROLES, UNITS, unitOf } from '../sim/isa.js';
import { STAGES } from '../sim/pipeline.js';
import { codeLine } from '../visual/codeLine.js';
import { cssColor, ERAS, TerminalLook } from '../visual/terminal.js';
// Pipelining shortens each stage, so the clock can run 4x faster than tier 1's.
const CLOCK_MHZ = 4;
const SINGLE_CYCLE_MHZ = 1;
/** Cycle c happens on beat FIRST_BEAT + c, so the first decision lands on beat 4. */
const FIRST_BEAT = 2;
const REGISTER_COUNT = 8;
const LOOKAHEAD = 6;
/** Replays play the recorded run at this multiple of the normal tempo. */
const REPLAY_SPEED = 2;
// The highway IS the pipeline: notes fall to the hit line (ID), and once
// routed they step down through the EX, MEM and WB rows, one row per beat.
const LANE_X0 = 108;
const LANE_W = 138;
const LANES_W = UNITS.length * LANE_W;
const HIT_Y = 330;
const ROW_GAP = 40;
const ROWS = { EX: HIT_Y + ROW_GAP, MEM: HIT_Y + 2 * ROW_GAP, WB: HIT_Y + 3 * ROW_GAP };
const PX_PER_BEAT = 64;
const NOTE_W = LANE_W - 8;
const NOTE_H = 26;
const PANEL_X = 544;
/** The bus between the pipeline and the register file / memory. */
const BUS_X = 532;
const LINE = 20;
/** The program listing: a window that scrolls to follow the instruction in ID. */
const LISTING_TOP = 34;
const LISTING_ROWS = 6;
const LISTING_LINE = 18;
const FLASH_MS = 120;
const LANE_KEYS = { ALU: 'D', MEM: 'F', BRANCH: 'J' };
const KEY_UNITS = { D: 'ALU', F: 'MEM', J: 'BRANCH' };
const UNIT_PITCH = { ALU: 660, MEM: 523, BRANCH: 784 };
const noteKey = (slot) => `${slot.seq}:${slot.pc}`;
const laneCenter = (unit) => LANE_X0 + LANE_W * (UNITS.indexOf(unit) + 0.5);
const hex = (value) => value.toString(16).toUpperCase().padStart(2, '0');
/** The point `fraction` (0-1) of the way along a polyline, and the path up to it. */
function alongPath(path, fraction) {
    const lengths = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
    let remaining = fraction * lengths.reduce((a, b) => a + b, 0);
    const travelled = [path[0]];
    for (let i = 0; i < lengths.length; i++) {
        const [from, to] = [path[i], path[i + 1]];
        if (remaining >= lengths[i]) {
            travelled.push(to);
            remaining -= lengths[i];
            continue;
        }
        const t = lengths[i] === 0 ? 1 : remaining / lengths[i];
        travelled.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
        break;
    }
    return travelled;
}
/**
 * Tier 2: a 5-stage pipeline. Each beat, route the instruction in ID to its
 * unit, or stall (Space) while a register it needs is still being computed
 * by an instruction below it.
 */
export class PipelineScene extends Phaser.Scene {
    look;
    ctx;
    conductor;
    run;
    /** Upcoming notes (IF and later, plus the one in ID), keyed by seq:pc. */
    notes = new Map();
    /** Notes already issued, in the EX / MEM / WB rows, keyed by seq. */
    inFlight = new Map();
    fades = [];
    transfers = [];
    /** What the panel shows: values change when they arrive over the bus. */
    shownRegs = [];
    shownMemory = new Uint8Array(0);
    /** Stores already sent to memory (they travel from the MEM row). */
    storesSent = new Set();
    busGlow;
    laneFlash = {};
    flashAt = { ALU: -Infinity, MEM: -Infinity, BRANCH: -Infinity, STALL: -Infinity };
    hazardLink;
    hazardTag;
    regTexts = [];
    memTexts = [];
    listing = [];
    listingParts = [];
    throughputText;
    statsText;
    feedback;
    callout;
    calloutText;
    lastFrameMs = 0;
    finished = false;
    /** Beat on which the last instruction leaves WB (set once the program is done). */
    endBeat;
    practice = false;
    chartOffset = 0;
    explained = new Set();
    autoplay = new URLSearchParams(location.search).has('autoplay');
    /** This run's decisions, cycle by cycle, for the replay. */
    recording = [];
    /** Set when watching a replay: the recorded run to play back. */
    watching = null;
    constructor() {
        super('pipeline');
    }
    init(data) {
        // ?practice in the URL starts in practice mode (dev shortcut).
        this.practice = data?.practice ?? new URLSearchParams(location.search).has('practice');
        this.watching = data?.watch ?? null;
        this.recording = [];
        this.conductor = undefined;
        this.notes = new Map();
        this.inFlight = new Map();
        this.fades = [];
        this.transfers = [];
        this.storesSent = new Set();
        this.regTexts = [];
        this.memTexts = [];
        this.listing = [];
        this.listingParts = [];
        this.flashAt = { ALU: -Infinity, MEM: -Infinity, BRANCH: -Infinity, STALL: -Infinity };
        this.lastFrameMs = performance.now();
        this.finished = false;
        this.endBeat = undefined;
        this.chartOffset = 0;
        this.explained = new Set();
    }
    create() {
        const settings = getSettings();
        this.look = new TerminalLook(this, ERAS.at(settings.eraIndex) ?? ERAS[0]);
        if (!(this.sound instanceof Phaser.Sound.WebAudioSoundManager)) {
            this.text(480, 270, 'WEB AUDIO NOT AVAILABLE', 20).setOrigin(0.5);
            return;
        }
        this.ctx = this.sound.context;
        const spec = PROGRAMS[0];
        const easy = settings.relaxed || this.practice;
        const bpm = tempoForClock(CLOCK_MHZ, easy) * (this.watching ? REPLAY_SPEED : 1);
        const program = assemble(spec.source, REGISTER_COUNT);
        const cpu = new Cpu(program, 8, spec.memory, REGISTER_COUNT);
        this.listing = this.buildListing(program);
        this.run = new PipelineRun(cpu, false, FIRST_BEAT, 60 / bpm, easy ? RELAXED_WINDOWS : NORMAL_WINDOWS);
        this.shownRegs = [...this.run.pipeline.regs];
        this.shownMemory = cpu.memory.slice();
        this.drawHighway();
        this.drawPanel(spec.name);
        this.drawBus();
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
    update() {
        this.look.update();
        const now = performance.now();
        const elapsed = now - this.lastFrameMs;
        this.lastFrameMs = now;
        for (const key of [...UNITS, 'STALL']) {
            const fade = 1 - (now - this.flashAt[key]) / FLASH_MS;
            this.laneFlash[key]?.setAlpha(0.35 * Math.max(0, fade));
        }
        this.updateFades(now);
        this.updateTransfers(now);
        if (!this.conductor || this.finished)
            return;
        let beat = this.chartBeat();
        if (this.practice)
            beat = this.holdForPlayer(beat);
        if (this.autoplay || this.watching)
            this.playItself(beat);
        this.advanceTo(beat);
        this.syncNotes(beat, elapsed);
        this.easeRows(elapsed);
        this.drawHazard(now);
        if (this.run.done)
            this.drainAndFinish(beat);
    }
    // ---- input ----
    onKey(event) {
        const key = keyOf(event);
        const unit = KEY_UNITS[key];
        if ((unit || key === ' ') && !this.watching) {
            event.preventDefault();
            const action = unit ? { kind: 'route', unit } : { kind: 'stall' };
            this.act(action, this.chartBeat(event.timeStamp));
        }
        else if (key === 'Escape' || key === 'Q') {
            this.scene.start('title');
        }
        else if (key === 'Enter' && this.finished) {
            this.scene.restart({ practice: false });
        }
        else if (key === 'W' && this.finished && !this.practice) {
            this.scene.restart({ watch: this.watching ?? this.recording });
        }
    }
    act(action, beat) {
        if (!this.conductor || this.finished)
            return;
        this.flashAt[action.kind === 'stall' ? 'STALL' : action.unit] = performance.now();
        if (this.practice) {
            // Practice grades the choice, not the timing, and explains mistakes.
            const outcome = evaluate(this.run.pipeline, action);
            if (!outcome)
                return;
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
        if (decision)
            this.showDecision(decision);
    }
    advanceTo(beat) {
        for (const report of this.run.update(beat))
            this.onCycle(report);
    }
    /**
     * Autoplay and replays: decide for each cycle (perfectly, or as recorded),
     * one cycle at a time so a slow frame can't skip decisions.
     */
    playItself(beat) {
        while (!this.run.done && beat >= this.run.dueBeat) {
            if (this.run.pipeline.stages.ID && !this.run.decided) {
                if (this.watching) {
                    const recorded = this.watching[this.run.pipeline.cycle - 1];
                    const decision = recorded && this.run.force(recorded.action, recorded.outcome, recorded.judgment);
                    if (decision)
                        this.showDecision(decision);
                }
                else {
                    this.act(this.bestAction(), this.run.dueBeat);
                }
            }
            const reports = this.run.update(Math.min(beat, this.run.dueBeat + 0.5));
            for (const report of reports)
                this.onCycle(report);
            if (reports.length === 0)
                break;
        }
    }
    /**
     * Practice: close cycles one at a time and hold the chart at the first
     * instruction in ID still waiting for the player (even if a slow frame
     * spans several beats). Returns the chart beat to use this frame.
     */
    holdForPlayer(beat) {
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
            for (const report of reports)
                this.onCycle(report);
            if (reports.length === 0)
                return beat;
        }
        return beat;
    }
    bestAction() {
        const slot = this.run.pipeline.stages.ID;
        return this.run.pipeline.hazard() || !slot ? { kind: 'stall' } : { kind: 'route', unit: unitOf(slot.instr) };
    }
    /** Beat of the chart (conductor beat minus practice holds) at a performance.now() time. */
    chartBeat(performanceMs = performance.now()) {
        return (this.conductor?.beatAt(performanceMs) ?? 0) - this.chartOffset;
    }
    // ---- feedback ----
    showDecision(d) {
        switch (d.outcome) {
            case 'issued': {
                blip(this.ctx, UNIT_PITCH[unitOf(d.slot.instr)]);
                const streak = this.run.streak + 1;
                const label = d.waited ? 'GO' : d.judgment;
                this.feedback.setText(`${label}${streak >= 4 ? `\nSTREAK ${streak}` : ''}`);
                return;
            }
            case 'stalled':
                blip(this.ctx, 330, this.ctx.currentTime, 0.08, 'triangle', 0.08);
                this.feedback.setText(`STALL: WAITING FOR x${d.hazard?.reg}`);
                return;
            case 'wasted-stall':
                this.buzz();
                this.feedback.setText('NOTHING TO WAIT FOR:\nA WASTED CYCLE');
                return;
            case 'violation': {
                this.buzz();
                this.cameras.main.shake(120, 0.004);
                const h = d.hazard;
                this.feedback.setText(`DATA HAZARD! x${h?.reg} WASN'T READY\n(READ ${h ? this.run.pipeline.regs[h.reg] : 0}, NEEDED ${h?.producer.value})\nFLUSHED`);
                return;
            }
            case 'wrong-unit':
                this.buzz();
                this.feedback.setText(`WRONG UNIT: ${d.slot.instr.op}\nRUNS ON ${unitOf(d.slot.instr)}`);
                return;
            case 'off-beat':
                this.buzz();
                this.feedback.setText('OFF BEAT: STALLED');
                return;
            case 'missed':
                return; // reported when the cycle closes
        }
    }
    onCycle(report) {
        if (!this.watching) {
            const d = report.decision;
            this.recording.push(d ? { action: d.action, outcome: d.outcome, judgment: d.judgment } : null);
        }
        if (report.decision?.outcome === 'missed') {
            this.buzz();
            // A note waiting on the line has no beat to miss: it just lost a cycle.
            this.feedback.setText(report.decision.waited ? 'LATE: +1 CYCLE' : 'MISSED: STALLED');
        }
        for (const slot of report.flushed) {
            const view = this.notes.get(noteKey(slot));
            if (view) {
                this.notes.delete(noteKey(slot));
                this.strikeOut(view);
            }
        }
        const issued = report.event.kind === 'issued' ? report.event.slot : undefined;
        if (issued?.step?.taken && report.flushed.length > 0) {
            this.feedback.setText('BRANCH TAKEN:\nWRONG NEXT INSTRUCTION FLUSHED');
            if (this.practice && !this.explained.has('branch')) {
                this.explained.add('branch');
                this.showCallout('BRANCH TAKEN: the instruction behind\nit was the wrong one, so it was\nflushed. Costs 1 cycle, not your fault.');
            }
        }
        this.syncRows();
        this.sendResults(report.committed);
        this.refreshPanel();
    }
    buzz() {
        blip(this.ctx, 110, this.ctx.currentTime, 0.15, 'sawtooth', 0.08);
    }
    // ---- practice ----
    explainSituation() {
        const hazard = this.run.pipeline.hazard();
        const slot = this.run.pipeline.stages.ID;
        if (!slot)
            return;
        if (hazard && !this.explained.has('hazard')) {
            this.explained.add('hazard');
            this.showCallout(`HAZARD: ${slot.instr.op} needs x${hazard.reg}, but ${hazard.producer.instr.op}\n(linked below) hasn't finished it.\nPress SPACE until the link is gone.`);
        }
        else if (!hazard && !this.explained.has('route')) {
            this.explained.add('route');
            const unit = unitOf(slot.instr);
            this.showCallout(`NO LINK: nothing below is still\ncomputing what it needs.\nRoute it: press ${LANE_KEYS[unit]} (${unit})`);
        }
    }
    explainMistake(outcome) {
        const slot = this.run.pipeline.stages.ID;
        const hazard = this.run.pipeline.hazard();
        if (!slot)
            return '';
        const unit = unitOf(slot.instr);
        if (outcome === 'violation' && hazard) {
            return `WAIT! x${hazard.reg} is still being computed\nby ${hazard.producer.instr.op} (linked below).\nPress SPACE to stall.`;
        }
        if (outcome === 'wasted-stall')
            return `NO NEED TO WAIT: there's no link.\nRoute it: press ${LANE_KEYS[unit]} (${unit})`;
        return `${describe(slot.instr)}\n${UNIT_ROLES[unit]} -> press ${LANE_KEYS[unit]} (${unit})`;
    }
    // ---- drawing ----
    text(x, y, content, size = 16) {
        return this.add.text(x, y, content, {
            fontFamily: 'monospace',
            fontSize: `${size}px`,
            color: cssColor(this.look.era.fg),
        });
    }
    drawHighway() {
        const { fg, dim } = this.look.era;
        const bottom = ROWS.WB + ROW_GAP / 2;
        const lines = this.add.graphics().lineStyle(1, dim);
        for (let i = 0; i <= UNITS.length; i++) {
            lines.lineBetween(LANE_X0 + i * LANE_W, 0, LANE_X0 + i * LANE_W, bottom);
        }
        // Faint dividers between the EX / MEM / WB rows
        for (const y of [ROWS.EX, ROWS.MEM, ROWS.WB]) {
            lines.lineBetween(LANE_X0, y - ROW_GAP / 2, LANE_X0 + LANES_W, y - ROW_GAP / 2);
        }
        lines.lineBetween(LANE_X0, bottom, LANE_X0 + LANES_W, bottom);
        lines.lineStyle(2, fg).lineBetween(LANE_X0, HIT_Y, LANE_X0 + LANES_W, HIT_Y);
        // Each stage's plain name, with the textbook abbreviation underneath.
        const stageLabel = (y, name, short, alpha) => {
            this.text(LANE_X0 - 10, y - 7, name, 13).setOrigin(1, 0.5).setAlpha(alpha);
            this.text(LANE_X0 - 10, y + 8, short, 11).setOrigin(1, 0.5).setAlpha(alpha * 0.6);
        };
        stageLabel(HIT_Y - PX_PER_BEAT, 'FETCH', 'IF', 0.6); // where the next note waits, one beat out
        stageLabel(HIT_Y, 'DECODE', 'ID', 1);
        stageLabel(ROWS.EX, 'EXECUTE', 'EX', 0.8);
        stageLabel(ROWS.MEM, 'MEMORY', 'MEM', 0.8);
        stageLabel(ROWS.WB, 'WRITE BACK', 'WB', 0.8);
        for (const unit of UNITS) {
            this.laneFlash[unit] = this.add.rectangle(laneCenter(unit), HIT_Y, LANE_W - 4, 30, fg).setAlpha(0);
            this.text(laneCenter(unit), bottom + 18, `${unit} [${LANE_KEYS[unit]}]`).setOrigin(0.5);
        }
        this.laneFlash.STALL = this.add.rectangle(LANE_X0 + LANES_W / 2, bottom + 44, LANES_W - 4, 22, fg).setAlpha(0);
        this.text(LANE_X0 + LANES_W / 2, bottom + 44, 'STALL [SPACE]').setOrigin(0.5);
        this.hazardLink = this.add.graphics().setDepth(20);
        this.hazardTag = this.text(0, 0, '', 14).setOrigin(0.5).setDepth(21);
    }
    drawPanel(name) {
        const mode = this.watching ? '   REPLAY (2x SPEED)' : '';
        this.text(PANEL_X, 10, `TIER 2: PIPELINE   ${name}${mode}`, 14).setAlpha(0.7);
        let y = LISTING_TOP + LISTING_ROWS * LISTING_LINE + 10;
        this.text(PANEL_X, y, 'REGISTERS  (<- STILL COMPUTING)').setAlpha(0.7);
        y += 22;
        for (let r = 0; r < REGISTER_COUNT; r++) {
            const column = Math.floor(r / 4);
            this.regTexts.push(this.text(PANEL_X + column * 210, y + (r % 4) * LINE, '').setAlpha(0.8));
        }
        y += 4 * LINE + 10;
        this.text(PANEL_X, y, 'MEMORY').setAlpha(0.7);
        y += 20;
        for (let row = 0; row < 2; row++)
            this.memTexts.push(this.text(PANEL_X, y + row * LINE, '').setAlpha(0.8));
        y += 2 * LINE + 12;
        this.throughputText = this.text(PANEL_X, y, '');
        y += 26;
        this.statsText = this.text(PANEL_X, y, '').setLineSpacing(4);
        y += 50;
        const intro = this.watching ? 'WATCHING YOUR RUN' : this.practice ? 'PRACTICE:\nNOTES WAIT FOR YOU' : 'GET READY...';
        this.feedback = this.text(PANEL_X, y, intro, 20).setLineSpacing(6);
        this.text(PANEL_X, 512, '[Q] QUIT')
            .setAlpha(0.5)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.scene.start('title'));
    }
    buildListing(program) {
        const lines = [];
        program.instructions.forEach((instr, pc) => {
            for (const [label, target] of program.labels)
                if (target === pc)
                    lines.push({ label });
            lines.push({ pc, instr });
        });
        return lines;
    }
    /**
     * Redraws the listing window: it scrolls to keep the instruction in ID near
     * the top, marks it with '>', and tags every line that's in a pipeline stage.
     */
    refreshListing() {
        for (const part of this.listingParts)
            part.destroy();
        this.listingParts = [];
        const pipeline = this.run.pipeline;
        const stagesAt = new Map();
        for (const stage of STAGES) {
            const slot = pipeline.stages[stage];
            if (slot)
                stagesAt.set(slot.pc, [...(stagesAt.get(slot.pc) ?? []), stage]);
        }
        const focusPc = pipeline.stages.ID?.pc ?? pipeline.stages.IF?.pc ?? pipeline.cpu.pc;
        const focusLine = Math.max(0, this.listing.findIndex((line) => 'pc' in line && line.pc === focusPc));
        const start = Phaser.Math.Clamp(focusLine - 2, 0, Math.max(0, this.listing.length - LISTING_ROWS));
        const { syntax } = this.look.era;
        this.listing.slice(start, start + LISTING_ROWS).forEach((line, i) => {
            const y = LISTING_TOP + i * LISTING_LINE;
            if ('label' in line) {
                this.listingParts.push(this.text(PANEL_X + 4, y, `${line.label}:`, 15).setColor(cssColor(syntax.label)).setAlpha(0.8));
                return;
            }
            const stages = stagesAt.get(line.pc) ?? [];
            const current = line.pc === focusPc;
            const code = codeLine(this, PANEL_X + 22, y, tokens(line.instr), syntax, { size: 15, originY: 0 });
            this.listingParts.push(code.setAlpha(current ? 1 : stages.length > 0 ? 0.8 : 0.45));
            if (current)
                this.listingParts.push(this.text(PANEL_X + 4, y, '>', 15));
            if (stages.length > 0)
                this.listingParts.push(this.text(PANEL_X + 250, y, stages.join(' '), 14).setAlpha(0.8));
        });
        // Hint that the program continues beyond the window.
        if (start > 0)
            this.listingParts.push(this.text(PANEL_X + 380, LISTING_TOP, '^', 14).setAlpha(0.6));
        if (start + LISTING_ROWS < this.listing.length) {
            this.listingParts.push(this.text(PANEL_X + 380, LISTING_TOP + (LISTING_ROWS - 1) * LISTING_LINE, 'v', 14).setAlpha(0.6));
        }
    }
    /**
     * The wires results travel on: from the MEM and WB rows across to a vertical
     * bus, and from the bus into each register row and memory row.
     */
    drawBus() {
        const wires = this.add.graphics().lineStyle(1, this.look.era.fg, 0.25);
        const lanesRight = LANE_X0 + LANES_W;
        wires.lineBetween(lanesRight, ROWS.MEM, BUS_X, ROWS.MEM);
        wires.lineBetween(lanesRight, ROWS.WB, BUS_X, ROWS.WB);
        const rows = [...this.regTexts.slice(0, 4), ...this.memTexts].map((t) => t.y + 9);
        wires.lineBetween(BUS_X, Math.min(...rows), BUS_X, ROWS.WB);
        for (const y of rows)
            wires.lineBetween(BUS_X, y, PANEL_X - 4, y);
        this.busGlow = this.add.graphics().setDepth(690);
    }
    drawCallout() {
        const { fg, bg } = this.look.era;
        const box = this.add.rectangle(0, 0, LANES_W - 8, 120, bg).setStrokeStyle(2, fg);
        this.calloutText = this.text(0, 0, '').setOrigin(0.5).setAlign('center').setLineSpacing(8);
        this.callout = this.add.container(LANE_X0 + LANES_W / 2, 170, [box, this.calloutText]).setDepth(600).setVisible(false);
    }
    showCallout(message) {
        this.calloutText.setText(message);
        this.callout.setVisible(true);
    }
    /** Redraws registers and memory as they've arrived over the bus, plus throughput and stats. */
    refreshPanel() {
        this.refreshListing();
        const pipeline = this.run.pipeline;
        const pending = new Map();
        for (const stage of ['MEM', 'EX']) {
            const wrote = pipeline.stages[stage]?.step?.wrote;
            if (wrote !== undefined)
                pending.set(wrote, stage); // EX overrides MEM: it's newer
        }
        this.shownRegs.forEach((value, r) => {
            const where = pending.get(r);
            this.regTexts[r]
                .setText(`x${r}`.padEnd(4) + `0x${hex(value)} ${String(value).padStart(3)}` + (where ? ` <-${where}` : ''))
                .setAlpha(where ? 1 : 0.8);
        });
        this.memTexts.forEach((row, i) => {
            const bytes = Array.from(this.shownMemory.subarray(i * 8, i * 8 + 8), hex);
            row.setText(`${hex(i * 8)}: ${bytes.join(' ')}`);
        });
        const filled = Math.round(this.run.throughput * 8);
        this.throughputText.setText(`THROUGHPUT [${'#'.repeat(filled)}${'.'.repeat(8 - filled)}] ${this.run.throughput.toFixed(2)}`);
        this.statsText.setText(`CYCLE ${pipeline.cycle}  DONE ${pipeline.instructions}  CPI ${pipeline.cpi.toFixed(2)}\n` +
            `STALLS ${pipeline.stalls}  FLUSHED ${pipeline.flushed}  STREAK ${this.run.streak}`);
    }
    highlight(text) {
        if (!text)
            return;
        this.tweens.killTweensOf(text);
        text.setAlpha(1);
        this.tweens.add({ targets: text, alpha: 0.8, duration: 400 });
    }
    // ---- results on notes, and the bus ----
    /** What an instruction did, in a few characters. */
    resultText(slot) {
        const step = slot.step;
        if (step?.wrote !== undefined)
            return `x${step.wrote} = ${slot.value}`;
        if (step?.stored !== undefined)
            return `mem[${step.stored}] = ${this.run.pipeline.cpu.memory[step.stored]}`;
        if (step?.taken !== undefined)
            return step.taken ? 'BRANCH TAKEN' : 'NOT TAKEN';
        return 'x0 stays 0';
    }
    /**
     * Sends results to the panel over the bus: register results leave from WB
     * (when they're written back), stored bytes from MEM (when memory is written).
     */
    sendResults(committed) {
        const rd = committed?.step?.wrote;
        if (committed && rd !== undefined && committed.value !== undefined) {
            const value = committed.value;
            const target = this.regTexts[rd];
            this.transfer(committed, ROWS.WB, `x${rd}=${value}`, [target.x + 60, target.y + 9], () => {
                this.shownRegs[rd] = value;
                this.refreshPanel();
                this.highlight(target);
            });
        }
        const store = this.run.pipeline.stages.MEM;
        const address = store?.step?.stored;
        if (store && address !== undefined && !this.storesSent.has(store.seq)) {
            this.storesSent.add(store.seq);
            const value = this.run.pipeline.cpu.memory[address];
            const target = this.memTexts[Math.floor(address / 8)];
            const point = [target.x + 48 + (address % 8) * 29, target.y + 9];
            this.transfer(store, ROWS.MEM, `[${address}]=${value}`, point, () => {
                this.shownMemory[address] = value;
                this.refreshPanel();
                this.highlight(target);
            });
        }
    }
    /** Starts a value along the bus: right along its row, up the bus, then into its line. */
    transfer(slot, rowY, label, to, land) {
        const startX = laneCenter(unitOf(slot.instr)) + NOTE_W / 2;
        const path = [[startX, rowY], [BUS_X, rowY], [BUS_X, to[1]], [PANEL_X - 4, to[1]], to];
        // Label rides up and to the left of the moving point, clear of the panel text.
        const text = this.text(startX, rowY, label, 14).setOrigin(1, 1).setDepth(700);
        // Fits inside one beat, so values never pile up on the bus.
        const duration = Math.min(600, this.run.secondsPerBeat * 1000 * 0.8);
        this.transfers.push({ text, path, start: performance.now(), duration, land });
    }
    /** Moves values along the bus on the real clock, lighting the wire behind them. */
    updateTransfers(now) {
        this.busGlow.clear();
        this.transfers = this.transfers.filter((transfer) => {
            const t = Math.min(1, (now - transfer.start) / transfer.duration);
            const travelled = alongPath(transfer.path, 1 - (1 - t) ** 2);
            const [x, y] = travelled.at(-1) ?? transfer.path[0];
            transfer.text.setPosition(x - 4, y - 2);
            this.busGlow.lineStyle(2, this.look.era.fg, 0.9 * (1 - t * 0.5));
            this.busGlow.strokePoints(travelled.map(([px, py]) => new Phaser.Math.Vector2(px, py)));
            if (t < 1)
                return true;
            transfer.text.destroy();
            transfer.land();
            return false;
        });
    }
    // ---- notes and rows ----
    /** Keeps one falling note per upcoming instruction: ID, IF, then the next fetches. */
    syncNotes(beat, elapsed) {
        const pipeline = this.run.pipeline;
        const { ID, IF } = pipeline.stages;
        const wanted = [];
        if (ID)
            wanted.push({ slot: ID, k: 0 });
        if (IF)
            wanted.push({ slot: IF, k: 1 });
        pipeline.upcoming(LOOKAHEAD).forEach((slot, i) => wanted.push({ slot, k: 2 + i }));
        const keep = new Set();
        for (const { slot, k } of wanted) {
            const key = noteKey(slot);
            keep.add(key);
            const target = this.run.dueBeat + k;
            const view = this.notes.get(key) ?? this.createNote(key, slot, target);
            view.target = target;
            view.due += (view.target - view.due) * Math.min(1, elapsed / 60);
            if (k === 0 && beat >= view.due)
                view.pinned = true;
            const y = k === 0 && view.pinned ? HIT_Y : HIT_Y - (view.due - beat) * PX_PER_BEAT;
            view.box.setY(y);
            view.label.setY(y);
        }
        // Predictions that will never be fetched (a branch redirected fetch) disappear quietly.
        for (const [key, view] of this.notes) {
            if (keep.has(key))
                continue;
            this.notes.delete(key);
            view.box.destroy();
            view.label.destroy();
        }
    }
    /** Moves issued notes down to the row of the stage they're in; drops notes that left WB. */
    syncRows() {
        const stages = this.run.pipeline.stages;
        const present = new Set();
        for (const stage of ['EX', 'MEM', 'WB']) {
            const slot = stages[stage];
            if (!slot)
                continue;
            present.add(slot.seq);
            let block = this.inFlight.get(slot.seq);
            if (!block) {
                // Just issued: hand the falling note over to the rows, starting from the hit line.
                const key = noteKey(slot);
                const note = this.notes.get(key);
                this.notes.delete(key);
                block = { ...(note ?? this.createBlock(slot, HIT_Y)), rowY: ROWS[stage] };
                block.box.setY(HIT_Y);
                block.label.setY(HIT_Y).setAlpha(0.85);
                this.inFlight.set(slot.seq, block);
            }
            block.rowY = ROWS[stage];
            if (stage === 'WB' && !block.result) {
                // In WB the note shows what the instruction did.
                block.label.setVisible(false);
                block.result = this.text(block.box.x, block.box.y, this.resultText(slot), 15).setOrigin(0.5);
            }
        }
        for (const [seq, block] of this.inFlight) {
            if (present.has(seq))
                continue;
            this.inFlight.delete(seq);
            this.fade([block.box, block.label, ...(block.result ? [block.result] : [])], 200);
        }
    }
    /**
     * Slides issued notes toward their rows. Driven by real elapsed time rather
     * than tweens, so a slow frame snaps them into place instead of leaving them behind.
     */
    easeRows(elapsed) {
        const t = Math.min(1, elapsed / 50);
        for (const block of this.inFlight.values()) {
            const y = block.box.y + (block.rowY - block.box.y) * t;
            block.box.setY(y);
            block.label.setY(y);
            block.result?.setY(y);
        }
    }
    /**
     * When the instruction in ID needs a value still being computed, link it to
     * the instruction below that's computing it, and pulse the waiting note.
     */
    drawHazard(now) {
        this.hazardLink.clear();
        const { fg } = this.look.era;
        for (const block of this.inFlight.values())
            block.box.setStrokeStyle(1, fg, 0.5);
        const pipeline = this.run.pipeline;
        const hazard = pipeline.hazard();
        const id = pipeline.stages.ID;
        const waiting = id ? this.notes.get(noteKey(id)) : undefined;
        if (!hazard || !waiting) {
            this.hazardTag.setVisible(false);
            waiting?.box.setStrokeStyle(1, fg, 0.6);
            return;
        }
        waiting.box.setStrokeStyle(2, fg, 0.55 + 0.45 * Math.sin(now / 90));
        this.hazardTag
            .setText(`x${hazard.reg} NOT READY`)
            .setPosition(waiting.box.x, waiting.box.y - NOTE_H / 2 - 12)
            .setVisible(true);
        const producer = this.inFlight.get(hazard.producer.seq);
        if (producer) {
            producer.box.setStrokeStyle(2, fg, 1);
            this.hazardLink
                .lineStyle(2, fg, 0.9)
                .lineBetween(waiting.box.x, waiting.box.y + NOTE_H / 2, producer.box.x, producer.box.y - NOTE_H / 2);
        }
    }
    createBlock(slot, y) {
        const { fg, bg, syntax } = this.look.era;
        const x = laneCenter(unitOf(slot.instr));
        const box = this.add.rectangle(x, y, NOTE_W, NOTE_H, bg).setStrokeStyle(1, fg, 0.6);
        const label = codeLine(this, x, y, tokens(slot.instr, true), syntax, { maxWidth: NOTE_W - 8, center: true });
        return { box, label };
    }
    createNote(key, slot, due) {
        const view = { ...this.createBlock(slot, -40), due, target: due, pinned: false };
        this.notes.set(key, view);
        return view;
    }
    fade(parts, duration) {
        this.fades.push({ parts, start: performance.now(), duration });
    }
    /** Advances fades on the real clock, so slow frames can't leave notes stuck on screen. */
    updateFades(now) {
        this.fades = this.fades.filter(({ parts, start, duration }) => {
            const t = (now - start) / duration;
            if (t >= 1) {
                for (const part of parts)
                    part.destroy();
                return false;
            }
            for (const part of parts)
                part.setAlpha(1 - t);
            return true;
        });
    }
    /** A flushed note: struck through, then faded out. */
    strikeOut(view) {
        const strike = this.add.rectangle(view.box.x, view.box.y, NOTE_W + 6, 2, this.look.era.fg).setDepth(10);
        this.fade([view.box, view.label, strike], 600);
    }
    // ---- results ----
    /**
     * The program is done once its last instruction reaches WB. Let it finish
     * that beat, slide out of the pipeline, and land its value, then show results.
     */
    drainAndFinish(beat) {
        // The last instruction entered WB just before this beat; it leaves once the beat has passed.
        this.endBeat ??= this.run.dueBeat + 0.25;
        if (beat < this.endBeat)
            return;
        for (const [seq, block] of this.inFlight) {
            this.inFlight.delete(seq);
            this.fade([block.box, block.label, ...(block.result ? [block.result] : [])], 200);
        }
        if (this.transfers.length === 0)
            this.finish();
    }
    finish() {
        this.finished = true;
        this.conductor?.stop();
        this.hazardLink.clear();
        this.hazardTag.setVisible(false);
        this.callout.setVisible(false);
        const p = this.run.pipeline;
        const pipelined = p.cycle / CLOCK_MHZ;
        const single = p.instructions / SINGLE_CYCLE_MHZ;
        const ratio = single / pipelined;
        const lines = this.practice
            ? [
                'PRACTICE COMPLETE',
                '',
                `ALL ${p.instructions} INSTRUCTIONS RAN SAFELY.`,
                `YOU STALLED ${this.run.counts.stalled} TIMES WHILE VALUES WEREN'T READY.`,
                '',
                "NOW PLAY FOR REAL: NOTES WON'T WAIT.",
                '',
                '[ENTER] PLAY    [Q] TITLE',
            ]
            : [
                this.watching ? 'REPLAY COMPLETE' : 'PROGRAM COMPLETE',
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
                `[ENTER] ${this.watching ? 'PLAY' : 'RETRY'}    [W] WATCH REPLAY    [Q] TITLE`,
            ];
        const { width, height } = this.scale;
        const { fg, bg } = this.look.era;
        this.add.rectangle(width / 2, height / 2, 780, 400, bg).setStrokeStyle(1, fg).setDepth(500);
        this.text(width / 2, height / 2, lines.join('\n')).setOrigin(0.5).setDepth(501).setLineSpacing(6);
    }
}
//# sourceMappingURL=PipelineScene.js.map