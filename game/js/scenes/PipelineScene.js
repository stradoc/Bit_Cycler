import { Conductor } from '../audio/conductor.js';
import { stopMenuMusic } from '../audio/menu.js';
import { cheatFlags } from '../cheatFlags.js';
import { LayeredMusic } from '../audio/music.js';
import { blip } from '../audio/sfx.js';
import { GLOSSARY } from '../data/glossary.js';
import { programByName } from '../data/programs.js';
import { keyOf, onKeyDown } from '../input/keys.js';
import { NORMAL_WINDOWS, RELAXED_WINDOWS } from '../rhythm/judge.js';
import { evaluate, PipelineRun, } from '../rhythm/pipelineRun.js';
import { tempoForClock } from '../rhythm/tempo.js';
import { BASE_MHZ } from '../data/economy.js';
import { formatCount, formatDuration, formatMhz, formatMoney } from '../format.js';
import { getProgress, updateProgress } from '../save.js';
import { getSettings } from '../settings.js';
import { completeContract, hasCache, payFor, ratedMhzFor, thermalConfig } from '../sim/progress.js';
import { assemble } from '../sim/assembler.js';
import { Cpu } from '../sim/cpu.js';
import { describe, format, tokens, UNIT_ROLES, UNITS, unitOf } from '../sim/isa.js';
import { BLOCK_BYTES, blockOf, CACHE_LINES, freezeBeats, lineOf, MEMORY_TIMING, SHOWN_BYTES, tagOf, } from '../sim/memory.js';
import { perfectCycles, STAGES } from '../sim/pipeline.js';
import { Chip, THERMAL } from '../sim/thermal.js';
import { branchHint, hintColor } from '../visual/branchHint.js';
import { bar, deadlineBar } from '../visual/asciiChart.js';
import { codeLine } from '../visual/codeLine.js';
import { HeatEffects } from '../visual/heat.js';
import { panelBox } from '../visual/panelBox.js';
import { cssColor, currentEra, TerminalLook } from '../visual/terminal.js';
import { HEIGHT, isSmooth, textBase, WIDTH } from '../visual/display.js';
import { bevel, dropShadow, isClassic, isDos } from '../visual/bevel.js';
/** The clock and temperature gauge, top left above the stage names. */
const GAUGE_X = 54;
const GAUGE_TOP = 76;
const GAUGE_BOTTOM = 214;
const GAUGE_MIN_C = 40;
const GAUGE_MAX_C = 100;
/** Cycle c happens on beat firstBeat + c: FIRST_BEAT, plus the count-in in a song, so the first decision lands 2 beats later. */
const FIRST_BEAT = 2;
/** Before a song, a count-in of about this long introduces the loop's key registers (NEXT, END). */
const COUNT_IN_SECONDS = 4;
const REGISTER_COUNT = 8;
const LOOKAHEAD = 6;
/** Replay speeds, chosen with the arrow keys; starts at 1x. */
const REPLAY_SPEEDS = [0.5, 1, 2, 4];
const STAGE_NAMES = { IF: 'FETCH', ID: 'DECODE', EX: 'EXECUTE', MEM: 'MEMORY', WB: 'WRITE BACK' };
// The highway IS the pipeline: notes fall to the hit line (ID), and once
// routed they step down through the EX, MEM and WB rows, one row per beat.
const LANE_X0 = 108;
const LANE_W = 138;
const LANES_W = UNITS.length * LANE_W;
const HIT_Y = 330;
const ROW_GAP = 40;
const ROWS = { EX: HIT_Y + ROW_GAP, MEM: HIT_Y + 2 * ROW_GAP, WB: HIT_Y + 3 * ROW_GAP };
/** Tier 1 (single-cycle): no EX / MEM rows; a finished instruction shows its result just below the line. */
const SINGLE_CYCLE_ROWS = { EX: HIT_Y + ROW_GAP, MEM: HIT_Y + ROW_GAP, WB: HIT_Y + ROW_GAP };
const PX_PER_BEAT = 64;
const NOTE_W = LANE_W - 8;
const NOTE_H = 26;
const PANEL_X = 544;
/** The bus between the pipeline and the register file / memory. */
const BUS_X = 532;
const LINE = 18;
/** The program listing: a window that scrolls to follow the instruction in ID. */
const LISTING_TOP = 42;
/** Left edge of the panel's boxes; the bus wires plug into it. */
const BOX_X = PANEL_X - 8;
const BOX_W = 950 - BOX_X;
const LISTING_ROWS = 5;
/** Memory rows of 8 bytes (two cache blocks each), and the MEMORY box's width when the L1 cache sits beside it. */
const MEMORY_ROWS = SHOWN_BYTES / 8;
const MEMORY_W_CACHED = 252;
const LISTING_LINE = 18;
const FLASH_MS = 120;
const LANE_KEYS = { ALU: 'D', MEM: 'F', BRANCH: 'J' };
const KEY_UNITS = { D: 'ALU', F: 'MEM', J: 'BRANCH' };
const UNIT_PITCH = { ALU: 660, MEM: 523, BRANCH: 784 };
/** Why a miss happened, in the words the replay uses. */
const MISS_WORDS = { 'first-use': 'FIRST USE', conflict: 'CONFLICT', 'too-small': 'TOO SMALL' };
const bin = (value, bits) => value.toString(2).padStart(bits, '0');
/** An address as the cache splits it: tag, line, offset (tttt ii oo). */
const addressBits = (address) => `${bin(tagOf(address), 4)} ${bin(lineOf(address), 2)} ${bin(address % BLOCK_BYTES, 2)}`;
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
    keyButtons = {};
    hazardLink;
    hazardTag;
    /** Tier 4: "J: NOT  K: TAKEN" over a branch on the line, the hinted guess brighter. */
    guessTag;
    guessNot;
    guessTaken;
    regTexts = [];
    memTexts = [];
    /** The L1 cache's lines in the panel (once it's bought), and what they show: a miss fills its line when the block arrives. */
    cacheTexts = [];
    shownLines = [];
    /** The last load or store's trip to memory, under the MEMORY box. */
    lookupText;
    /** "WAITING ON RAM" over the note in MEMORY while the pipeline is frozen. */
    memTag;
    freezeLabel;
    freezeView;
    /** Each load and store's access, by seq (clicking its note in a replay explains it). */
    accesses = new Map();
    listing = [];
    listingParts = [];
    /** The listing's lines live in a layer that the modern era slides when it scrolls (clipped to its box). */
    listingLayer;
    listingStart = 0;
    /** How far the lines are still sliding (px): eased to 0 each frame. */
    listingScroll = 0;
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
    autoplayParam = new URLSearchParams(location.search).has('autoplay');
    /** ?autoplay, or cheat.autoplay() from the console. */
    get autoplay() {
        return this.autoplayParam || cheatFlags.autoplay;
    }
    /** cheat.temp(): set the chip's temperature mid-song (testing heat and throttling). */
    setTemperature(celsius) {
        this.run.chip.temperature = celsius;
    }
    /** This run's decisions, cycle by cycle, for the replay. */
    recording = [];
    /** Set when watching a replay: the recorded run to play back. */
    watching = null;
    /** Tier 3: the forwarding unit passes results straight to the next instruction. */
    forwarding = false;
    /** Tier 4: the player guesses each branch (J not taken, K taken). */
    guessing = false;
    /** Tiers 5-6: a hardware predictor guesses first; the player follows or overrides it. */
    predictor;
    /** The L1 data cache (a memory part from the shop). */
    l1 = false;
    programName = 'SUM ARRAY';
    /** Tier 1: a single-cycle CPU (every instruction does all five steps in one long beat). */
    singleCycle = false;
    rows = ROWS;
    /** The contract being played (from the board), if any: it pays when a real run finishes. */
    contract;
    /** This contract has been paid (shown on the results after the replay). */
    paid = false;
    /** The run's pace would have finished the whole contract after its deadline: half pay. */
    late = false;
    returnTo;
    /** Rated clock in MHz, from the clock upgrades owned; the dial over- or underclocks it. */
    ratedMhz = BASE_MHZ.pipelined;
    /** The chip's maximum clock when this run started (wear can lower it); a replay starts from the run's. */
    /** The chip's top clock (its wear) as the song starts, and whether H may pass the rated clock. */
    startMaxDial = THERMAL.maxDial;
    canOverclock = false;
    /** The clock was stopped (overheated) at the last check, to say when it starts again. */
    wasHalted = false;
    /** The clock dial on each cycle of this run (G / H change it), for the replay. */
    dialRecording = [];
    watchDials = [];
    /** Overheats already reported (each one wears the chip). */
    overheatsShown = 0;
    /** The clock ratio the music is playing at; changes when the dial is turned. */
    tempoRatio = 1;
    heat;
    gauge;
    /** The CPU as the program starts, for best-case comparisons on the results screen. */
    freshCpu;
    spec;
    music;
    /** Tempo of the CPU's clock; the conductor runs at this times the replay speed. */
    baseBpm = 0;
    /** Beat of cycle 0: later than FIRST_BEAT when the song opens with a count-in. */
    firstBeat = FIRST_BEAT;
    /** The count-in's text (key registers and beats left); gone once the song starts. */
    countIn;
    // Replay: its own clock, so it can change speed and pause.
    replayBeat = 0;
    speedIndex = 1;
    paused = false;
    speedText;
    /** Replay: the clickable thing under the pointer, outlined by `hoverBox`. */
    hovered = null;
    hoverBox;
    speedValue;
    info;
    infoTitle;
    infoBody;
    infoBox;
    infoHint;
    /** The results box is up (Enter / W work). */
    showingResults = false;
    constructor() {
        super('pipeline');
    }
    init(data) {
        const params = new URLSearchParams(location.search);
        // ?guessing in the URL turns tier 4's branch guessing on (dev shortcut).
        this.guessing = data?.guessing ?? params.has('guessing');
        // ?single in the URL plays tier 1, the single-cycle CPU (dev shortcut).
        this.singleCycle = data?.singleCycle ?? params.has('single');
        this.rows = this.singleCycle ? SINGLE_CYCLE_ROWS : ROWS;
        // ?predictor=1-bit or 2-bit adds tier 5-6's predictor (dev shortcut; also play SUM GRID).
        const predictor = data?.predictor ?? params.get('predictor');
        this.predictor = predictor === '1-bit' || predictor === '2-bit' ? predictor : undefined;
        this.programName = data?.program ?? (this.predictor ? 'SUM GRID' : 'SUM ARRAY');
        // ?forwarding in the URL turns tier 3's forwarding on (dev shortcut).
        this.forwarding = data?.forwarding ?? new URLSearchParams(location.search).has('forwarding');
        // ?practice in the URL starts in practice mode (dev shortcut).
        this.practice = data?.practice ?? new URLSearchParams(location.search).has('practice');
        this.watching = data?.watch ?? null;
        // ?contract=standard plays the board's first contract in that section (dev shortcut).
        const devSection = new URLSearchParams(location.search).get('contract');
        this.contract = data?.contract ?? getProgress().board.find((c) => c.section === devSection);
        if (!data?.program && this.contract)
            this.programName = this.contract.program;
        this.paid = data?.paid ?? false;
        this.late = data?.late ?? false;
        // Without the overclocking unlock, the dial stops at the rated clock (?clock=150, a dev shortcut, allows it).
        // Wear is the chip's own; practice always runs on a new chip, so it never overheats.
        const progress = getProgress();
        const devClock = new URLSearchParams(location.search).has('clock');
        this.startMaxDial = data?.maxDial ?? (this.practice ? THERMAL.maxDial : progress.chipMaxDial);
        this.canOverclock = data?.canOverclock ?? (progress.overclocking || devClock);
        // ?cache in the URL fits the L1 cache (dev shortcut).
        this.l1 = data?.cache ?? (hasCache(progress) || new URLSearchParams(location.search).has('cache'));
        this.wasHalted = false;
        this.returnTo = data?.returnTo;
        this.watchDials = data?.watchDials ?? [];
        this.dialRecording = [];
        this.overheatsShown = 0;
        this.recording = [];
        this.conductor = undefined;
        this.notes = new Map();
        this.inFlight = new Map();
        this.fades = [];
        this.transfers = [];
        this.storesSent = new Set();
        this.regTexts = [];
        this.countIn = undefined;
        this.memTexts = [];
        this.cacheTexts = [];
        this.shownLines = Array.from({ length: CACHE_LINES }, () => ({ valid: false, tag: 0 }));
        this.freezeView = undefined;
        this.accesses = new Map();
        this.listing = [];
        this.listingParts = [];
        this.listingStart = 0;
        this.listingScroll = 0;
        this.flashAt = { ALU: -Infinity, MEM: -Infinity, BRANCH: -Infinity, STALL: -Infinity };
        this.keyButtons = {};
        this.lastFrameMs = performance.now();
        this.finished = false;
        this.showingResults = false;
        this.endBeat = undefined;
        this.replayBeat = -0.5;
        this.hovered = null;
        this.speedIndex = 1;
        this.paused = false;
        this.chartOffset = 0;
        this.explained = new Set();
    }
    create() {
        const settings = getSettings();
        this.look = new TerminalLook(this, currentEra());
        if (!(this.sound instanceof Phaser.Sound.WebAudioSoundManager)) {
            this.text(480, 270, 'WEB AUDIO NOT AVAILABLE', 20).setOrigin(0.5);
            return;
        }
        this.ctx = this.sound.context;
        // The song has its own music.
        stopMenuMusic();
        const spec = programByName(this.programName);
        this.spec = spec;
        const easy = settings.relaxed || this.practice;
        const progress = getProgress();
        this.ratedMhz = ratedMhzFor(progress, !this.singleCycle);
        // The song's tempo follows the rated clock, so clock upgrades speed it up.
        const bpm = tempoForClock(this.ratedMhz, easy);
        this.baseBpm = bpm;
        const program = assemble(spec.source, REGISTER_COUNT);
        const cpu = new Cpu(program, 8, spec.memory, REGISTER_COUNT);
        this.listing = this.buildListing(program);
        this.freshCpu = cpu.clone();
        const chip = new Chip(this.ratedMhz, this.startMaxDial, thermalConfig(progress), this.canOverclock);
        // ?clock=150 starts the song overclocked (dev shortcut). Practice always runs at the rated clock.
        const clockParam = Number(new URLSearchParams(location.search).get('clock')) / 100;
        if (clockParam && !this.practice && !this.watching)
            chip.setDial(clockParam);
        const options = { forwarding: this.forwarding, predictor: this.predictor, singleCycle: this.singleCycle, cache: this.l1, mhz: chip.mhz };
        // Songs (and practice) open with a count-in naming the key registers; replays go straight in.
        const countBeats = spec.keys && !this.watching ? Math.ceil((COUNT_IN_SECONDS * bpm * chip.clockRatio) / 60) : 0;
        this.firstBeat = FIRST_BEAT + countBeats;
        this.run = new PipelineRun(cpu, options, this.firstBeat, 60 / bpm, easy ? RELAXED_WINDOWS : NORMAL_WINDOWS, chip);
        this.tempoRatio = chip.clockRatio;
        this.shownRegs = [...this.run.pipeline.regs];
        this.shownMemory = cpu.memory.slice();
        this.drawHighway();
        this.heat = new HeatEffects(this, this.look.era, { x: LANE_X0, y: 0, width: LANES_W, height: this.rows.WB + ROW_GAP / 2 });
        this.drawGauge();
        this.drawPanel(spec);
        this.drawBus();
        this.drawCallout();
        if (this.watching)
            this.drawReplayControls();
        onKeyDown(this, (event) => this.onKey(event));
        this.music = new LayeredMusic(this.ctx);
        this.startConductor();
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
        this.updateKeyButtons(now);
        this.updateFades(now);
        this.updateTransfers(now);
        if (this.watching)
            this.updateHover();
        if (!this.conductor || this.finished)
            return;
        if (this.watching && !this.paused) {
            // Capped so a backgrounded tab doesn't jump the replay ahead.
            this.replayBeat += (Math.min(elapsed, 250) / 1000) * (this.tempo() / 60);
        }
        let beat = this.chartBeat();
        if (this.countIn)
            this.updateCountIn(this.countIn, beat);
        if (this.practice)
            beat = this.holdForPlayer(beat);
        if (this.autoplay || this.watching)
            this.playItself(beat);
        this.advanceTo(beat);
        this.syncNotes(beat, elapsed);
        this.easeRows(elapsed);
        this.easeListing(elapsed);
        this.drawHazard(now);
        this.updateFreeze(beat, now);
        this.updateHeat(now);
        if (this.run.done)
            this.drainAndFinish(beat);
    }
    // ---- input ----
    onKey(event) {
        const key = keyOf(event);
        if (this.watching && !this.finished) {
            if (key === 'ArrowLeft')
                this.setSpeed(this.speedIndex - 1);
            else if (key === 'ArrowRight')
                this.setSpeed(this.speedIndex + 1);
            else if (key === ' ') {
                event.preventDefault();
                if (this.paused)
                    this.resume();
                else
                    this.pause();
            }
        }
        const unit = KEY_UNITS[key] ?? (key === 'K' && this.guessing ? 'BRANCH' : undefined);
        if ((unit || (key === ' ' && !this.singleCycle)) && !this.watching) {
            event.preventDefault();
            const guess = this.guessing && unit === 'BRANCH' ? { guessTaken: key === 'K' } : {};
            const action = unit ? { kind: 'route', unit, ...guess } : { kind: 'stall' };
            this.act(action, this.chartBeat(event.timeStamp));
        }
        else if ((key === 'G' || key === 'H') && !this.watching) {
            this.turnDial(key === 'H' ? 1 : -1);
        }
        else if (key === 'Escape' || key === 'Q') {
            this.scene.start('title');
        }
        else if (key === 'Enter' && this.showingResults && this.practice && this.returnTo) {
            this.scene.start(this.returnTo);
        }
        else if (key === 'Enter' && this.showingResults) {
            // A paid contract goes back to the board for the next one; otherwise play again.
            if (this.contract && this.paid)
                this.scene.start('board');
            else
                this.scene.restart({ practice: false, ...this.hardware() });
        }
        else if (key === 'W' && this.showingResults && this.watching) {
            this.scene.restart({ watch: this.watching, watchDials: this.watchDials, ...this.hardware(), maxDial: this.startMaxDial, canOverclock: this.canOverclock, paid: this.paid, late: this.late });
        }
    }
    /** G / H: one step down or up on the clock dial. The tempo follows from the next beat. */
    turnDial(direction) {
        if (!this.conductor || this.finished)
            return;
        if (this.practice) {
            this.feedback.setText('PRACTICE RUNS AT\nTHE RATED CLOCK');
            return;
        }
        const { chip } = this.run;
        const before = chip.dial;
        const dial = chip.setDial(chip.dial + direction * THERMAL.dialStep);
        const percent = Math.round(dial * 100);
        if (dial === before) {
            const limit = direction > 0 ? `MAX CLOCK: ${percent}%` : `MIN CLOCK: ${percent}%`;
            const why = direction < 0
                ? 'CAN\'T GO FURTHER'
                : chip.maxDial < THERMAL.maxDial && (chip.canOverclock || chip.maxDial <= 1)
                    ? 'CHIP DAMAGED BY HEAT'
                    : !chip.canOverclock
                        ? 'OVERCLOCKING: IN THE SHOP'
                        : 'CAN\'T GO FURTHER';
            this.feedback.setText(`${limit}\n${why}`);
            return;
        }
        const note = chip.halted ? 'CLOCK STOPPED: COOLING' : dial > 1 ? 'OVERCLOCKED: WATCH THE HEAT' : dial < 1 ? 'UNDERCLOCKED: RUNS COOLER' : 'RATED CLOCK';
        this.feedback.setText(`CLOCK ${percent}% (${formatMhz(this.ratedMhz * dial)})\n${note}`);
        this.syncClock();
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
            const waiting = this.run.frozen || this.run.chip.halted;
            if (this.watching && !waiting) {
                // The dial as it was on this cycle of the run (the player may have turned it): it sets the tempo and how long RAM takes.
                const dial = this.watchDials[this.run.steps];
                if (dial !== undefined)
                    this.run.chip.setDial(dial);
                this.syncClock();
            }
            if (this.run.pipeline.stages.ID && !this.run.decided && !waiting) {
                if (this.watching) {
                    const recorded = this.watching[this.run.steps];
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
            // A memory wait passes on its own: only a decision holds the chart.
            if (this.run.pipeline.stages.ID && !this.run.decided && !this.run.frozen) {
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
        if (this.run.pipeline.hazard() || !slot)
            return { kind: 'stall' };
        const taken = this.run.pipeline.branchOutcome();
        return { kind: 'route', unit: unitOf(slot.instr), ...(this.guessing && taken !== undefined ? { guessTaken: taken } : {}) };
    }
    /** Beat of the chart (conductor beat minus practice holds) at a performance.now() time. */
    chartBeat(performanceMs = performance.now()) {
        if (this.watching)
            return this.replayBeat;
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
                this.showForwarding(d.slot);
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
            this.dialRecording.push(report.dial);
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
        if (report.mispredicted !== undefined)
            this.showBranchResult(report.mispredicted, issued?.step?.taken ?? false, report.predicted);
        this.syncRows();
        this.sendResults(report.committed);
        if (report.access)
            this.onAccess(report.access.slot, report.access.access);
        this.refreshPanel();
        this.syncClock();
    }
    /**
     * A load or store reached memory. A hit (or anything that fits in the
     * cycle) is done; a longer trip freezes the song for a few beats while the
     * block comes from RAM, and its line fills when it arrives.
     */
    onAccess(slot, access) {
        if (this.freezeView)
            this.endFreeze(this.freezeView);
        this.accesses.set(slot.seq, access);
        this.lookupText.setText(this.lookupLine(slot, access));
        this.highlight(this.lookupText);
        const line = lineOf(access.address);
        if (access.level === 'L1' || (access.kind === 'store' && access.hit))
            this.flashCacheLine(line);
        if (access.cycles > 1) {
            const total = access.cycles - 1;
            this.freezeView = { start: this.run.dueBeat, beats: freezeBeats(total), base: this.run.memoryBeats, total, slot, access };
            this.markBlock(access.address);
        }
        else {
            this.fillLine(access);
        }
        if (this.practice)
            this.explainAccess(access);
    }
    /** What the last access did, in one line: "lb 5: 0000 01 01 LINE 1 TAG 0 -> HIT". */
    lookupLine(slot, access) {
        const what = `${slot.instr.op} ${access.address}`;
        if (!this.l1) {
            const ns = MEMORY_TIMING.ramNs;
            return access.cycles > 1
                ? `${what} -> RAM: ${ns} ns = ${access.cycles} CYCLES AT ${formatMhz(this.run.chip.mhz)}`
                : `${what} -> RAM: ${ns} ns FITS IN ONE ${formatDuration(1e-6 / this.run.chip.mhz)} CYCLE`;
        }
        const where = `${what}: ${addressBits(access.address)} LINE ${lineOf(access.address)} TAG ${tagOf(access.address)}`;
        if (access.kind === 'store')
            return `${where} -> ${access.hit ? 'HIT, ' : ''}WRITE BUFFER`;
        return `${where} -> ${access.hit ? 'HIT' : `MISS (${MISS_WORDS[access.missKind ?? 'first-use']})`}`;
    }
    /** Practice: the first time each kind of memory trip happens, say what's going on. */
    explainAccess(access) {
        const once = (id, message) => {
            if (this.explained.has(id))
                return;
            this.explained.add(id);
            this.showCallout(message);
        };
        const at = formatMhz(this.run.chip.mhz);
        if (!this.l1) {
            if (access.cycles > 1)
                once('ram', `WAITING ON RAM: memory takes ${MEMORY_TIMING.ramNs} ns,\n${access.cycles} cycles at ${at}. Everything freezes\nuntil it answers. No key needed.`);
        }
        else if (access.kind === 'store') {
            once('buffer', 'STORE: it goes to RAM through the\nwrite buffer, so the CPU never\nwaits for it.');
        }
        else if (access.hit) {
            once('hit', `HIT: byte ${access.address} came in with its\nblock (bytes ${blockOf(access.address) * BLOCK_BYTES}-${blockOf(access.address) * BLOCK_BYTES + 3}). No trip to RAM,\nno waiting.`);
        }
        else if (access.cycles > 1) {
            once('miss', `MISS: line ${lineOf(access.address)} doesn't hold byte ${access.address}.\nIts whole block comes from RAM:\n${access.cycles} cycles at ${at}. Just watch.`);
        }
    }
    /**
     * After each cycle: an overheat stops the clock and wears the chip (saved
     * until it's repaired), and a turned dial changes the tempo.
     */
    syncClock() {
        const { chip } = this.run;
        if (chip.overheats > this.overheatsShown) {
            this.overheatsShown = chip.overheats;
            this.buzz();
            if (!this.watching && !this.practice)
                updateProgress((p) => ({ ...p, chipMaxDial: chip.maxDial }));
        }
        if (chip.clockRatio === this.tempoRatio)
            return;
        this.tempoRatio = chip.clockRatio;
        this.conductor?.setTempo(this.tempo());
    }
    /** Every frame while the clock is stopped: says so, and says when it runs again. */
    showHalt() {
        const { chip } = this.run;
        if (chip.halted) {
            const worn = chip.maxDial <= 1 ? 'CHIP WORN OUT: [G] OR REPAIR' : `CHIP DAMAGED: MAX ${Math.round(chip.maxDial * 100)}%`;
            this.feedback.setText(`OVERHEATED: CLOCK STOPPED\nCOOLING ${Math.round(chip.temperature)}°C -> ${Math.round(chip.resumeAt)}°C\n${worn}`);
        }
        else if (this.wasHalted) {
            this.feedback.setText(`COOLED: CLOCK RUNNING\nAGAIN AT ${Math.round(chip.dial * 100)}%`);
        }
        this.wasHalted = chip.halted;
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
        if (this.singleCycle) {
            // Tier 1: the first time each kind of instruction reaches the line, explain it.
            if (this.explained.has(slot.instr.op))
                return;
            this.explained.add(slot.instr.op);
            const unit = unitOf(slot.instr);
            this.showCallout(`NEW INSTRUCTION: ${format(slot.instr)}\n${describe(slot.instr)}\n${UNIT_ROLES[unit]} -> press ${LANE_KEYS[unit]} (${unit})`);
        }
        else if (hazard && !this.explained.has('hazard')) {
            this.explained.add('hazard');
            this.showCallout(`HAZARD: ${slot.instr.op} needs x${hazard.reg}, but\n${this.whyNotReady(hazard)}\nPress SPACE until the link is gone.`);
        }
        else if (!hazard && this.guessing && this.run.pipeline.branchOutcome() !== undefined && !this.explained.has('guess')) {
            this.explained.add('guess');
            this.showCallout(this.predictor
                ? "THE PREDICTOR'S GUESS GLOWS.\nPress that key to follow it, the other\nto override (J NOT TAKEN, K TAKEN)."
                : 'BRANCH: will it jump back to loop:?\nJ = guess NOT TAKEN, K = guess TAKEN.\nIts glow shows what it did last time.');
        }
        else if (!hazard && !this.explained.has('route')) {
            this.explained.add('route');
            const unit = unitOf(slot.instr);
            this.showCallout(`NO LINK: nothing below is still\ncomputing what it needs.\nRoute it: press ${LANE_KEYS[unit]} (${unit})`);
        }
    }
    /**
     * Why a value isn't ready yet, by where its producer actually is. A load only
     * works out its address in EXECUTE and reads memory in MEMORY; its value exists
     * after that, which is why even forwarding can't hand it over any sooner.
     */
    whyNotReady(hazard) {
        const op = hazard.producer.instr.op;
        const stage = this.run.pipeline.stageOf(hazard.producer.seq);
        if (op === 'lb' && stage === 'EX') {
            return 'lb is in EXECUTE, only working out\nthe address. It reads memory next beat,\ntoo late to forward.';
        }
        if (op === 'lb' && stage === 'MEM')
            return 'lb is reading memory right now;\nthe value exists at the end of this beat.';
        return `${op} (linked below) hasn't finished it.`;
    }
    explainMistake(outcome) {
        const slot = this.run.pipeline.stages.ID;
        const hazard = this.run.pipeline.hazard();
        if (!slot)
            return '';
        const unit = unitOf(slot.instr);
        if (outcome === 'violation' && hazard) {
            return `WAIT! x${hazard.reg} isn't ready:\n${this.whyNotReady(hazard)}\nPress SPACE to stall.`;
        }
        if (outcome === 'wasted-stall')
            return `NO NEED TO WAIT: there's no link.\nRoute it: press ${LANE_KEYS[unit]} (${unit})`;
        return `${describe(slot.instr)}\n${UNIT_ROLES[unit]} -> press ${LANE_KEYS[unit]} (${unit})`;
    }
    // ---- drawing ----
    text(x, y, content, size = 16) {
        return this.add.text(x, y, content, {
            ...textBase(),
            fontSize: `${size}px`,
            color: cssColor(this.look.era.fg),
        });
    }
    drawHighway() {
        const { fg, dim } = this.look.era;
        const bottom = this.rows.WB + ROW_GAP / 2;
        const lines = this.add.graphics().lineStyle(1, dim);
        for (let i = 0; i <= UNITS.length; i++) {
            lines.lineBetween(LANE_X0 + i * LANE_W, 0, LANE_X0 + i * LANE_W, bottom);
        }
        // Faint dividers between the EX / MEM / WB rows (one row on the single-cycle CPU)
        for (const y of new Set([this.rows.EX, this.rows.MEM, this.rows.WB])) {
            lines.lineBetween(LANE_X0, y - ROW_GAP / 2, LANE_X0 + LANES_W, y - ROW_GAP / 2);
        }
        lines.lineBetween(LANE_X0, bottom, LANE_X0 + LANES_W, bottom);
        lines.lineStyle(2, this.look.era.accent).lineBetween(LANE_X0, HIT_Y, LANE_X0 + LANES_W, HIT_Y);
        // Each stage's plain name, with the textbook abbreviation underneath.
        const stageLabel = (y, stage, alpha) => {
            const entry = () => this.stageEntry(stage);
            this.clickable(this.text(LANE_X0 - 10, y - 7, STAGE_NAMES[stage], 13).setOrigin(1, 0.5).setAlpha(alpha), entry);
            this.clickable(this.text(LANE_X0 - 10, y + 8, stage, 11).setOrigin(1, 0.5).setAlpha(alpha * 0.6), entry);
        };
        if (this.singleCycle) {
            // One long beat does all five steps; the result shows just below.
            const label = (y, name, sub, alpha) => {
                this.clickable(this.text(LANE_X0 - 10, y - 7, name, 13).setOrigin(1, 0.5).setAlpha(alpha), () => GLOSSARY.SINGLE_CYCLE);
                this.clickable(this.text(LANE_X0 - 10, y + 8, sub, 11).setOrigin(1, 0.5).setAlpha(alpha * 0.6), () => GLOSSARY.SINGLE_CYCLE);
            };
            label(HIT_Y - PX_PER_BEAT, 'NEXT', 'UP NEXT', 0.6);
            label(HIT_Y, 'EXECUTE', 'ALL 5 STEPS', 1);
            label(this.rows.WB, 'DONE', 'RESULT', 0.8);
        }
        else {
            stageLabel(HIT_Y - PX_PER_BEAT, 'IF', 0.6); // where the next note waits, one beat out
            stageLabel(HIT_Y, 'ID', 1);
            stageLabel(this.rows.EX, 'EX', 0.8);
            stageLabel(this.rows.MEM, 'MEM', 0.8);
            stageLabel(this.rows.WB, 'WB', 0.8);
        }
        for (const unit of UNITS) {
            this.laneFlash[unit] = this.add.rectangle(laneCenter(unit), HIT_Y, LANE_W - 4, 30, fg).setAlpha(0);
            const branchEntry = this.guessing
                ? { title: GLOSSARY.BRANCH.title, body: `${GLOSSARY.BRANCH.body} ${GLOSSARY.PREDICTION.body}` }
                : GLOSSARY.BRANCH;
            const entry = unit === 'ALU' ? GLOSSARY.ALU : unit === 'MEM' ? GLOSSARY.MEMORY_UNIT : branchEntry;
            const edges = this.keyButton(laneCenter(unit), bottom + 18, LANE_W - 16);
            const texts = unit === 'BRANCH' && this.guessing
                ? this.drawGuessKeys(laneCenter(unit), bottom + 18, entry)
                : [this.clickable(this.text(laneCenter(unit), bottom + 18, `${unit} [${LANE_KEYS[unit]}]`).setOrigin(0.5), () => entry)];
            if (edges)
                this.keyButtons[unit] = { ...edges, texts };
        }
        this.laneFlash.STALL = this.add.rectangle(LANE_X0 + LANES_W / 2, bottom + 44, LANES_W - 4, 22, fg).setAlpha(0);
        // A single-cycle CPU never has to wait for a value, so it has no stall.
        if (!this.singleCycle) {
            const edges = this.keyButton(LANE_X0 + LANES_W / 2, bottom + 44, 200);
            const text = this.clickable(this.text(LANE_X0 + LANES_W / 2, bottom + 44, 'STALL [SPACE]').setOrigin(0.5), () => GLOSSARY.STALL);
            if (edges)
                this.keyButtons.STALL = { ...edges, texts: [text] };
        }
        this.hazardLink = this.add.graphics().setDepth(20);
        this.hazardTag = this.text(0, 0, '', 14).setOrigin(0.5).setDepth(21);
        this.memTag = this.text(0, 0, '', 14).setOrigin(0.5).setDepth(21).setVisible(false);
        this.freezeLabel = this.text(0, 0, '', 14).setOrigin(1, 1).setDepth(700).setVisible(false);
        const { era } = this.look;
        this.guessNot = this.text(0, 0, 'J: NOT', 14).setOrigin(0, 0.5).setColor(cssColor(era.notTaken));
        this.guessTaken = this.text(0, 0, 'K: TAKEN', 14).setOrigin(0, 0.5).setColor(cssColor(era.taken));
        // Centered as a whole, so it stays inside the branch lane.
        this.guessNot.setX(-(this.guessNot.width + 10 + this.guessTaken.width) / 2);
        this.guessTaken.setX(this.guessNot.x + this.guessNot.width + 10);
        this.guessTag = this.add.container(0, 0, [this.guessNot, this.guessTaken]).setDepth(21).setVisible(false);
    }
    styleGuess(text, hinted) {
        const color = String(text.style.color);
        text.setAlpha(hinted ? 1 : 0.3).setFontStyle(hinted ? 'bold' : '');
        if (hinted)
            text.setShadow(0, 0, color, 8, true, true);
        else
            text.setShadow(0, 0, color, 0, false, false);
    }
    /** Tier 4's branch lane label, "BRANCH J/K", with each key in the color of the guess it makes. */
    /** The classic desktop: a raised button behind a key's label (nothing in the other eras). */
    keyButton(x, y, w) {
        if (!isClassic(this.look.era))
            return undefined;
        const h = 22;
        const [left, top] = [x - w / 2, y - h / 2];
        const edges = this.add.graphics().fillStyle(this.look.era.bg).fillRect(left, top, w, h);
        bevel(edges, this.look.era, left, top, w, h, true);
        return { edges, x: left, y: top, w, h, pressed: false };
    }
    /** Every frame: a key button is pressed in while its key's flash lasts, like a real button under your finger. */
    updateKeyButtons(now) {
        for (const key of [...UNITS, 'STALL']) {
            const button = this.keyButtons[key];
            const pressed = now - this.flashAt[key] < FLASH_MS;
            if (!button || button.pressed === pressed)
                continue;
            button.pressed = pressed;
            button.edges.clear().fillStyle(this.look.era.bg).fillRect(button.x, button.y, button.w, button.h);
            bevel(button.edges, this.look.era, button.x, button.y, button.w, button.h, !pressed);
            const nudge = pressed ? 1 : -1;
            for (const text of button.texts)
                text.setPosition(text.x + nudge, text.y + nudge);
        }
    }
    drawGuessKeys(x, y, entry) {
        const { era } = this.look;
        const parts = [
            this.text(0, y, 'BRANCH ', 16),
            this.text(0, y, 'J', 16).setColor(cssColor(era.notTaken)).setFontStyle('bold'),
            this.text(0, y, '/', 16),
            this.text(0, y, 'K', 16).setColor(cssColor(era.taken)).setFontStyle('bold'),
        ];
        let cursor = x - parts.reduce((width, part) => width + part.width, 0) / 2;
        for (const part of parts) {
            part.setOrigin(0, 0.5).setX(cursor);
            cursor += part.width;
        }
        this.clickable(parts[0], () => entry);
        return parts;
    }
    /** Top left: the clock and the chip's temperature, with the throttle point marked. */
    drawGauge() {
        const { fg } = this.look.era;
        const x = GAUGE_X;
        this.clickable(this.text(x, 6, 'CLOCK', 11).setOrigin(0.5, 0).setAlpha(0.6), () => GLOSSARY.CLOCK);
        const clock = this.text(x, 20, '', 15).setOrigin(0.5, 0);
        const mode = this.text(x, 40, '', 11).setOrigin(0.5, 0);
        const keys = this.canOverclock && this.startMaxDial > 1 ? '[G] -   [H] +' : '[G] SLOWER';
        this.text(x, 55, this.practice ? 'RATED (PRACTICE)' : keys, 11).setOrigin(0.5, 0).setAlpha(0.7);
        const tube = this.add.rectangle(x, (GAUGE_TOP + GAUGE_BOTTOM) / 2, 18, GAUGE_BOTTOM - GAUGE_TOP).setStrokeStyle(1, fg, 0.6);
        this.clickable(tube, () => GLOSSARY.HEAT);
        const fill = this.add.rectangle(x, GAUGE_BOTTOM - 2, 12, 0, fg).setOrigin(0.5, 1);
        // The overheat mark: moves down as the chip wears (updateHeat).
        const mark = this.add.graphics().lineStyle(1, fg, 0.8).lineBetween(x - 12, 0, x + 12, 0);
        const markText = this.text(x + 14, 0, '', 10).setOrigin(0, 0.5).setAlpha(0.7);
        const temp = this.text(x, GAUGE_BOTTOM + 6, '', 15).setOrigin(0.5, 0);
        this.clickable(temp, () => GLOSSARY.HEAT);
        // A chip worn by overheating can't reach the full overclock.
        const worn = this.text(x, GAUGE_BOTTOM + 24, '', 11).setOrigin(0.5, 0);
        this.gauge = { clock, mode, fill, temp, worn, mark, markText };
    }
    gaugeY(celsius) {
        const t = Phaser.Math.Clamp((celsius - GAUGE_MIN_C) / (GAUGE_MAX_C - GAUGE_MIN_C), 0, 1);
        return GAUGE_BOTTOM - 2 - t * (GAUGE_BOTTOM - GAUGE_TOP - 4);
    }
    /** Every frame: the gauge, and the fire effects growing with the temperature. */
    updateHeat(now) {
        const { chip } = this.run;
        const { fg, fire } = this.look.era;
        const t = chip.temperature;
        const limit = chip.throttleAt;
        const markY = this.gaugeY(limit);
        this.gauge.mark.setY(markY);
        this.gauge.markText.setY(markY).setText(`${Math.round(limit)}`);
        const color = t >= limit - 5 ? fire[2] : t >= limit - 20 ? fire[1] : fg;
        const blink = chip.halted && Math.floor(now / 250) % 2 === 0;
        this.gauge.fill.setFillStyle(color).setSize(12, GAUGE_BOTTOM - 2 - this.gaugeY(t)).setAlpha(blink ? 0.5 : 1);
        this.gauge.temp.setText(`${Math.round(t)}°C`).setColor(cssColor(color));
        this.gauge.clock.setText(formatMhz(Number(chip.mhz.toPrecision(3))));
        const percent = Math.round(chip.dial * 100);
        // Wear only matters once the chip can overclock (without the unlock its maximum is just the rated clock).
        const worn = chip.maxDial < THERMAL.maxDial;
        this.gauge.worn.setText(worn ? `MAX ${Math.round(chip.maxDial * 100)}%` : '').setColor(cssColor(fire[1]));
        this.gauge.mode
            .setText(chip.halted ? 'CLOCK STOPPED' : chip.dial > 1 ? `OVERCLOCK ${percent}%` : chip.dial < 1 ? `UNDERCLOCK ${percent}%` : 'RATED')
            .setColor(cssColor(chip.halted || chip.dial > 1 ? fire[1] : fg));
        if (!this.finished)
            this.heat.update(t, limit, chip.halted, now);
        if (!this.finished && !this.practice)
            this.showHalt();
    }
    tierTitle() {
        if (this.singleCycle)
            return 'TIER 1: SINGLE-CYCLE';
        if (this.predictor)
            return `TIER ${this.predictor === '1-bit' ? 5 : 6}: ${this.predictor.toUpperCase()} PREDICTOR`;
        if (this.guessing)
            return 'TIER 4: BRANCH PREDICTION';
        return this.forwarding ? 'TIER 3: FORWARDING' : 'TIER 2: PIPELINE';
    }
    drawPanel(spec) {
        const mode = this.watching ? '   REPLAY' : '';
        // A contract's client goes on top; the program's own name labels its listing.
        this.text(PANEL_X, 4, `${this.tierTitle()}   ${spec.client ?? spec.name}${mode}`, 14).setAlpha(0.7);
        const { era } = this.look;
        const listingTitle = spec.client ? `PROGRAM: ${spec.name}` : 'PROGRAM';
        const programTitle = panelBox(this, BOX_X, LISTING_TOP - 10, BOX_W, LISTING_ROWS * LISTING_LINE + 16, listingTitle, era);
        this.clickable(programTitle, () => GLOSSARY.PROGRAM);
        this.listingLayer = this.add.container(0, 0);
        if (isSmooth()) {
            const window = this.make.graphics({}, false).fillRect(BOX_X, LISTING_TOP - 1, BOX_W, LISTING_ROWS * LISTING_LINE);
            this.listingLayer.setMask(window.createGeometryMask());
        }
        let y = LISTING_TOP + LISTING_ROWS * LISTING_LINE + 16;
        const registersTitle = panelBox(this, BOX_X, y, BOX_W, 4 * LINE + 20, 'REGISTERS  (<- STILL COMPUTING)', era);
        this.clickable(registersTitle, () => GLOSSARY.REGISTERS);
        y += 12;
        // A size smaller than the rest of the panel, so a key register's tag fits beside "<-MEM".
        const keyRegs = new Set((this.spec.keys ?? []).map((key) => key.reg));
        for (let r = 0; r < REGISTER_COUNT; r++) {
            const column = Math.floor(r / 4);
            const row = this.text(PANEL_X + column * 210, y + (r % 4) * LINE, '', 14).setAlpha(0.8);
            if (keyRegs.has(r))
                row.setFontStyle('bold');
            this.regTexts.push(this.clickable(row, () => this.registerEntry(r)));
        }
        y += 4 * LINE + 18;
        // Memory, 8 bytes (two cache blocks) per row; the L1 cache sits beside it once it's bought.
        const memoryW = this.l1 ? MEMORY_W_CACHED : BOX_W;
        this.clickable(panelBox(this, BOX_X, y, memoryW, MEMORY_ROWS * LINE + 20, 'MEMORY', era), () => this.memoryEntry());
        if (this.l1) {
            const cacheX = BOX_X + memoryW + 6;
            this.clickable(panelBox(this, cacheX, y, BOX_W - memoryW - 6, MEMORY_ROWS * LINE + 20, 'L1: LINE TAG DATA', era), () => GLOSSARY.CACHE);
            for (let line = 0; line < CACHE_LINES; line++) {
                this.cacheTexts.push(this.clickable(this.text(cacheX + 8, y + 12 + line * LINE, '', 13).setAlpha(0.8), () => this.cacheLineEntry(line)));
            }
        }
        y += 12;
        for (let row = 0; row < MEMORY_ROWS; row++) {
            this.memTexts.push(this.clickable(this.text(PANEL_X, y + row * LINE, '', 14).setAlpha(0.8), () => this.memoryEntry()));
        }
        y += MEMORY_ROWS * LINE + 12;
        this.lookupText = this.clickable(this.text(PANEL_X, y, this.l1 ? 'LOADS LOOK IN THE CACHE FIRST' : 'LOADS AND STORES GO TO RAM', 13).setAlpha(0.8), () => this.l1 ? GLOSSARY.LOOKUP : GLOSSARY.RAM);
        y += 22;
        this.statsText = this.clickable(this.text(PANEL_X, y, '', 14).setLineSpacing(3), () => GLOSSARY.STATS);
        y += 36;
        this.throughputText = this.clickable(this.text(PANEL_X, y, '', 14), () => GLOSSARY.THROUGHPUT);
        y += 22;
        const intro = this.watching ? 'WATCHING YOUR RUN' : this.practice ? 'PRACTICE:\nNOTES WAIT FOR YOU' : 'GET READY...';
        this.feedback = this.text(PANEL_X, y, intro, 18).setLineSpacing(4);
        if (this.firstBeat > FIRST_BEAT) {
            // The count-in: the key registers pulse in the panel while the text says what they do.
            this.feedback.setVisible(false);
            this.countIn = this.text(PANEL_X, y, this.countInText(this.firstBeat), 14).setLineSpacing(4);
            for (const { reg } of this.spec.keys ?? []) {
                this.tweens.add({ targets: this.regTexts[reg], alpha: 0.35, duration: 30000 / this.tempo(), yoyo: true, repeat: -1 });
            }
        }
        if (this.watching) {
            // The program listing as one click target.
            this.clickable(this.add.zone(PANEL_X, LISTING_TOP, 400, LISTING_ROWS * LISTING_LINE).setOrigin(0), () => GLOSSARY.PROGRAM);
            return; // replay controls go where QUIT is
        }
        this.text(PANEL_X, 512, '[Q] QUIT')
            .setAlpha(0.5)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.scene.start('title'));
    }
    countInText(beatsLeft) {
        const keys = (this.spec.keys ?? []).map((key) => `x${key.reg} = ${key.tag}: ${key.about}`);
        return [`GET READY: ${beatsLeft}`, ...keys].join('\n');
    }
    /** Counts the beats down, then hands the panel over to the song. */
    updateCountIn(countIn, beat) {
        const left = Math.ceil(this.firstBeat - beat);
        if (left > 0) {
            countIn.setText(this.countInText(left));
            return;
        }
        countIn.destroy();
        this.countIn = undefined;
        for (const { reg } of this.spec.keys ?? []) {
            this.tweens.killTweensOf(this.regTexts[reg]);
            this.regTexts[reg].setAlpha(1);
        }
        if (!this.practice)
            this.feedback.setText('GO!');
        this.feedback.setVisible(true);
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
        // The modern era slides the lines to their new place; while they move, it also draws one line above and below the window.
        if (isSmooth())
            this.listingScroll += (start - this.listingStart) * LISTING_LINE;
        this.listingStart = start;
        this.listingLayer.setY(this.listingScroll);
        const sliding = this.listingScroll !== 0;
        const first = sliding ? Math.max(0, start - 1) : start;
        this.listing.slice(first, start + LISTING_ROWS + (sliding ? 1 : 0)).forEach((line, i) => {
            const y = LISTING_TOP + (first + i - start) * LISTING_LINE;
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
                this.listingParts.push(this.text(PANEL_X + 250, y, stages.map((st) => this.stageTag(st)).join(' '), 14).setAlpha(0.8));
            if (this.predictor)
                this.drawPredictorState(line.pc, y);
            else if (this.guessing)
                this.drawHistory(line.pc, y);
        });
        this.listingLayer.add(this.listingParts);
        // Hint that the program continues beyond the window.
        if (start > 0)
            this.listingParts.push(this.text(PANEL_X + 380, LISTING_TOP, '^', 14).setAlpha(0.6));
        if (start + LISTING_ROWS < this.listing.length) {
            this.listingParts.push(this.text(PANEL_X + 380, LISTING_TOP + (LISTING_ROWS - 1) * LISTING_LINE, 'v', 14).setAlpha(0.6));
        }
    }
    /** Slides the listing's lines the rest of the way to where they belong. */
    easeListing(elapsed) {
        if (this.listingScroll === 0)
            return;
        this.listingScroll *= Math.exp(-elapsed / 70);
        if (Math.abs(this.listingScroll) < 0.2)
            this.listingScroll = 0;
        this.listingLayer.setY(this.listingScroll);
    }
    /** Tier 4: after a branch in the listing, its last 4 outcomes (T taken, N not taken), oldest first. */
    drawHistory(pc, y) {
        const outcomes = this.run.pipeline.history.get(pc)?.slice(-4) ?? [];
        outcomes.forEach((taken, i) => {
            const letter = this.text(PANEL_X + 192 + i * 14, y, taken ? 'T' : 'N', 14).setColor(cssColor(hintColor(this.look.era, taken)));
            this.listingParts.push(this.clickable(letter, () => GLOSSARY.HISTORY));
        });
    }
    /**
     * Tiers 5-6: after a branch in the listing, its predictor entry: N T (1-bit)
     * or N n t T (2-bit: strong and weak), with the current state lit.
     */
    drawPredictorState(pc, y) {
        const state = this.run.pipeline.predictorState(pc);
        if (state === undefined)
            return;
        const cells = this.predictor === '1-bit' ? ['N', 'T'] : ['N', 'n', 't', 'T'];
        cells.forEach((cell, i) => {
            const taken = i >= cells.length / 2;
            const text = this.text(PANEL_X + 192 + i * 14, y, cell, 14).setColor(cssColor(hintColor(this.look.era, taken)));
            text.setAlpha(i === state ? 1 : 0.25).setFontStyle(i === state ? 'bold' : '');
            this.listingParts.push(this.clickable(text, () => this.predictorEntry(pc)));
        });
    }
    /**
     * The wires results travel on: from the MEM and WB rows across to a vertical
     * bus, and from the bus into each register row and memory row.
     */
    drawBus() {
        const wires = this.add.graphics().lineStyle(1, this.look.era.fg, 0.25);
        const lanesRight = LANE_X0 + LANES_W;
        if (!this.singleCycle)
            wires.lineBetween(lanesRight, this.rows.MEM, BUS_X, this.rows.MEM);
        wires.lineBetween(lanesRight, this.rows.WB, BUS_X, this.rows.WB);
        const rows = [...this.regTexts.slice(0, 4), ...this.memTexts].map((t) => t.y + 9);
        wires.lineBetween(BUS_X, Math.min(...rows), BUS_X, this.rows.WB);
        for (const y of rows)
            wires.lineBetween(BUS_X, y, BOX_X, y);
        this.busGlow = this.add.graphics().setDepth(690);
        const top = Math.min(...rows);
        this.clickable(this.add.zone(BUS_X - 8, top, 16, this.rows.WB - top).setOrigin(0), () => GLOSSARY.BUS);
    }
    drawCallout() {
        const { fg, bg } = this.look.era;
        const box = this.add.rectangle(0, 0, LANES_W - 8, 150, bg).setStrokeStyle(2, fg);
        this.calloutText = this.text(0, 0, '').setOrigin(0.5).setAlign('center').setLineSpacing(8);
        const edges = this.raisedEdges(0, 0, LANES_W - 8, 150);
        const shadow = isDos(this.look.era) ? [dropShadow(this.add.graphics(), -(LANES_W - 8) / 2, -75, LANES_W - 8, 150, 8)] : [];
        this.callout = this.add.container(LANE_X0 + LANES_W / 2, 170, [...shadow, box, ...(edges ? [edges] : []), this.calloutText]).setDepth(600).setVisible(false);
    }
    showCallout(message) {
        this.calloutText.setText(message);
        if (!this.callout.visible) {
            this.tweens.killTweensOf(this.callout);
            this.callout.setAlpha(1).setY(170);
            this.glideIn([this.callout], 8);
        }
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
        const tags = new Map((this.spec.keys ?? []).map((key) => [key.reg, key.tag]));
        this.shownRegs.forEach((value, r) => {
            const where = pending.get(r);
            const tag = tags.get(r);
            this.regTexts[r]
                .setText(`x${r}`.padEnd(4) + `0x${hex(value)} ${String(value).padStart(3)}` + (tag ? ` ${tag}` : '') + (where ? ` <-${where}` : ''))
                .setAlpha(where || tag ? 1 : 0.8);
        });
        this.memTexts.forEach((row, i) => {
            // A gap between the row's two blocks.
            const block = (b) => Array.from(this.shownMemory.subarray(b * BLOCK_BYTES, (b + 1) * BLOCK_BYTES), hex).join(' ');
            row.setText(`${hex(i * 8)}: ${block(2 * i)}  ${block(2 * i + 1)}`);
        });
        this.shownLines.forEach((line, i) => {
            // Write-through keeps a cached block the same as memory, so its bytes are memory's.
            const block = line.tag * CACHE_LINES + i;
            const data = line.valid ? Array.from(this.shownMemory.subarray(block * BLOCK_BYTES, (block + 1) * BLOCK_BYTES), hex).join(' ') : '-- -- -- --';
            this.cacheTexts[i]?.setText(`${i} ${line.valid ? bin(line.tag, 4) : '----'} ${data}`);
        });
        const filled = Math.round(this.run.throughput * 8);
        this.throughputText.setText(`THROUGHPUT [${'#'.repeat(filled)}${'.'.repeat(8 - filled)}] ${this.run.throughput.toFixed(2)}`);
        const waited = pipeline.memoryCycles > 0 ? `  WAITING ON RAM ${pipeline.memoryCycles}` : '';
        this.statsText.setText(`CYCLE ${pipeline.cycle}  DONE ${pipeline.instructions}  CPI ${pipeline.cpi.toFixed(2)}  STREAK ${this.run.streak}\n` +
            `STALLS ${pipeline.stalls}  FLUSHED ${pipeline.flushed}${waited}`);
    }
    /** Lights a cache line as it's used or filled. */
    flashCacheLine(line) {
        const text = this.cacheTexts[line];
        if (!text)
            return;
        this.highlight(text);
        const mark = this.add.rectangle(text.x - 4, text.y + text.height / 2, text.width + 8, text.height + 2).setOrigin(0, 0.5);
        mark.setStrokeStyle(1, this.look.era.fg).setDepth(690);
        this.fades.push({ parts: [mark], start: performance.now(), duration: 700 });
    }
    /** Outlines the 4-byte block holding `address` in the MEMORY box while it's fetched. */
    markBlock(address) {
        const row = this.memTexts[Math.floor(address / 8)];
        if (!row?.text)
            return;
        const charW = row.width / row.text.length;
        const first = blockOf(address) % 2 === 0 ? 4 : 17; // "00: " then 4 bytes and the gap
        const mark = this.add.rectangle(row.x + first * charW - 3, row.y + row.height / 2, 11 * charW + 6, row.height + 2).setOrigin(0, 0.5);
        mark.setStrokeStyle(1, this.look.era.fg).setDepth(690);
        this.fades.push({ parts: [mark], start: performance.now(), duration: Math.max(700, this.freezeSeconds() * 1000) });
    }
    /** How long the current memory wait lasts on the real clock. */
    freezeSeconds() {
        return (this.freezeView?.beats ?? 0) * this.beatSeconds();
    }
    highlight(text) {
        if (!text)
            return;
        this.tweens.killTweensOf(text);
        text.setAlpha(1);
        // Key registers stay bright; everything else settles back to dim.
        const keyRow = this.spec.keys?.some(({ reg }) => this.regTexts[reg] === text);
        if (!keyRow)
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
            this.transfer(committed, this.rows.WB, `x${rd}=${value}`, target.y + 9, () => {
                this.shownRegs[rd] = value;
                this.refreshPanel();
                this.highlight(target);
            });
        }
        // Stores leave from MEMORY; on the single-cycle CPU, from the finished instruction.
        const store = this.singleCycle ? this.run.pipeline.stages.WB : this.run.pipeline.stages.MEM;
        const address = store?.step?.stored;
        if (store && address !== undefined && !this.storesSent.has(store.seq)) {
            this.storesSent.add(store.seq);
            const value = this.run.pipeline.cpu.memory[address];
            const target = this.memTexts[Math.floor(address / 8)];
            this.transfer(store, this.singleCycle ? this.rows.WB : this.rows.MEM, `[${address}]=${value}`, target.y + 9, () => {
                this.shownMemory[address] = value;
                this.refreshPanel();
                this.highlight(target);
                this.markByte(target, address % 8);
            });
        }
    }
    /**
     * Starts a value along the bus: right along its row, up the bus, then to the
     * box's edge beside its line. It stops there, so it never covers the panel's
     * text; the line lights up as the value lands.
     */
    transfer(slot, rowY, label, toY, land) {
        const startX = laneCenter(unitOf(slot.instr)) + NOTE_W / 2;
        const path = [[startX, rowY], [BUS_X, rowY], [BUS_X, toY], [BOX_X, toY]];
        // Label rides up and to the left of the moving point, outside the panel.
        const text = this.text(startX, rowY, label, 14).setOrigin(1, 1).setDepth(700);
        // Fits inside one beat, so values never pile up on the bus.
        const duration = Math.min(600, this.beatSeconds() * 1000 * 0.8);
        this.transfers.push({ text, path, start: performance.now(), duration, land });
    }
    /** Outlines the byte a store just wrote in a memory row, fading out. */
    markByte(row, column) {
        const charW = row.width / Math.max(1, row.text.length);
        // "00: " then 3 characters per byte, and a gap after the first block.
        const x = row.x + (4 + column * 3 + (column >= BLOCK_BYTES ? 1 : 0) + 1) * charW;
        const mark = this.add.rectangle(x, row.y + row.height / 2, 3 * charW, row.height + 2).setStrokeStyle(1, this.look.era.fg).setDepth(690);
        this.fades.push({ parts: [mark], start: performance.now(), duration: 700 });
    }
    /**
     * Tier 3: when an instruction issues with a value forwarded from EX or MEM,
     * that value jumps up a lit wire from the producer's note into it.
     */
    showForwarding(consumer) {
        const forwarded = this.run.pipeline.forwardedFrom();
        const note = this.notes.get(noteKey(consumer));
        if (!note)
            return;
        for (const { reg, producer } of forwarded) {
            const from = this.inFlight.get(producer.seq);
            if (!from)
                continue;
            const midY = (from.box.y + note.box.y) / 2;
            const x = note.box.x + 34;
            const path = [
                [from.box.x + 34, from.box.y - NOTE_H / 2],
                [from.box.x + 34, midY],
                [x, midY],
                [x, note.box.y + NOTE_H / 2],
            ];
            const text = this.text(path[0][0], path[0][1], `x${reg}=${producer.value}`, 14).setOrigin(1, 1).setDepth(700);
            const duration = Math.min(350, this.beatSeconds() * 1000 * 0.45);
            this.transfers.push({ text, path, start: performance.now(), duration, land: () => { } });
        }
        if (this.practice && forwarded.length > 0 && !this.explained.has('forward')) {
            this.explained.add('forward');
            const { reg, producer } = forwarded[0];
            this.showCallout(`FORWARDED: x${reg} came straight from\n${producer.instr.op} (watch the wire light up).\nNo stall needed!`);
        }
    }
    /** Moves values along the bus on the real clock, lighting the wire behind them. */
    updateTransfers(now) {
        this.busGlow.clear();
        this.transfers = this.transfers.filter((transfer) => {
            const t = Math.min(1, (now - transfer.start) / transfer.duration);
            const travelled = alongPath(transfer.path, 1 - (1 - t) ** 2);
            const [x, y] = travelled.at(-1) ?? transfer.path[0];
            // Hidden until it has left its note, so it doesn't sit on top of the note's result.
            transfer.text.setPosition(x - 4, y - 2).setVisible(t > 0.15);
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
    /**
     * Beats the song has spent frozen waiting for memory, up to `beat`. Notes
     * are placed on a clock that stops during those beats, so they hold still.
     */
    frozenBeats(beat) {
        const view = this.freezeView;
        if (!view)
            return this.run.memoryBeats;
        return view.base + Phaser.Math.Clamp(beat - view.start, 0, view.beats);
    }
    /** Keeps one falling note per upcoming instruction: ID, IF, then the next fetches. */
    syncNotes(chartBeat, elapsed) {
        const pipeline = this.run.pipeline;
        const { ID, IF } = pipeline.stages;
        // On the notes' clock, which stops while the pipeline waits for memory.
        const beat = chartBeat - this.frozenBeats(chartBeat);
        const due = this.run.dueBeat - this.run.memoryBeats;
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
            const target = due + k;
            const view = this.notes.get(key) ?? this.createNote(key, slot, target);
            view.target = target;
            view.due += (view.target - view.due) * Math.min(1, elapsed / 60);
            if (k === 0 && beat >= view.due)
                view.pinned = true;
            const y = k === 0 && view.pinned ? HIT_Y : HIT_Y - (view.due - beat) * PX_PER_BEAT;
            view.box.setY(y);
            view.label.setY(y);
            this.syncHint(view, slot);
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
                block = { ...(note ?? this.createBlock(slot, HIT_Y)), rowY: this.rows[stage] };
                // Decided: the branch's hint has done its job, and a classic button stays pressed in.
                block.hint?.view.destroy();
                block.hint = undefined;
                if (block.edges)
                    bevel(block.edges.clear(), this.look.era, -NOTE_W / 2, -NOTE_H / 2, NOTE_W, NOTE_H, false);
                block.box.setY(HIT_Y);
                block.label.setY(HIT_Y).setAlpha(0.85);
                this.inFlight.set(slot.seq, block);
            }
            block.rowY = this.rows[stage];
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
            // Tier 4: a branch on the line asks for a guess.
            const asking = this.guessing && waiting && !this.run.decided && pipeline.branchOutcome() !== undefined;
            this.hazardTag.setVisible(false);
            this.guessTag.setVisible(Boolean(asking));
            if (asking) {
                // Above the hint's badge. The hinted guess (the predictor's, on tiers 5-6) glows;
                // the other one (an override) is dim.
                this.guessTag.setPosition(waiting.box.x, waiting.box.y - NOTE_H / 2 - 20);
                const hinted = waiting.hint?.taken;
                this.styleGuess(this.guessNot, hinted === false);
                this.styleGuess(this.guessTaken, hinted === true);
            }
            waiting?.box.setStrokeStyle(1, fg, 0.6);
            return;
        }
        this.guessTag.setVisible(false);
        waiting.box.setStrokeStyle(2, fg, 0.55 + 0.45 * Math.sin(now / 90));
        this.hazardTag
            .setText(`x${hazard.reg} NOT READY`)
            .setPosition(waiting.box.x, waiting.box.y - NOTE_H / 2 - (waiting.hint ? 20 : 12)) // clear of a hint's badge
            .setVisible(true);
        const producer = this.inFlight.get(hazard.producer.seq);
        if (producer) {
            producer.box.setStrokeStyle(2, fg, 1);
            this.hazardLink
                .lineStyle(2, fg, 0.9)
                .lineBetween(waiting.box.x, waiting.box.y + NOTE_H / 2, producer.box.x, producer.box.y - NOTE_H / 2);
        }
    }
    /**
     * Every frame of a memory wait: the waiting note pulses, the request runs
     * up the bus to memory and the data comes back, and a counter rolls up the
     * real cycles. When it's over, a missed block fills its cache line.
     */
    updateFreeze(beat, now) {
        this.memTag.setVisible(false);
        this.freezeLabel.setVisible(false);
        const view = this.freezeView;
        if (!view)
            return;
        if (!this.run.frozen && beat >= view.start + view.beats) {
            this.endFreeze(view);
            return;
        }
        const t = Phaser.Math.Clamp((beat - view.start) / view.beats, 0, 1);
        const { fg } = this.look.era;
        const { access } = view;
        const block = this.inFlight.get(view.slot.seq);
        if (block) {
            block.box.setStrokeStyle(2, fg, 0.55 + 0.45 * Math.sin(now / 90));
            // Tier 1: the finished load waits in the DONE row; its result only counts once the data arrives.
            block.result?.setVisible(false);
            const tag = this.l1 ? `MISS -> RAM` : access.kind === 'store' ? 'WRITING TO RAM' : 'WAITING ON RAM';
            this.memTag.setText(tag).setPosition(block.box.x, block.box.y - NOTE_H / 2 - 10).setVisible(true);
            // The request goes up the bus to memory, then the data comes back down.
            const row = this.memTexts[Math.floor(access.address / 8)];
            const rowY = row ? row.y + row.height / 2 : this.rows.MEM;
            const path = [[block.box.x + NOTE_W / 2, block.box.y], [BUS_X, block.box.y], [BUS_X, rowY], [BOX_X, rowY]];
            const back = t >= 0.5;
            const travelled = back ? alongPath([...path].reverse(), 2 * t - 1) : alongPath(path, 2 * t);
            this.busGlow.lineStyle(2, fg, 0.9).strokePoints(travelled.map(([x, y]) => new Phaser.Math.Vector2(x, y)));
            const [x, y] = travelled.at(-1) ?? path[0];
            const value = this.shownMemory[access.address];
            const label = access.kind === 'store' ? (back ? 'DONE' : `[${access.address}]`) : back ? `=${value}` : `[${access.address}]?`;
            this.freezeLabel.setText(label).setPosition(x - 4, y - 2).setVisible(true);
        }
        if (this.run.chip.halted)
            return; // the overheat message wins
        const counted = Math.min(view.total, Math.round(view.total * t));
        const why = this.l1 ? `MISS: ${MISS_WORDS[access.missKind ?? 'first-use']}` : access.kind === 'store' ? 'STORE: WRITING TO RAM' : 'LOAD: WAITING ON RAM';
        const ns = MEMORY_TIMING.ramNs + (this.l1 ? MEMORY_TIMING.l1Ns : 0);
        this.feedback.setText(`${why}\n${counted} / ${view.total} CYCLES FROZEN\n${ns} ns = ${access.cycles} AT ${formatMhz(this.run.chip.mhz)}`);
    }
    /** The wait is over: a missed block lands in its cache line, and the song moves again. */
    endFreeze(view) {
        this.freezeView = undefined;
        this.inFlight.get(view.slot.seq)?.result?.setVisible(true);
        this.fillLine(view.access);
        if (!this.practice && !this.run.chip.halted)
            this.feedback.setText(this.l1 ? 'BLOCK ARRIVED:\nGO!' : 'DATA ARRIVED:\nGO!');
        this.refreshPanel();
    }
    /** A load that missed brings its block into its line (what the panel shows once it has arrived). */
    fillLine(access) {
        if (!this.l1 || access.kind !== 'load' || access.hit)
            return;
        const line = lineOf(access.address);
        this.shownLines[line] = { valid: true, tag: tagOf(access.address) };
        this.flashCacheLine(line);
    }
    createBlock(slot, y) {
        const { fg, bg, syntax } = this.look.era;
        const x = laneCenter(unitOf(slot.instr));
        const box = this.add.rectangle(x, y, NOTE_W, NOTE_H, bg).setStrokeStyle(1, fg, 0.6);
        const label = codeLine(this, x, y, tokens(slot.instr, true), syntax, { maxWidth: NOTE_W - 8, center: true });
        this.clickable(box, () => this.noteEntry(slot));
        // DOS: a solid black shadow, moving with the note.
        if (isDos(this.look.era))
            label.addAt(dropShadow(this.add.graphics(), -NOTE_W / 2, -NOTE_H / 2, NOTE_W, NOTE_H, 5), 0);
        if (!isClassic(this.look.era))
            return { box, label };
        // A button on the classic desktop: raised until it's played.
        const edges = bevel(this.add.graphics(), this.look.era, -NOTE_W / 2, -NOTE_H / 2, NOTE_W, NOTE_H, true);
        label.addAt(edges, 0);
        return { box, label, edges };
    }
    /** Raised 3D edges around a centered box (the classic desktop's dialogs); nothing in the other eras. */
    raisedEdges(x, y, w, h) {
        return isClassic(this.look.era) ? bevel(this.add.graphics(), this.look.era, x - w / 2, y - h / 2, w, h, true) : undefined;
    }
    /**
     * Rings a branch note in the color of its hint. Tier 4: what it did last time.
     * Tiers 5-6: the predictor's guess. Redrawn when that changes, e.g. the next
     * round's branch is on screen when this one is decided.
     */
    syncHint(view, slot) {
        const hint = this.hintFor(slot);
        if (!hint || (view.hint?.taken === hint.taken && view.hint.sure === hint.sure))
            return;
        view.hint?.view.destroy();
        const ring = branchHint(this, NOTE_W, NOTE_H, hint.taken, hint.sure, this.look.era);
        view.label.add(ring);
        view.hint = { ...hint, view: ring };
    }
    hintFor(slot) {
        if (this.predictor)
            return this.run.pipeline.guessFor(slot);
        if (!this.guessing)
            return undefined;
        const hint = this.run.pipeline.hint(slot.pc);
        return hint && { taken: hint.taken, sure: hint.seen };
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
    // ---- replay: speed, pause, and click-to-learn ----
    speed() {
        return this.watching ? REPLAY_SPEEDS[this.speedIndex] : 1;
    }
    /** Seconds per beat as currently played (replays may run faster or slower). */
    beatSeconds() {
        return this.run.secondsPerBeat / this.speed();
    }
    /** Beats per minute right now: the tier's tempo, sped up by overclocking, times the replay speed. */
    tempo() {
        return this.baseBpm * this.run.chip.clockRatio * this.speed();
    }
    /** (Re)starts the beat clock and music; replays restart it when the speed changes. */
    startConductor() {
        this.conductor?.stop();
        const conductor = new Conductor(this.ctx, this.tempo());
        conductor.offset = getSettings().offset;
        conductor.clickVolume = this.paused ? 0 : 0.04;
        let wasFrozen = false;
        conductor.onBeat = (beat, time) => {
            if (beat <= this.firstBeat || this.finished || this.paused)
                return;
            const spb = 60 / conductor.bpm;
            if (this.run.frozen) {
                // Waiting for memory: a low drone, and fast ticks for the cycles going by.
                const ticks = Math.min(8, Math.ceil((this.freezeView?.total ?? 1) / (this.freezeView?.beats ?? 1)));
                blip(this.ctx, 55, time, spb * 0.95, 'sawtooth', 0.05);
                for (let i = 0; i < ticks; i++)
                    blip(this.ctx, 2400, time + (i * spb) / ticks, 0.015, 'square', 0.03);
                wasFrozen = true;
                return;
            }
            if (wasFrozen) {
                // The data arrived: a bright double click, and the song goes on.
                blip(this.ctx, 1320, time, 0.06, 'square', 0.07);
                blip(this.ctx, 1760, time + 0.07, 0.06, 'square', 0.07);
                wasFrozen = false;
            }
            if (!this.run.chip.halted)
                this.music.playBeat(beat - this.firstBeat - 1, time, spb, this.run.pipeline.occupancy);
        };
        conductor.start();
        this.conductor = conductor;
    }
    setSpeed(index) {
        const next = Phaser.Math.Clamp(index, 0, REPLAY_SPEEDS.length - 1);
        if (next === this.speedIndex)
            return;
        this.speedIndex = next;
        this.startConductor();
        this.renderReplayControls();
    }
    pause() {
        this.paused = true;
        if (this.conductor)
            this.conductor.clickVolume = 0;
        this.renderReplayControls();
    }
    resume() {
        this.paused = false;
        if (this.conductor)
            this.conductor.clickVolume = 0.04;
        this.info.setVisible(false);
        this.renderReplayControls();
    }
    /** In replays, hovering `target` outlines it and clicking it pauses and explains what it is. */
    clickable(target, entry) {
        if (!this.watching)
            return target;
        target
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.explain(entry()))
            .on('pointerover', () => (this.hovered = target))
            .on('pointerout', () => {
            if (this.hovered === target)
                this.hovered = null;
        });
        return target;
    }
    /** Outlines whatever the pointer is over; follows it if it moves (falling notes). */
    updateHover() {
        const target = this.hovered;
        if (!target?.active || !target.visible) {
            this.hovered = null;
            this.hoverBox?.setVisible(false);
            return;
        }
        const bounds = target.getBounds();
        this.hoverBox.setPosition(bounds.centerX, bounds.centerY).setSize(bounds.width + 10, bounds.height + 6).setVisible(true);
    }
    explain(entry) {
        if (this.finished)
            return;
        this.pause();
        this.infoTitle.setText(entry.title);
        this.infoBody.setText(entry.body);
        // Grow the box to fit the text: title, body, then the hint, top to bottom.
        this.infoTitle.setY(26);
        this.infoBody.setY(48);
        this.infoHint.setY(this.infoBody.y + this.infoBody.height + 22);
        this.infoBox.setSize(LANES_W - 8, this.infoHint.y + 22);
        this.info.setVisible(true);
    }
    drawReplayControls() {
        const { fg, bg } = this.look.era;
        // [<] 2x [>]   SPEED   [SPACE] PAUSE
        const slower = this.text(PANEL_X, 498, '[<]', 15).setInteractive({ useHandCursor: true });
        slower.on('pointerdown', () => this.setSpeed(this.speedIndex - 1));
        this.speedValue = this.text(PANEL_X + 54, 498, '', 15).setOrigin(0.5, 0);
        const faster = this.text(PANEL_X + 80, 498, '[>]', 15).setInteractive({ useHandCursor: true });
        faster.on('pointerdown', () => this.setSpeed(this.speedIndex + 1));
        this.speedText = this.text(PANEL_X + 124, 498, '', 15);
        this.text(PANEL_X, 520, 'CLICK ANYTHING TO LEARN WHAT IT IS   [Q] QUIT', 13).setAlpha(0.6);
        this.hoverBox = this.add.rectangle(0, 0, 10, 10, fg, 0.12).setStrokeStyle(1.5, fg, 1).setDepth(640).setVisible(false);
        // Positions inside the box are set in explain(), once the text is known.
        const box = this.add.rectangle(0, 0, LANES_W - 8, 200, bg).setOrigin(0.5, 0).setStrokeStyle(2, fg);
        this.infoBox = box;
        this.infoTitle = this.text(0, 0, '', 17).setOrigin(0.5).setFontStyle('bold');
        this.infoBody = this.text(0, 0, '', 15).setOrigin(0.5, 0).setAlign('center').setLineSpacing(6);
        this.infoBody.setWordWrapWidth(LANES_W - 40);
        this.infoHint = this.text(0, 0, 'CLICK OR PRESS SPACE TO CONTINUE', 13).setOrigin(0.5).setAlpha(0.6);
        this.info = this.add
            .container(LANE_X0 + LANES_W / 2, 70, [box, this.infoTitle, this.infoBody, this.infoHint])
            .setDepth(650)
            .setVisible(false);
        box.setInteractive().on('pointerdown', () => this.resume());
        // A click on empty space also resumes.
        this.input.on('pointerdown', (_pointer, over) => {
            if (over.length === 0 && this.paused)
                this.resume();
        });
        this.renderReplayControls();
    }
    renderReplayControls() {
        this.speedValue?.setText(`${REPLAY_SPEEDS[this.speedIndex]}x`);
        this.speedText?.setText(`SPEED   [SPACE] ${this.paused ? 'RESUME' : 'PAUSE'}`);
    }
    stageEntry(stage) {
        const entry = GLOSSARY[stage];
        if (stage === 'EX' && this.forwarding)
            return { title: entry.title, body: `${entry.body} ${GLOSSARY.FORWARDING.body}` };
        return entry;
    }
    /** A stage's tag in the listing; the single-cycle CPU has no stages, just now / next / done. */
    stageTag(stage) {
        if (!this.singleCycle)
            return stage;
        return stage === 'ID' ? 'NOW' : stage === 'IF' ? 'NEXT' : 'DONE';
    }
    noteEntry(slot) {
        const stage = this.run.pipeline.stageOf(slot.seq);
        const where = this.singleCycle
            ? stage === 'ID'
                ? 'On the line: all five steps happen in this one beat.'
                : stage === 'WB'
                    ? 'Done: its result is on the way to the registers.'
                    : 'Coming up next.'
            : stage
                ? `Now in ${STAGE_NAMES[stage]} (${stage}).`
                : 'Coming up: it will be fetched soon.';
        const guess = (taken) => (taken ? 'TAKEN (K)' : 'NOT TAKEN (J)');
        const predicted = this.predictor ? this.run.pipeline.guessFor(slot) : undefined;
        if (predicted) {
            const sure = predicted.sure ? '' : ', but it is unsure (weak)';
            return {
                title: format(slot.instr),
                body: `${describe(slot.instr)}. ${where} Its glow: the predictor guesses ${guess(predicted.taken)}${sure}.`,
            };
        }
        const access = this.accesses.get(slot.seq);
        if (access)
            return { title: format(slot.instr), body: `${describe(slot.instr)}. ${where} ${this.accessWords(access)}` };
        const hint = this.guessing ? this.run.pipeline.hint(slot.pc) : undefined;
        const glow = !hint
            ? ''
            : hint.seen
                ? ` Its glow: last time it was ${guess(hint.taken)}.`
                : ` No history yet: it jumps backward, so it's probably a loop: ${guess(hint.taken)}.`;
        return { title: format(slot.instr), body: `${describe(slot.instr)}. ${where}${glow}` };
    }
    /** A load or store's trip to memory, for its note's explanation. */
    accessWords(access) {
        const at = `${access.cycles} cycles at ${formatMhz(this.run.chip.mhz)}`;
        if (access.level === 'BUFFER')
            return `It went to RAM through the write buffer: no waiting${access.hit ? ', and its cache line was updated too' : ''}.`;
        if (access.level === 'L1')
            return `Cache HIT: its block was already in line ${lineOf(access.address)}, so no trip to RAM.`;
        if (!this.l1)
            return access.cycles > 1 ? `RAM took ${MEMORY_TIMING.ramNs} ns = ${at}: everything froze while it waited.` : 'RAM answered within the cycle.';
        const why = {
            'first-use': 'FIRST USE: its block had never been loaded.',
            conflict: `CONFLICT: another block using line ${lineOf(access.address)} had pushed it out. A cache that could put blocks anywhere would still hold it.`,
            'too-small': 'TOO SMALL: more blocks were in use than the 4 lines hold.',
        };
        return `Cache MISS, ${why[access.missKind ?? 'first-use']} Its block came from RAM: ${at}.`;
    }
    /** A cache line: valid or not, and which block it holds. */
    cacheLineEntry(line) {
        const { valid, tag } = this.shownLines[line];
        const block = tag * CACHE_LINES + line;
        const holds = valid
            ? `Holds bytes ${block * BLOCK_BYTES}-${block * BLOCK_BYTES + 3} (tag ${bin(tag, 4)}).`
            : 'Empty: nothing loaded into it yet.';
        return {
            title: `CACHE LINE ${line}`,
            body: `${holds} Only addresses whose line bits are ${bin(line, 2)} (xxxx ${bin(line, 2)} xx) can go here, so blocks ${line}, ${line + 4}, ${line + 8}... share it.`,
        };
    }
    predictorEntry(pc) {
        const state = this.run.pipeline.predictorState(pc) ?? 0;
        const history = (this.run.pipeline.history.get(pc) ?? []).slice(-6).map((taken) => (taken ? 'T' : 'N')).join(' ');
        const names = this.predictor === '1-bit' ? ['NOT TAKEN', 'TAKEN'] : ['STRONG NOT TAKEN', 'WEAK NOT TAKEN', 'WEAK TAKEN', 'STRONG TAKEN'];
        const entry = this.predictor === '1-bit' ? GLOSSARY.PREDICTOR_1BIT : GLOSSARY.PREDICTOR_2BIT;
        return {
            title: `${entry.title}: ${names[state]}`,
            body: `${entry.body} So far this branch went: ${history || 'nothing yet'}.`,
        };
    }
    registerEntry(r) {
        const role = this.spec.roles?.[r];
        const job = r === 0 ? 'x0 is wired to zero: writing to it does nothing.' : role ? `In this program: ${role}.` : 'Not used by this program.';
        const pending = ['EX', 'MEM'].some((stage) => this.run.pipeline.stages[stage]?.step?.wrote === r);
        const note = pending ? ' A new value for it is still in the pipeline.' : '';
        return { title: `REGISTER x${r} = ${this.shownRegs[r]}`, body: `${job}${note} ${GLOSSARY.REGISTERS.body}` };
    }
    memoryEntry() {
        return { title: GLOSSARY.MEMORY.title, body: `${GLOSSARY.MEMORY.body} ${this.spec.memoryNote ?? ''}` };
    }
    // ---- results ----
    /** The tier's hardware, passed on when the scene restarts (retry, replay). */
    hardware() {
        return {
            singleCycle: this.singleCycle,
            forwarding: this.forwarding,
            guessing: this.guessing,
            predictor: this.predictor,
            program: this.programName,
            contract: this.contract,
            cache: this.l1,
        };
    }
    /** This CPU's hardware, for best-case comparisons at the rated clock. */
    simOptions() {
        return { forwarding: this.forwarding, predictor: this.predictor, singleCycle: this.singleCycle, cache: this.l1, mhz: this.ratedMhz };
    }
    /**
     * What this tier added, and the best a CPU without it could do (tier 3:
     * forwarding, tier 4: guessing, tiers 5-6: overriding the predictor).
     */
    baseline() {
        const options = this.simOptions();
        if (this.predictor)
            return { label: 'PREDICTOR ALONE', cycles: perfectCycles(this.freshCpu, options, 'hardware') };
        if (this.guessing)
            return { label: 'NEVER GUESSING', cycles: perfectCycles(this.freshCpu, { ...options, predictor: undefined }, 'hardware') };
        if (this.forwarding)
            return { label: 'NO FORWARDING', cycles: perfectCycles(this.freshCpu, { ...options, forwarding: false }) };
        return undefined;
    }
    /** Feedback when a branch is decided; tiers 2-3 always guess "not taken". */
    showBranchResult(mispredicted, taken, predicted) {
        if (predicted !== undefined) {
            this.showPredictorResult(mispredicted, taken, predicted);
            return;
        }
        if (!this.guessing) {
            if (!mispredicted)
                return;
            this.feedback.setText('BRANCH TAKEN:\nWRONG NEXT INSTRUCTION FLUSHED');
            if (this.practice && !this.explained.has('branch')) {
                this.explained.add('branch');
                this.showCallout('BRANCH TAKEN: the instruction behind\nit was the wrong one, so it was\nflushed. Costs 1 cycle, not your fault.');
            }
            return;
        }
        this.feedback.setText(mispredicted ? 'WRONG GUESS:\nNEXT INSTRUCTION FLUSHED' : `GOOD GUESS: ${taken ? 'TAKEN' : 'NOT TAKEN'}\nNO CYCLE LOST`);
        if (!this.practice)
            return;
        if (mispredicted && !this.explained.has('wrong-guess')) {
            this.explained.add('wrong-guess');
            this.showCallout('WRONG GUESS: the CPU fetched the wrong\nnext instruction, so it was flushed.\nIt cost 1 cycle.');
        }
        else if (!mispredicted && taken && !this.explained.has('right-guess')) {
            this.explained.add('right-guess');
            this.showCallout("RIGHT GUESS: the loop's first instruction\nwas fetched straight away.\nNo cycle lost.");
        }
    }
    /** Tiers 5-6: did the player follow the predictor or override it, and how did that turn out? */
    showPredictorResult(mispredicted, taken, predicted) {
        const overrode = (mispredicted ? !taken : taken) !== predicted;
        const direction = taken ? 'TAKEN' : 'NOT TAKEN';
        this.feedback.setText(overrode
            ? mispredicted
                ? 'BAD OVERRIDE:\nNEXT INSTRUCTION FLUSHED'
                : 'OVERRIDE! YOU BEAT\nTHE PREDICTOR'
            : mispredicted
                ? 'PREDICTOR MISSED:\nNEXT INSTRUCTION FLUSHED'
                : `PREDICTOR RIGHT: ${direction}\nNO CYCLE LOST`);
        if (!this.practice)
            return;
        if (overrode && !mispredicted && !this.explained.has('beat')) {
            this.explained.add('beat');
            this.showCallout('YOU BEAT THE PREDICTOR!\nIt would have guessed wrong here.\nNo cycle lost.');
        }
        else if (!overrode && mispredicted && !this.explained.has('predictor-miss')) {
            this.explained.add('predictor-miss');
            this.showCallout(this.predictor === '1-bit'
                ? 'PREDICTOR MISSED: it guessed what the\nbranch did last time. Watch x1 reach\nx2 to see a row end, then override.'
                : 'PREDICTOR MISSED: a row ended. That\nonly weakens its counter. Watch x1\nreach x2 to see it coming, then override.');
        }
    }
    /** The whole contract's time at this run's pace: its CPI and the clocks it actually ran at. */
    jobSeconds(contract) {
        const p = this.run.pipeline;
        const { chip } = this.run;
        const micros = (chip.totalMicros / Math.max(1, chip.cycles)) * p.cycles;
        return (contract.instructions * (micros / Math.max(1, p.instructions))) / 1e6;
    }
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
        this.heat.stop();
        this.hazardLink.clear();
        this.hazardTag.setVisible(false);
        this.callout.setVisible(false);
        this.info?.setVisible(false);
        if (!this.practice && !this.watching) {
            // The contract pays as soon as the run is done (once: replays don't pay again).
            const { contract } = this;
            // On time or late is judged by this run's pace: its CPI and the clocks it actually ran at.
            this.late = contract ? this.jobSeconds(contract) > contract.deadline : false;
            if (contract)
                updateProgress((p) => completeContract(p, contract.id, Math.random, this.late));
            // Every real run is followed by its replay; the results come at the end of it.
            this.showCallout('RUN COMPLETE!\nNOW WATCH YOUR REPLAY.\nCLICK ANYTHING IN IT TO LEARN WHAT IT IS.');
            const replay = { watch: this.recording, watchDials: this.dialRecording, ...this.hardware(), maxDial: this.startMaxDial, canOverclock: this.canOverclock, paid: Boolean(contract), late: this.late };
            this.time.delayedCall(2000, () => this.scene.restart(replay));
            return;
        }
        this.showingResults = true;
        const p = this.run.pipeline;
        const lines = this.practice
            ? [
                'PRACTICE COMPLETE',
                '',
                `ALL ${p.instructions} INSTRUCTIONS RAN SAFELY.`,
                `YOU STALLED ${this.run.counts.stalled} TIMES WHILE VALUES WEREN'T READY.`,
                '',
                "NOW PLAY FOR REAL: NOTES WON'T WAIT.",
                '',
                this.returnTo ? '[ENTER] CONTRACT BOARD' : '[ENTER] PLAY    [Q] TITLE',
            ]
            : this.resultLines();
        const { fg, bg } = this.look.era;
        const height = Math.min(524, lines.length * 21 + 36);
        const box = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 820, height, bg).setStrokeStyle(1, fg).setDepth(500);
        this.raisedEdges(WIDTH / 2, HEIGHT / 2, 820, height)?.setDepth(500);
        if (isDos(this.look.era))
            dropShadow(this.add.graphics(), WIDTH / 2 - 410, HEIGHT / 2 - height / 2, 820, height, 8).setDepth(500);
        // Left-aligned so the charts' columns line up.
        const text = this.text(WIDTH / 2, HEIGHT / 2, lines.join('\n'), 15).setOrigin(0.5).setAlign('left').setDepth(501).setLineSpacing(4);
        this.glideIn([box, text]);
    }
    /** The modern era eases things onto the screen (fading in, rising a little); the retro eras just show them. */
    glideIn(targets, rise = 14) {
        if (!isSmooth())
            return;
        for (const target of targets) {
            const { alpha, y } = target;
            target.alpha = 0;
            target.y = y + rise;
            this.tweens.add({ targets: target, alpha, y, duration: 260, ease: 'Cubic.Out' });
        }
    }
    /**
     * The results of a real run, as charts: where the cycles went (which gives
     * the CPI), the time per instruction (CPI x clock period) next to the CPU
     * you upgraded from, and the whole contract at that pace against its deadline.
     */
    resultLines() {
        const p = this.run.pipeline;
        const { chip } = this.run;
        const n = Math.max(1, p.instructions);
        const time = (micros) => formatDuration(micros / 1e6);
        // Time per instruction at the clocks actually run, plus the time the clock was stopped to cool (µs).
        const avgPeriod = chip.micros / Math.max(1, chip.cycles);
        const cooling = chip.haltedMicros / n;
        const perInstruction = p.cpi * avgPeriod + cooling;
        const lines = [`RESULTS: ${this.spec.client ?? this.spec.name} ON ${this.tierTitle()}`];
        // Extra lines only when they apply: branch guessing, and a clock that wasn't the rated one.
        if (this.predictor) {
            lines.push(`BRANCH GUESSES ${p.branches - p.mispredicted}/${p.branches} RIGHT (PREDICTOR ALONE: ${p.branches - p.predictorMisses}/${p.branches})`);
        }
        else if (this.guessing) {
            lines.push(`BRANCH GUESSES ${p.branches - p.mispredicted}/${p.branches} RIGHT`);
        }
        if (chip.cycles > 0 && (this.dialRecording.some((d) => d !== 1) || this.watchDials.some((d) => d !== 1) || chip.overheats > 0)) {
            lines.push(`CLOCK: AVERAGE ${formatMhz(Number((1 / avgPeriod).toPrecision(3)))}, PEAK ${Math.round(chip.peak)}°C` +
                (chip.overheats > 0 ? `, OVERHEATED ${chip.overheats}x: MAX CLOCK NOW ${Math.round(chip.maxDial * 100)}%` : ''));
        }
        if (chip.haltedBeats > 0) {
            lines.push(`CLOCK STOPPED TO COOL FOR ${chip.haltedBeats} BEATS: NO CYCLES, BUT ${time(chip.haltedMicros)} LOST (+${time(cooling)} PER INSTRUCTION)`);
        }
        const { memory } = p;
        if (this.l1 && memory.loads > 0) {
            const kinds = Object.keys(MISS_WORDS).filter((k) => memory.missKinds[k] > 0).map((k) => `${memory.missKinds[k]} ${MISS_WORDS[k]}`);
            lines.push(`L1 CACHE: ${memory.hits} OF ${memory.loads} LOADS HIT (${Math.round((memory.hits / memory.loads) * 100)}%)` + (kinds.length > 0 ? `, MISSES: ${kinds.join(', ')}` : ''));
        }
        // Where the cycles went: every cycle either finished an instruction or was lost.
        const fill = Math.max(0, p.cycles - p.instructions - p.stalls - p.flushed - p.memoryCycles);
        const waited = p.memoryCycles > 0 ? [[`WAITING ON RAM (${memory.ramTrips} TRIP${memory.ramTrips === 1 ? '' : 'S'})`, p.memoryCycles]] : [];
        const rows = this.singleCycle
            ? [['FINISHED AN INSTRUCTION', p.instructions], ['LOST (MISSED OR WRONG KEY)', p.stalls], ...waited]
            : [
                ['FINISHED AN INSTRUCTION', p.instructions],
                ['STALLED (WAITING / MISSED)', p.stalls],
                ['FLUSHED (WRONG PATH)', p.flushed],
                ...waited,
                ['FILLING AND EMPTYING', fill],
            ];
        const count = (c) => String(c).padStart(String(p.cycles).length);
        lines.push('', `WHERE THE ${p.cycles} CYCLES WENT`);
        for (const [label, c] of rows)
            lines.push(`  ${label.padEnd(27)} ${bar(c, p.cycles, 24)} ${count(c)}`);
        lines.push(`  CPI = ${p.cycles} CYCLES / ${p.instructions} INSTRUCTIONS = ${p.cpi.toFixed(2)}`);
        // Time per instruction: CPI x clock period, next to the CPU this tier improved on (all at the rated clock, RAM waits included).
        const compare = [['YOU', p.cpi, avgPeriod]];
        const base = this.baseline();
        if (base)
            compare.push([`${base.label} (BEST)`, base.cycles / n, 1 / this.ratedMhz]);
        if (this.l1)
            compare.push(['NO CACHE (BEST)', perfectCycles(this.freshCpu, { ...this.simOptions(), cache: false }) / n, 1 / this.ratedMhz]);
        if (!this.singleCycle) {
            const singleMhz = this.ratedMhz / 4;
            const singleCycles = perfectCycles(this.freshCpu, { ...this.simOptions(), singleCycle: true, mhz: singleMhz });
            compare.push(['SINGLE-CYCLE', singleCycles / n, 1 / singleMhz]);
        }
        const slowest = Math.max(...compare.map(([, cpi, period]) => cpi * period));
        lines.push('', 'TIME PER INSTRUCTION = CPI x CLOCK PERIOD');
        for (const [label, cpi, period] of compare) {
            const sum = `${cpi.toFixed(2)} x ${time(period)} = ${time(cpi * period)}`;
            lines.push(`  ${label.padEnd(20)} ${sum.padEnd(27)} ${bar(cpi * period, slowest, 18)}`);
        }
        // The whole contract at this pace: the song is the first part of the job.
        const { contract } = this;
        if (contract) {
            const seconds = (contract.instructions * perInstruction) / 1e6;
            const verdict = this.late ? `LATE: HALF PAY ${formatMoney(payFor(contract, true))}` : `ON TIME: PAID ${formatMoney(contract.pay)}`;
            lines.push('', `WHOLE CONTRACT = ${formatCount(contract.instructions)} INSTRUCTIONS x YOUR ${time(perInstruction)} = ${formatDuration(seconds)}`, `  NEEDED IN ${formatDuration(contract.deadline).padEnd(12)} ${deadlineBar(seconds, contract.deadline, 24)}  ${this.paid ? verdict : ''}`);
            if (this.paid)
                lines.push(`  MONEY NOW ${formatMoney(getProgress().money)}`);
        }
        lines.push('', this.contract && this.paid ? '[ENTER] CONTRACT BOARD    [W] WATCH AGAIN    [Q] TITLE' : '[ENTER] PLAY AGAIN    [W] WATCH AGAIN    [Q] TITLE');
        return lines;
    }
}
//# sourceMappingURL=PipelineScene.js.map