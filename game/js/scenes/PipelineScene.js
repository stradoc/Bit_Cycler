import { Conductor } from '../audio/conductor.js';
import { LayeredMusic } from '../audio/music.js';
import { stopHum } from '../audio/sound.js';
import { cheatFlags } from '../cheatFlags.js';
import { BASE_MHZ } from '../data/economy.js';
import { programByName } from '../data/programs.js';
import { keyOf } from '../input/keys.js';
import { NORMAL_WINDOWS, RELAXED_WINDOWS } from '../rhythm/judge.js';
import { evaluate, PipelineRun } from '../rhythm/pipelineRun.js';
import { tempoForClock } from '../rhythm/tempo.js';
import { getProgress, updateProgress } from '../save.js';
import { getSettings } from '../settings.js';
import { assemble } from '../sim/assembler.js';
import { Cpu } from '../sim/cpu.js';
import { unitOf } from '../sim/isa.js';
import { CACHE_LINES, freezeBeats } from '../sim/memory.js';
import { completeContract, hasCache, ratedMhzFor, thermalConfig } from '../sim/progress.js';
import { Chip, THERMAL } from '../sim/thermal.js';
import { Bus } from '../song/bus.js';
import { Gauge } from '../song/gauge.js';
import { Highway } from '../song/highway.js';
import { LANE_X0, LANES_W, REGISTER_COUNT, REPLAY_SPEEDS, ROW_GAP, ROWS, SINGLE_CYCLE_ROWS } from '../song/layout.js';
import { Panel } from '../song/panel.js';
import { ReplayControls } from '../song/replay.js';
import { jobSeconds, practiceLines, resultLines } from '../song/results.js';
import { Fades } from '../song/view.js';
import { SongWords } from '../song/words.js';
import { Screen } from '../ui/screen.js';
import { Box, glideIn } from '../ui/widgets.js';
import { HEIGHT, WIDTH } from '../visual/display.js';
import { HeatEffects } from '../visual/heat.js';
// The song: a program played as a rhythm game, each beat one clock cycle. This
// scene runs it (the beat clock, the music, the keys, practice, replays) and
// leaves drawing to its parts in song/: the highway of notes, the panel, the
// bus, the gauge, the replay's controls; what it says is in song/words.ts.
/** Cycle c happens on beat firstBeat + c: FIRST_BEAT, plus the count-in in a song, so the first decision lands 2 beats later. */
const FIRST_BEAT = 2;
/** Before a song, a count-in of about this long introduces the loop's key registers (NEXT, END). */
const COUNT_IN_SECONDS = 4;
const KEY_UNITS = { D: 'ALU', F: 'MEM', J: 'BRANCH' };
/** An issued instruction's sound, pitched by its unit (audio/cues.ts). */
const HIT_CUE = { ALU: 'hit-alu', MEM: 'hit-mem', BRANCH: 'hit-branch' };
/** The metronome under the music: about a quarter of its calibration loudness. */
const SONG_CLICK = 0.27;
/**
 * Each beat, route the instruction in ID to its unit, or stall (Space) while
 * a register it needs is still being computed by an instruction below it;
 * later tiers add forwarding, branch guesses and predictors, and the cache.
 */
export class PipelineScene extends Screen {
    ctx;
    conductor;
    music;
    run;
    view;
    highway;
    panel;
    bus;
    gauge;
    heat;
    replay;
    callout;
    calloutText;
    freezeView;
    lastFrameMs = 0;
    finished = false;
    /** The results box is up (Enter / W work). */
    showingResults = false;
    /** Beat on which the last instruction leaves WB (set once the program is done). */
    endBeat;
    practice = false;
    /** Practice: beats the chart has been held for the player. */
    chartOffset = 0;
    /** Practice tips already shown. */
    explained = new Set();
    autoplayParam = new URLSearchParams(location.search).has('autoplay');
    /** This run's decisions, cycle by cycle, for the replay. */
    recording = [];
    /** Set when watching a replay: the recorded run to play back. */
    watching = null;
    forwarding = false;
    guessing = false;
    predictor;
    l1 = false;
    programName = 'SUM ARRAY';
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
    /** The CPU as the program starts, for best-case comparisons on the results screen. */
    freshCpu;
    /** Tempo of the CPU's clock; the conductor runs at this times the replay speed. */
    baseBpm = 0;
    /** Beat of cycle 0: later than FIRST_BEAT when the song opens with a count-in. */
    firstBeat = FIRST_BEAT;
    // Replay: its own clock, so it can change speed and pause.
    replayBeat = 0;
    speedIndex = 1;
    paused = false;
    /** ?autoplay, or cheat.autoplay() from the console. */
    get autoplay() {
        return this.autoplayParam || cheatFlags.autoplay;
    }
    /** cheat.temp(): set the chip's temperature mid-song (testing heat and throttling). */
    setTemperature(celsius) {
        this.run.chip.temperature = celsius;
    }
    get words() {
        return this.view.words;
    }
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
        this.forwarding = data?.forwarding ?? params.has('forwarding');
        // ?practice in the URL starts in practice mode (dev shortcut).
        this.practice = data?.practice ?? params.has('practice');
        this.watching = data?.watch ?? null;
        // ?contract=standard plays the board's first contract in that section (dev shortcut).
        const devSection = params.get('contract');
        this.contract = data?.contract ?? getProgress().board.find((c) => c.section === devSection);
        if (!data?.program && this.contract)
            this.programName = this.contract.program;
        this.paid = data?.paid ?? false;
        this.late = data?.late ?? false;
        // Without the overclocking unlock, the dial stops at the rated clock (?clock=150, a dev shortcut, allows it).
        // Wear is the chip's own; practice always runs on a new chip, so it never overheats.
        const progress = getProgress();
        this.startMaxDial = data?.maxDial ?? (this.practice ? THERMAL.maxDial : progress.chipMaxDial);
        this.canOverclock = data?.canOverclock ?? (progress.overclocking || params.has('clock'));
        // ?cache in the URL fits the L1 cache (dev shortcut).
        this.l1 = data?.cache ?? (hasCache(progress) || params.has('cache'));
        this.wasHalted = false;
        this.returnTo = data?.returnTo;
        this.watchDials = data?.watchDials ?? [];
        this.dialRecording = [];
        this.overheatsShown = 0;
        this.recording = [];
        this.conductor = undefined;
        this.freezeView = undefined;
        this.lastFrameMs = performance.now();
        this.finished = false;
        this.showingResults = false;
        this.endBeat = undefined;
        this.replayBeat = -0.5;
        this.speedIndex = 1;
        this.paused = false;
        this.chartOffset = 0;
        this.explained = new Set();
    }
    create() {
        const settings = getSettings();
        // The song has its own music.
        this.setUp({ hum: false });
        stopHum();
        if (!(this.sound instanceof Phaser.Sound.WebAudioSoundManager)) {
            this.text(480, 270, 'WEB AUDIO NOT AVAILABLE', 20);
            return;
        }
        this.ctx = this.sound.context;
        const spec = programByName(this.programName);
        const easy = settings.relaxed || this.practice;
        const progress = getProgress();
        this.ratedMhz = ratedMhzFor(progress, !this.singleCycle);
        // The song's tempo follows the rated clock, so clock upgrades speed it up.
        const bpm = tempoForClock(this.ratedMhz, easy);
        this.baseBpm = bpm;
        const program = assemble(spec.source, REGISTER_COUNT);
        const cpu = new Cpu(program, 8, spec.memory, REGISTER_COUNT);
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
        const setup = {
            spec,
            singleCycle: this.singleCycle,
            forwarding: this.forwarding,
            guessing: this.guessing,
            predictor: this.predictor,
            l1: this.l1,
            practice: this.practice,
            watching: this.watching !== null,
            rows: this.rows,
        };
        const shown = {
            regs: [...this.run.pipeline.regs],
            memory: cpu.memory.slice(),
            lines: Array.from({ length: CACHE_LINES }, () => ({ valid: false, tag: 0 })),
        };
        this.replay = new ReplayControls(this, this.era, setup.watching, {
            speed: (step) => this.setSpeed(this.speedIndex + step),
            pause: () => this.pause(),
            resume: () => this.resume(),
            playing: () => !this.finished,
        });
        const words = new SongWords(this.run, setup, shown);
        this.view = { scene: this, era: this.era, run: this.run, setup, shown, words, clickable: this.replay.clickable, fades: new Fades() };
        // Back to front, as they overlap.
        this.highway = new Highway(this.view);
        this.heat = new HeatEffects(this, this.era, { x: LANE_X0, y: 0, width: LANES_W, height: this.rows.WB + ROW_GAP / 2 });
        this.gauge = new Gauge(this.view, this.canOverclock && this.startMaxDial > 1);
        this.panel = new Panel(this.view, program, this.firstBeat > FIRST_BEAT ? 30000 / this.tempo() : undefined);
        this.bus = new Bus(this.view, this.panel, this.highway);
        this.drawCallout();
        if (setup.watching)
            this.replay.draw(this.speedIndex, this.paused);
        this.music = new LayeredMusic(this.ctx);
        this.startConductor();
        this.events.once('shutdown', () => this.conductor?.stop());
        this.panel.refresh();
    }
    update() {
        super.update();
        if (!this.conductor)
            return; // no Web Audio
        const now = performance.now();
        const elapsed = now - this.lastFrameMs;
        this.lastFrameMs = now;
        this.highway.update(now);
        this.view.fades.update(now);
        this.bus.update(now);
        if (this.watching)
            this.replay.updateHover();
        if (this.finished)
            return;
        if (this.watching && !this.paused) {
            // Capped so a backgrounded tab doesn't jump the replay ahead.
            this.replayBeat += (Math.min(elapsed, 250) / 1000) * (this.tempo() / 60);
        }
        let beat = this.chartBeat();
        if (this.panel.countingIn)
            this.panel.updateCountIn(beat);
        if (this.practice)
            beat = this.holdForPlayer(beat);
        if (this.autoplay || this.watching)
            this.playItself(beat);
        this.advanceTo(beat);
        this.highway.syncNotes(beat, elapsed, this.frozenBeats(beat));
        this.highway.easeRows(elapsed);
        this.panel.easeListing(elapsed);
        this.highway.drawHazard(now);
        this.updateFreeze(beat, now);
        this.updateHeat(now);
        if (this.run.done)
            this.drainAndFinish(beat);
    }
    // ---- input ----
    onKey(_key, event) {
        this.handleKey(event);
        return true;
    }
    handleKey(event) {
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
            this.panel.say(this.words.practiceClock());
            return;
        }
        const { chip } = this.run;
        const before = chip.dial;
        const moved = chip.setDial(chip.dial + direction * THERMAL.dialStep) !== before;
        this.panel.say(this.words.dial(chip, direction, moved, this.ratedMhz));
        if (moved)
            this.syncClock();
    }
    act(action, beat) {
        if (!this.conductor || this.finished)
            return;
        this.highway.flash(action.kind === 'stall' ? 'STALL' : action.unit, performance.now());
        if (this.practice) {
            // Practice grades the choice, not the timing, and explains mistakes.
            const outcome = evaluate(this.run.pipeline, action);
            if (!outcome)
                return;
            if (outcome !== 'issued' && outcome !== 'stalled') {
                this.buzz();
                this.showCallout(this.words.mistake(outcome));
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
                    for (const tip of this.words.situation())
                        if (this.tip(tip))
                            break;
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
    // ---- what happened ----
    showDecision(d) {
        if (d.outcome === 'issued')
            this.cue(HIT_CUE[unitOf(d.slot.instr)]);
        else if (d.outcome === 'stalled')
            this.cue('stall');
        else if (d.outcome !== 'missed')
            this.buzz();
        if (d.outcome === 'violation')
            this.cameras.main.shake(120, 0.004);
        const said = this.words.decision(d, this.run.streak + 1);
        if (said)
            this.panel.say(said);
        if (d.outcome !== 'issued')
            return;
        // Tier 3: a value forwarded into it jumps up a wire.
        const forwarded = this.bus.forward(d.slot, this.beatSeconds());
        if (forwarded)
            this.tip(this.words.forwarded(forwarded.reg, forwarded.producer));
    }
    onCycle(report) {
        if (!this.watching) {
            const d = report.decision;
            this.recording.push(d ? { action: d.action, outcome: d.outcome, judgment: d.judgment } : null);
            this.dialRecording.push(report.dial);
        }
        if (report.decision?.outcome === 'missed') {
            this.buzz();
            this.panel.say(this.words.missed(report.decision.waited));
        }
        for (const slot of report.flushed)
            this.highway.strike(slot);
        if (report.mispredicted !== undefined) {
            const issued = report.event.kind === 'issued' ? report.event.slot : undefined;
            const { feedback, tip } = this.words.branch(report.mispredicted, issued?.step?.taken ?? false, report.predicted);
            if (feedback)
                this.panel.say(feedback);
            this.tip(tip);
        }
        this.highway.syncRows();
        this.bus.send(report.committed, this.beatSeconds());
        if (report.access)
            this.onAccess(report.access.slot, report.access.access);
        this.panel.refresh();
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
        this.words.remember(slot, access);
        this.panel.showAccess(this.words.lookup(slot, access), access);
        if (access.cycles > 1) {
            const total = access.cycles - 1;
            this.freezeView = { start: this.run.dueBeat, beats: freezeBeats(total), base: this.run.memoryBeats, total, slot, access };
            this.panel.markBlock(access.address, this.freezeView.beats * this.beatSeconds());
        }
        else {
            this.panel.fillLine(access);
        }
        this.tip(this.words.access(access));
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
    /** Every frame: the gauge, the fire effects growing with the temperature, and what a stopped clock means. */
    updateHeat(now) {
        const { chip } = this.run;
        this.gauge.update(chip, now);
        this.heat.update(chip.temperature, chip.throttleAt, chip.halted, now);
        if (this.practice)
            return;
        if (chip.halted)
            this.panel.say(this.words.halted(chip));
        else if (this.wasHalted)
            this.panel.say(this.words.resumed(chip));
        this.wasHalted = chip.halted;
    }
    buzz() {
        this.cue('mistake');
    }
    /** A practice tip, the first time it comes up. Returns whether it was shown. */
    tip(tip) {
        if (!this.practice || !tip || this.explained.has(tip.id))
            return false;
        this.explained.add(tip.id);
        this.showCallout(tip.message);
        return true;
    }
    drawCallout() {
        const box = new Box(this, this.era, 0, 0, LANES_W - 8, 150, { strokeWidth: 2 });
        this.calloutText = this.text(0, 0, '', 16).setAlign('center').setLineSpacing(8);
        this.callout = this.add.container(LANE_X0 + LANES_W / 2, 170, [...box.parts, this.calloutText]).setDepth(600).setVisible(false);
    }
    showCallout(message) {
        this.calloutText.setText(message);
        if (!this.callout.visible) {
            this.tweens.killTweensOf(this.callout);
            this.callout.setAlpha(1).setY(170);
            glideIn(this, [this.callout], 8);
        }
        this.callout.setVisible(true);
    }
    // ---- memory waits ----
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
    /**
     * Every frame of a memory wait: the waiting note pulses, the request runs
     * up the bus to memory and the data comes back, and a counter rolls up the
     * real cycles. When it's over, a missed block fills its cache line.
     */
    updateFreeze(beat, now) {
        this.highway.hideWaiting();
        const view = this.freezeView;
        if (!view)
            return;
        if (!this.run.frozen && beat >= view.start + view.beats) {
            this.endFreeze(view);
            return;
        }
        const t = Phaser.Math.Clamp((beat - view.start) / view.beats, 0, 1);
        const { access } = view;
        const block = this.highway.showWaiting(view.slot.seq, this.words.waitingTag(access), now);
        if (block) {
            const rowY = this.panel.memoryY(access.address) ?? this.rows.MEM;
            this.bus.trip(block.box, rowY, t, this.words.trip(access, t >= 0.5, this.view.shown.memory[access.address]));
        }
        if (this.run.chip.halted)
            return; // the overheat message wins
        this.panel.say(this.words.waiting(view, Math.min(view.total, Math.round(view.total * t))));
    }
    /** The wait is over: a missed block lands in its cache line, and the song moves again. */
    endFreeze(view) {
        this.freezeView = undefined;
        this.highway.endWaiting(view.slot.seq);
        this.panel.fillLine(view.access);
        if (!this.practice && !this.run.chip.halted)
            this.panel.say(this.words.arrived());
        this.panel.refresh();
    }
    // ---- the beat clock, and replay speed ----
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
        conductor.clickLevel = this.paused ? 0 : SONG_CLICK;
        let wasFrozen = false;
        conductor.onBeat = (beat, time) => {
            if (beat <= this.firstBeat || this.finished || this.paused)
                return;
            const spb = 60 / conductor.bpm;
            if (this.run.frozen) {
                // Waiting for memory: a low drone, and fast ticks for the cycles going by.
                const ticks = Math.min(8, Math.ceil((this.freezeView?.total ?? 1) / (this.freezeView?.beats ?? 1)));
                this.cue('waiting', { at: time, length: spb, ticks });
                wasFrozen = true;
                return;
            }
            if (wasFrozen) {
                // The data arrived: a bright double click, and the song goes on.
                this.cue('arrived', { at: time });
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
        this.replay.render(this.speedIndex, this.paused);
    }
    pause() {
        this.paused = true;
        if (this.conductor)
            this.conductor.clickLevel = 0;
        this.replay.render(this.speedIndex, this.paused);
    }
    resume() {
        if (!this.paused)
            return;
        this.paused = false;
        if (this.conductor)
            this.conductor.clickLevel = SONG_CLICK;
        this.replay.hideInfo();
        this.replay.render(this.speedIndex, this.paused);
    }
    // ---- the end ----
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
    /**
     * The program is done once its last instruction reaches WB. Let it finish
     * that beat, slide out of the pipeline, and land its value, then show results.
     */
    drainAndFinish(beat) {
        // The last instruction entered WB just before this beat; it leaves once the beat has passed.
        this.endBeat ??= this.run.dueBeat + 0.25;
        if (beat < this.endBeat)
            return;
        this.highway.empty();
        if (!this.bus.busy)
            this.finish();
    }
    finish() {
        this.finished = true;
        this.conductor?.stop();
        this.heat.stop();
        this.highway.hideHazard();
        this.callout.setVisible(false);
        this.replay.hideInfo();
        if (!this.practice && !this.watching) {
            // The contract pays as soon as the run is done (once: replays don't pay again).
            const { contract } = this;
            // On time or late is judged by this run's pace: its CPI and the clocks it actually ran at.
            this.late = contract ? jobSeconds(this.run, contract) > contract.deadline : false;
            if (contract)
                updateProgress((p) => completeContract(p, contract.id, Math.random, this.late));
            // Every real run is followed by its replay; the results come at the end of it.
            this.showCallout('RUN COMPLETE!\nNOW WATCH YOUR REPLAY.\nCLICK ANYTHING IN IT TO LEARN WHAT IT IS.');
            const replay = { watch: this.recording, watchDials: this.dialRecording, ...this.hardware(), maxDial: this.startMaxDial, canOverclock: this.canOverclock, paid: Boolean(contract), late: this.late };
            this.time.delayedCall(2000, () => this.scene.restart(replay));
            return;
        }
        this.showingResults = true;
        const lines = this.practice
            ? practiceLines(this.run, this.returnTo)
            : resultLines({
                run: this.run,
                setup: this.view.setup,
                tierTitle: this.words.tierTitle(),
                freshCpu: this.freshCpu,
                ratedMhz: this.ratedMhz,
                dials: [...this.dialRecording, ...this.watchDials],
                contract: this.contract,
                late: this.late,
                paid: this.paid,
                money: getProgress().money,
            });
        const height = Math.min(524, lines.length * 21 + 36);
        const box = new Box(this, this.era, WIDTH / 2, HEIGHT / 2, 820, height).setDepth(500);
        // Left-aligned so the charts' columns line up.
        const text = this.text(WIDTH / 2, HEIGHT / 2, lines.join('\n'), 15).setAlign('left').setDepth(501).setLineSpacing(4);
        glideIn(this, [box.body, text]);
    }
}
//# sourceMappingURL=PipelineScene.js.map