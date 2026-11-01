import { Conductor } from '../audio/conductor.ts';
import { LayeredMusic } from '../audio/music.ts';
import { stopHum, type Cue } from '../audio/sound.ts';
import { cheatFlags } from '../cheatFlags.ts';
import { SONG_TOURS, type SongTarget } from '../data/tours.ts';
import { keyOf } from '../input/keys.ts';
import { NORMAL_WINDOWS, RELAXED_WINDOWS } from '../rhythm/judge.ts';
import { evaluate, PipelineRun, type Action, type CycleReport, type Decision } from '../rhythm/pipelineRun.ts';
import { tempoForClock } from '../rhythm/tempo.ts';
import { getProgress, updateProgress } from '../save.ts';
import { getSettings } from '../settings.ts';
import { assemble } from '../sim/assembler.ts';
import { addressOf, Cpu } from '../sim/cpu.ts';
import { keepsTotal, unitOf, type Unit } from '../sim/isa.ts';
import { CACHE_LINES, freezeBeats, type Access } from '../sim/memory.ts';
import type { Slot } from '../sim/pipeline.ts';
import { completeContract, thermalConfig } from '../sim/progress.ts';
import { Chip, THERMAL } from '../sim/thermal.ts';
import { Bus } from '../song/bus.ts';
import { Gauge } from '../song/gauge.ts';
import { Highway } from '../song/highway.ts';
import { GAUGE_BOTTOM, HIT_Y, LANE_X0, LANES_W, REGISTER_COUNT, REPLAY_SPEEDS, ROW_GAP, type FreezeView } from '../song/layout.ts';
import { Panel } from '../song/panel.ts';
import { ReplayControls } from '../song/replay.ts';
import { jobSeconds, practiceLines, resultLines } from '../song/results.ts';
import { pipelineOptions, playAgain, songSetup, watch, type Recorded, type Recording, type SongSetup, type SongStart } from '../song/setup.ts';
import { Fades, type Shown, type SongView } from '../song/view.ts';
import { SongWords, type Reads, type Tip } from '../song/words.ts';
import { Guide, type Rect } from '../ui/guide.ts';
import type { PauseItem } from '../ui/pauseMenu.ts';
import { Screen } from '../ui/screen.ts';
import { Box, glideIn } from '../ui/widgets.ts';
import { HEIGHT, WIDTH } from '../visual/display.ts';
import { HeatEffects } from '../visual/heat.ts';

// The song: a program played as a rhythm game, each beat one clock cycle. This
// scene runs it (the beat clock, the music, the keys, practice, replays) and
// leaves drawing to its parts in song/: the highway of notes, the panel, the
// bus, the gauge, the replay's controls; what it says is in song/words.ts, and
// how it's set up (the program, the hardware, practice or replay) in song/setup.ts.

/** Cycle c happens on beat firstBeat + c: FIRST_BEAT, plus the count-in in a song, so the first decision lands 2 beats later. */
const FIRST_BEAT = 2;
/** Before a song, a count-in of about this long introduces the loop's key registers (NEXT, END). */
const COUNT_IN_SECONDS = 4;
const KEY_UNITS: Readonly<Record<string, Unit>> = { D: 'ALU', F: 'MEM', J: 'BRANCH' };
/** An issued instruction's sound, pitched by its unit (audio/cues.ts). */
const HIT_CUE: Readonly<Record<Unit, Cue>> = { ALU: 'hit-alu', MEM: 'hit-mem', BRANCH: 'hit-branch' };
/** The metronome under the music: about a quarter of its calibration loudness. */
const SONG_CLICK = 0.27;
/** Where the guide waits in practice (its top-left corner), below the stats; and how dark the screen gets around what a tip points at. */
const GUIDE_HOME = { x: 850, y: 426 };
const TIP_DIM = 0.45;

/**
 * Each beat, route the instruction in ID to its unit, or stall (Space) while
 * a register it needs is still being computed by an instruction below it;
 * later tiers add forwarding, branch guesses and predictors, and the cache.
 */
export class PipelineScene extends Screen {
  private ctx!: AudioContext;
  private setup!: SongSetup;
  private conductor: Conductor | undefined;
  private music!: LayeredMusic;
  private run!: PipelineRun;
  private view!: SongView;
  private highway!: Highway;
  private panel!: Panel;
  private bus!: Bus;
  private gauge!: Gauge;
  private heat!: HeatEffects;
  private replayControls!: ReplayControls;
  /** The guide: says practice's tips (and plays a lesson's tour first), and tells you about the replay. */
  private guide!: Guide;
  private freezeView: FreezeView | undefined;
  private lastFrameMs = 0;
  private finished = false;
  /** The results box is up (Enter / W work). */
  private showingResults = false;
  /** Beat on which the last instruction leaves WB (set once the program is done). */
  private endBeat: number | undefined;
  /** Practice: beats the chart has been held for the player. */
  private chartOffset = 0;
  /** Practice tips already shown. */
  private explained = new Set<string>();
  private readonly autoplayParam = new URLSearchParams(location.search).has('autoplay');
  /** This run's decisions, cycle by cycle, for the replay. */
  private recording: Recorded[] = [];
  /** The clock was stopped (overheated) at the last check, to say when it starts again. */
  private wasHalted = false;
  /** The clock dial on each cycle of this run (G / H change it), for the replay. */
  private dialRecording: number[] = [];
  /** Overheats already reported (each one wears the chip). */
  private overheatsShown = 0;
  /** The clock ratio the music is playing at; changes when the dial is turned. */
  private tempoRatio = 1;
  /** The CPU as the program starts, for best-case comparisons on the results screen. */
  private freshCpu!: Cpu;
  /** Tempo of the CPU's clock; the conductor runs at this times the replay speed. */
  private baseBpm = 0;
  /** Beat of cycle 0: later than FIRST_BEAT when the song opens with a count-in. */
  private firstBeat = FIRST_BEAT;
  // Replay: its own clock, so it can change speed and pause.
  private replayBeat = 0;
  private speedIndex = 1;
  private paused = false;
  /** The pause menu found the replay already paused (so closing it leaves it paused). */
  private replayWasPaused = false;
  /** Tier 1's practice: the instruction TICK is taking a close look at, with what it read, until it has run. */
  private closeLook: { seq: number; reads: Reads } | undefined;
  /** ...its answer is on its way up the wire: TICK points at it once it lands, and the keys wait. */
  private landing = false;

  /** ?autoplay, or cheat.autoplay() from the console. */
  private get autoplay(): boolean {
    return this.autoplayParam || cheatFlags.autoplay;
  }

  /** cheat.temp(): set the chip's temperature mid-song (testing heat and throttling). */
  setTemperature(celsius: number): void {
    this.run.chip.temperature = celsius;
  }

  private get words(): SongWords {
    return this.view.words;
  }

  constructor() {
    super('pipeline');
  }

  init(data?: SongStart): void {
    this.setup = songSetup(data ?? {}, getProgress(), new URLSearchParams(location.search));
    this.wasHalted = false;
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
    this.closeLook = undefined;
    this.landing = false;
    this.chartOffset = 0;
    this.explained = new Set();
  }

  create(): void {
    const settings = getSettings();
    // The song has its own music.
    this.setUp({ hum: false });
    stopHum();
    if (!(this.sound instanceof Phaser.Sound.WebAudioSoundManager)) {
      this.text(480, 270, 'WEB AUDIO NOT AVAILABLE', 20);
      return;
    }
    this.ctx = this.sound.context;

    const { setup } = this;
    const { spec } = setup;
    const easy = settings.relaxed || setup.practice;
    // The song's tempo follows the rated clock, so clock upgrades speed it up.
    const bpm = tempoForClock(setup.ratedMhz, easy);
    this.baseBpm = bpm;
    const program = assemble(spec.source, REGISTER_COUNT);
    const cpu = new Cpu(program, 8, spec.memory, REGISTER_COUNT);
    this.freshCpu = cpu.clone();
    const chip = new Chip(setup.ratedMhz, setup.maxDial, thermalConfig(getProgress()), setup.canOverclock);
    if (setup.startDial) chip.setDial(setup.startDial);
    // Songs (and practice) open with a count-in naming the key registers; replays go straight in.
    const countBeats = spec.keys && !setup.watching ? Math.ceil((COUNT_IN_SECONDS * bpm * chip.clockRatio) / 60) : 0;
    this.firstBeat = FIRST_BEAT + countBeats;
    this.run = new PipelineRun(cpu, pipelineOptions(setup, chip.mhz), this.firstBeat, 60 / bpm, easy ? RELAXED_WINDOWS : NORMAL_WINDOWS, chip);
    this.tempoRatio = chip.clockRatio;

    const shown: Shown = {
      regs: [...this.run.pipeline.regs],
      memory: cpu.memory.slice(),
      lines: Array.from({ length: CACHE_LINES }, () => ({ valid: false, tag: 0 })),
    };
    this.replayControls = new ReplayControls(this, this.era, setup.watching, {
      speed: (step) => this.setSpeed(this.speedIndex + step),
      pause: () => this.pause(),
      resume: () => this.resume(),
      playing: () => !this.finished,
    });
    const words = new SongWords(this.run, setup, shown);
    this.view = { scene: this, era: this.era, run: this.run, setup, shown, words, clickable: this.replayControls.clickable, fades: new Fades(), openMenu: () => this.openPauseMenu() };

    // Back to front, as they overlap.
    this.highway = new Highway(this.view);
    this.heat = new HeatEffects(this, this.era, { x: LANE_X0, y: 0, width: LANES_W, height: setup.rows.WB + ROW_GAP / 2 });
    this.gauge = new Gauge(this.view, setup.canOverclock && setup.maxDial > 1);
    this.panel = new Panel(this.view, program, this.firstBeat > FIRST_BEAT ? 30000 / this.tempo() : undefined);
    this.bus = new Bus(this.view, this.panel, this.highway);
    this.guide = new Guide(this, this.era, setup.practice ? GUIDE_HOME : undefined);
    if (setup.watching) this.replayControls.draw(this.speedIndex, this.paused);

    this.music = new LayeredMusic(this.ctx);
    this.events.once('shutdown', () => this.conductor?.stop());
    this.panel.refresh();
    // A lesson's tour of the screen comes first (two in a row: the memory wall, then the cache);
    // the song starts when it ends, or the game goes on elsewhere (a lesson with no practice).
    const lessons = setup.tour ?? [];
    const steps = lessons.flatMap((id) => SONG_TOURS[id] ?? []);
    if (steps.length > 0) {
      this.guide.tour(steps, (target) => this.where(target), () => {
        updateProgress((p) => ({ ...p, seenLessons: [...new Set([...p.seenLessons, ...lessons])] }));
        if (setup.afterTour) this.scene.start(setup.afterTour.scene, setup.afterTour.data);
        else this.startConductor();
      });
    } else {
      this.startConductor();
    }
  }

  /** Where the parts of the song screen are, for the guide to point at. */
  private where(target: SongTarget): Rect {
    const bottom = this.setup.rows.WB + ROW_GAP / 2;
    const highway: Record<'lanes' | 'line' | 'rows' | 'gauge', Rect> = {
      lanes: { x: LANE_X0, y: 0, w: LANES_W, h: bottom + 32 },
      line: { x: LANE_X0 - 90, y: HIT_Y - 22, w: LANES_W + 90, h: 44 },
      rows: { x: LANE_X0 - 90, y: HIT_Y - 22, w: LANES_W + 90, h: bottom - HIT_Y + 22 },
      gauge: { x: 4, y: 0, w: LANE_X0 - 12, h: GAUGE_BOTTOM + 36 },
    };
    if (/^x\d+$/.test(target)) return this.panel.registerArea(Number(target.slice(1)));
    return target in highway ? highway[target as keyof typeof highway] : this.panel.areas[target as keyof Panel['areas']];
  }

  update(): void {
    super.update();
    const now = performance.now();
    this.guide?.update(now);
    if (this.pausing) return;
    if (!this.conductor) return; // no Web Audio, or the guide's tour is still on
    const elapsed = now - this.lastFrameMs;
    this.lastFrameMs = now;
    this.highway.update(now);
    this.view.fades.update(now);
    this.bus.update(now);
    if (this.setup.watching) this.replayControls.updateHover();
    if (this.finished) return;

    if (this.setup.watching && !this.paused) {
      // Capped so a backgrounded tab doesn't jump the replay ahead.
      this.replayBeat += (Math.min(elapsed, 250) / 1000) * (this.tempo() / 60);
    }
    let beat = this.chartBeat();
    if (this.panel.countingIn) this.panel.updateCountIn(beat);
    if (this.setup.practice) beat = this.holdForPlayer(beat);
    if (this.autoplay || this.setup.watching) this.playItself(beat);
    this.advanceTo(beat);
    this.highway.syncNotes(beat, elapsed, this.frozenBeats(beat));
    this.highway.easeRows(elapsed);
    this.panel.easeListing(elapsed);
    this.highway.drawHazard(now);
    this.updateFreeze(beat, now);
    this.updateHeat(now);
    // Practice ends once TICK has finished saying what the last instruction did.
    if (this.run.done && !(this.setup.practice && (this.landing || this.closeLook || this.guide.waiting))) this.drainAndFinish(beat);
  }

  // ---- input ----

  protected onKey(_key: string, event: KeyboardEvent): boolean {
    this.handleKey(event);
    return true;
  }

  private handleKey(event: KeyboardEvent): void {
    const key = keyOf(event);
    const { setup } = this;
    // TICK's tour or a tip: Enter shows the rest of the words, then closes them. The song waits.
    if (this.guide.waiting || this.landing) {
      if (key === 'Enter' && !event.repeat) this.guide.next();
      return;
    }
    if (setup.watching && !this.finished) {
      if (key === 'ArrowLeft') this.setSpeed(this.speedIndex - 1);
      else if (key === 'ArrowRight') this.setSpeed(this.speedIndex + 1);
      else if (key === ' ') {
        event.preventDefault();
        if (this.paused) this.resume();
        else this.pause();
      }
    }
    const unit = KEY_UNITS[key] ?? (key === 'K' && setup.guessing ? 'BRANCH' : undefined);
    if ((unit || (key === ' ' && !setup.singleCycle)) && !setup.watching) {
      event.preventDefault();
      const guess = setup.guessing && unit === 'BRANCH' ? { guessTaken: key === 'K' } : {};
      const action: Action = unit ? { kind: 'route', unit, ...guess } : { kind: 'stall' };
      this.act(action, this.chartBeat(event.timeStamp));
    } else if ((key === 'G' || key === 'H') && !setup.watching) {
      this.turnDial(key === 'H' ? 1 : -1);
    } else if (key === 'Enter' && this.showingResults && setup.practice && setup.returnTo) {
      this.scene.start(setup.returnTo);
    } else if (key === 'Enter' && this.showingResults) {
      // A paid contract goes back to the board for the next one; otherwise play again.
      if (setup.contract && setup.replay?.paid) this.scene.start('board');
      else this.scene.restart(playAgain(setup));
    } else if (key === 'W' && this.showingResults && setup.replay) {
      this.scene.restart(watch(setup, setup.replay));
    }
  }

  // ---- the pause menu ----

  protected pauseItems(): PauseItem[] {
    const { setup } = this;
    const items: PauseItem[] = [];
    const replay = setup.replay;
    if (this.guide.touring) {
      // No skipping TICK: the tour waits under the menu.
    } else if (setup.watching && replay) {
      items.push({ label: 'WATCH FROM THE START', about: 'THE REPLAY AGAIN, FROM ITS FIRST NOTE.', run: () => this.scene.restart(watch(setup, replay)) });
    } else if (!setup.watching) {
      const again: SongStart = setup.practice ? { ...setup, replay: undefined, tour: undefined } : playAgain(setup);
      items.push({ label: setup.practice ? 'RESTART THE PRACTICE' : 'RESTART THE SONG', about: 'START AGAIN FROM THE FIRST NOTE.', run: () => this.scene.restart(again) });
    }
    const playing = !this.finished && !setup.watching && this.conductor !== undefined;
    const note = playing && setup.contract ? ' (YOU LEAVE THIS SONG; THE JOB STAYS ON THE BOARD.)' : playing ? ' (YOU LEAVE THIS SONG.)' : '';
    return [...items, ...this.places(note)];
  }

  /** The pause menu stops the song: the beat clock (and so the music and the notes), or the replay. */
  protected onPause(open: boolean): void {
    if (this.setup.watching) {
      if (open) {
        this.replayWasPaused = this.paused;
        this.pause();
      } else if (!this.replayWasPaused) {
        this.resume();
      }
    } else if (open) {
      this.conductor?.pause();
    } else {
      this.conductor?.resume();
    }
    this.lastFrameMs = performance.now();
  }

  /** G / H: one step down or up on the clock dial. The tempo follows from the next beat. */
  private turnDial(direction: 1 | -1): void {
    if (!this.conductor || this.finished) return;
    if (this.setup.practice) {
      this.panel.say(this.words.practiceClock());
      return;
    }
    const { chip } = this.run;
    const before = chip.dial;
    const moved = chip.setDial(chip.dial + direction * THERMAL.dialStep) !== before;
    this.panel.say(this.words.dial(chip, direction, moved, this.setup.ratedMhz));
    if (moved) this.syncClock();
  }

  private act(action: Action, beat: number): void {
    if (!this.conductor || this.finished) return;
    this.highway.flash(action.kind === 'stall' ? 'STALL' : action.unit, performance.now());

    if (this.setup.practice) {
      // Practice grades the choice, not the timing, and explains mistakes.
      const outcome = evaluate(this.run.pipeline, action);
      if (!outcome) return;
      if (outcome !== 'issued' && outcome !== 'stalled') {
        this.buzz();
        this.guide.say({ say: this.words.mistake(outcome), point: this.where('line'), dim: TIP_DIM, keys: '[ENTER] OK', hold: true });
        return;
      }
      this.guide.quiet();
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
   * Autoplay and replays: decide for each cycle (perfectly, or as recorded),
   * one cycle at a time so a slow frame can't skip decisions.
   */
  private playItself(beat: number): void {
    const { replay } = this.setup;
    while (!this.run.done && beat >= this.run.dueBeat) {
      const waiting = this.run.frozen || this.run.chip.halted;
      if (replay && !waiting) {
        // The dial as it was on this cycle of the run (the player may have turned it): it sets the tempo and how long RAM takes.
        const dial = replay.dials[this.run.steps];
        if (dial !== undefined) this.run.chip.setDial(dial);
        this.syncClock();
      }
      if (this.run.pipeline.stages.ID && !this.run.decided && !waiting) {
        if (replay) {
          const recorded = replay.cycles[this.run.steps];
          const decision = recorded && this.run.force(recorded.action, recorded.outcome, recorded.judgment);
          if (decision) this.showDecision(decision);
        } else {
          this.act(this.bestAction(), this.run.dueBeat);
        }
      }
      const reports = this.run.update(Math.min(beat, this.run.dueBeat + 0.5));
      for (const report of reports) this.onCycle(report);
      if (reports.length === 0) break;
    }
  }

  /**
   * Practice: close cycles one at a time and hold the chart at the first
   * instruction in ID still waiting for the player (even if a slow frame
   * spans several beats). Returns the chart beat to use this frame.
   */
  private holdForPlayer(beat: number): number {
    while (!this.run.done) {
      // A memory wait passes on its own: only a decision holds the chart.
      if (this.run.pipeline.stages.ID && !this.run.decided && !this.run.frozen) {
        // A new kind of instruction gets TICK's close look as soon as it's next, before a quick key can play it.
        this.lookClosely();
        if (beat > this.run.dueBeat) {
          this.chartOffset += beat - this.run.dueBeat;
          beat = this.run.dueBeat;
          for (const tip of this.words.situation()) if (this.tip(tip)) break;
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
    if (this.run.pipeline.hazard() || !slot) return { kind: 'stall' };
    const taken = this.run.pipeline.branchOutcome();
    return { kind: 'route', unit: unitOf(slot.instr), ...(this.setup.guessing && taken !== undefined ? { guessTaken: taken } : {}) };
  }

  /** Beat of the chart (conductor beat minus practice holds) at a performance.now() time. */
  private chartBeat(performanceMs = performance.now()): number {
    if (this.setup.watching) return this.replayBeat;
    return (this.conductor?.beatAt(performanceMs) ?? 0) - this.chartOffset;
  }

  // ---- what happened ----

  private showDecision(d: Decision): void {
    if (d.outcome === 'issued') this.cue(HIT_CUE[unitOf(d.slot.instr)]);
    else if (d.outcome === 'stalled') this.cue('stall');
    else if (d.outcome !== 'missed') this.buzz();
    if (d.outcome === 'violation') this.cameras.main.shake(120, 0.004);
    const said = this.words.decision(d, this.run.streak + 1);
    if (said) this.panel.say(said);
    if (d.outcome !== 'issued') return;
    // Tier 3: a value forwarded into it jumps up a wire.
    const forwarded = this.bus.forward(d.slot, this.beatSeconds());
    if (forwarded) this.tip(this.words.forwarded(forwarded.reg, forwarded.producer));
  }

  private onCycle(report: CycleReport): void {
    if (!this.setup.watching) {
      const d = report.decision;
      this.recording.push(d ? { action: d.action, outcome: d.outcome, judgment: d.judgment } : null);
      this.dialRecording.push(report.dial);
    }
    if (report.decision?.outcome === 'missed') {
      this.buzz();
      this.panel.say(this.words.missed(report.decision.waited));
    }
    for (const slot of report.flushed) this.highway.strike(slot);
    if (report.mispredicted !== undefined) {
      const issued = report.event.kind === 'issued' ? report.event.slot : undefined;
      const { feedback, tip } = this.words.branch(report.mispredicted, issued?.step?.taken ?? false, report.predicted);
      if (feedback) this.panel.say(feedback);
      this.tip(tip);
    }
    this.highway.syncRows();
    this.bus.send(report.committed, this.beatSeconds());
    if (report.access) this.onAccess(report.access.slot, report.access.access);
    this.panel.refresh();
    this.syncClock();
    const look = this.closeLook;
    const done = report.committed;
    if (look && done?.seq === look.seq) {
      this.closeLook = undefined;
      this.landing = true;
      // Once the answer has travelled up the wire into its register (or memory).
      this.time.delayedCall(this.beatSeconds() * 1000 + 250, () => {
        this.landing = false;
        this.guide.tour(this.words.closeLookDone(done.instr, look.reads, done), (target) => this.where(target), () => {});
      });
    }
  }

  /**
   * Tier 1's practice: the first instruction of each kind gets a close look
   * from TICK as it reaches the line, with the numbers really in its
   * registers (and memory), and again once it has run (onCycle). Returns
   * whether it started.
   */
  private lookClosely(): boolean {
    const slot = this.run.pipeline.stages.ID;
    if (!this.setup.singleCycle || !this.setup.practice || !slot || this.explained.has(slot.instr.op)) return false;
    // One at a time: the last one's answer lands, and TICK says so, first.
    if (this.guide.waiting || this.landing || this.closeLook) return false;
    const { instr } = slot;
    // The single-cycle CPU runs it as its beat ends, so the registers and memory still hold what it will read.
    const { regs, memory } = this.run.pipeline.cpu;
    const b = 'rs2' in instr ? regs[instr.rs2] : 0;
    const byte = instr.op === 'lb' ? memory[addressOf(regs[instr.rs1], instr.imm)] : 0;
    const reads: Reads = { a: regs[instr.rs1], b, byte, total: keepsTotal(this.run.pipeline.cpu.program, slot.pc) };
    this.explained.add(instr.op);
    this.closeLook = { seq: slot.seq, reads };
    this.guide.tour(this.words.closeLook(instr, reads), (target) => this.where(target), () => {});
    return true;
  }

  /**
   * A load or store reached memory. A hit (or anything that fits in the
   * cycle) is done; a longer trip freezes the song for a few beats while the
   * block comes from RAM, and its line fills when it arrives.
   */
  private onAccess(slot: Slot, access: Access): void {
    if (this.freezeView) this.endFreeze(this.freezeView);
    this.words.remember(slot, access);
    this.panel.showAccess(this.words.lookup(slot, access), access);
    if (access.cycles > 1) {
      const total = access.cycles - 1;
      this.freezeView = { start: this.run.dueBeat, beats: freezeBeats(total), base: this.run.memoryBeats, total, slot, access };
      this.panel.markBlock(access.address, this.freezeView.beats * this.beatSeconds());
    } else {
      this.panel.fillLine(access);
    }
    this.tip(this.words.access(access));
  }

  /**
   * After each cycle: an overheat stops the clock and wears the chip (saved
   * until it's repaired), and a turned dial changes the tempo.
   */
  private syncClock(): void {
    const { chip } = this.run;
    if (chip.overheats > this.overheatsShown) {
      this.overheatsShown = chip.overheats;
      this.buzz();
      if (!this.setup.watching && !this.setup.practice) updateProgress((p) => ({ ...p, chipMaxDial: chip.maxDial }));
    }
    if (chip.clockRatio === this.tempoRatio) return;
    this.tempoRatio = chip.clockRatio;
    this.conductor?.setTempo(this.tempo());
  }

  /** Every frame: the gauge, the fire effects growing with the temperature, and what a stopped clock means. */
  private updateHeat(now: number): void {
    const { chip } = this.run;
    this.gauge.update(chip, now);
    this.heat.update(chip.temperature, chip.throttleAt, chip.halted, now);
    if (this.setup.practice) return;
    if (chip.halted) this.panel.say(this.words.halted(chip));
    else if (this.wasHalted) this.panel.say(this.words.resumed(chip));
    this.wasHalted = chip.halted;
  }

  private buzz(): void {
    this.cue('mistake');
  }

  /** A practice tip, the first time it comes up. Returns whether it was shown. */
  private tip(tip: Tip | undefined): boolean {
    // Not over TICK's tour or a close look still under way: the tip waits for the next time it comes up.
    if (!this.setup.practice || !tip || this.explained.has(tip.id) || this.guide.touring || this.landing || this.closeLook) return false;
    this.explained.add(tip.id);
    this.guide.say({ say: tip.message, point: this.where(tip.point ?? 'line'), dim: TIP_DIM, keys: '[ENTER] OK', hold: true });
    return true;
  }

  // ---- memory waits ----

  /**
   * Beats the song has spent frozen waiting for memory, up to `beat`. Notes
   * are placed on a clock that stops during those beats, so they hold still.
   */
  private frozenBeats(beat: number): number {
    const view = this.freezeView;
    if (!view) return this.run.memoryBeats;
    return view.base + Phaser.Math.Clamp(beat - view.start, 0, view.beats);
  }

  /**
   * Every frame of a memory wait: the waiting note pulses, the request runs
   * up the bus to memory and the data comes back, and a counter rolls up the
   * real cycles. When it's over, a missed block fills its cache line.
   */
  private updateFreeze(beat: number, now: number): void {
    this.highway.hideWaiting();
    const view = this.freezeView;
    if (!view) return;
    if (!this.run.frozen && beat >= view.start + view.beats) {
      this.endFreeze(view);
      return;
    }
    const t = Phaser.Math.Clamp((beat - view.start) / view.beats, 0, 1);
    const { access } = view;
    const block = this.highway.showWaiting(view.slot.seq, this.words.waitingTag(access), now);
    if (block) {
      const rowY = this.panel.memoryY(access.address) ?? this.setup.rows.MEM;
      this.bus.trip(block.box, rowY, t, this.words.trip(access, t >= 0.5, this.view.shown.memory[access.address]));
    }
    if (this.run.chip.halted) return; // the overheat message wins
    this.panel.say(this.words.waiting(view, Math.min(view.total, Math.round(view.total * t))));
  }

  /** The wait is over: a missed block lands in its cache line, and the song moves again. */
  private endFreeze(view: FreezeView): void {
    this.freezeView = undefined;
    this.highway.endWaiting(view.slot.seq);
    this.panel.fillLine(view.access);
    if (!this.setup.practice && !this.run.chip.halted) this.panel.say(this.words.arrived());
    this.panel.refresh();
  }

  // ---- the beat clock, and replay speed ----

  private speed(): number {
    return this.setup.watching ? REPLAY_SPEEDS[this.speedIndex] : 1;
  }

  /** Seconds per beat as currently played (replays may run faster or slower). */
  private beatSeconds(): number {
    return this.run.secondsPerBeat / this.speed();
  }

  /** Beats per minute right now: the tier's tempo, sped up by overclocking, times the replay speed. */
  private tempo(): number {
    return this.baseBpm * this.run.chip.clockRatio * this.speed();
  }

  /** (Re)starts the beat clock and music; replays restart it when the speed changes. */
  private startConductor(): void {
    this.conductor?.stop();
    const conductor = new Conductor(this.ctx, this.tempo());
    conductor.offset = getSettings().offset;
    conductor.clickLevel = this.paused ? 0 : SONG_CLICK;
    let wasFrozen = false;
    conductor.onBeat = (beat, time) => {
      if (beat <= this.firstBeat || this.finished || this.paused) return;
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
      if (!this.run.chip.halted) this.music.playBeat(beat - this.firstBeat - 1, time, spb, this.run.pipeline.occupancy);
    };
    conductor.start();
    this.conductor = conductor;
  }

  private setSpeed(index: number): void {
    const next = Phaser.Math.Clamp(index, 0, REPLAY_SPEEDS.length - 1);
    if (next === this.speedIndex) return;
    this.speedIndex = next;
    this.startConductor();
    this.replayControls.render(this.speedIndex, this.paused);
  }

  private pause(): void {
    this.paused = true;
    if (this.conductor) this.conductor.clickLevel = 0;
    this.replayControls.render(this.speedIndex, this.paused);
  }

  private resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.conductor) this.conductor.clickLevel = SONG_CLICK;
    this.replayControls.hideInfo();
    this.replayControls.render(this.speedIndex, this.paused);
  }

  // ---- the end ----

  /**
   * The program is done once its last instruction reaches WB. Let it finish
   * that beat, slide out of the pipeline, and land its value, then show results.
   */
  private drainAndFinish(beat: number): void {
    // The last instruction entered WB just before this beat; it leaves once the beat has passed.
    this.endBeat ??= this.run.dueBeat + 0.25;
    if (beat < this.endBeat) return;
    this.highway.empty();
    if (!this.bus.busy) this.finish();
  }

  private finish(): void {
    this.finished = true;
    this.conductor?.stop();
    this.heat.stop();
    this.highway.hideHazard();
    this.guide.quiet();
    this.replayControls.hideInfo();
    const { setup } = this;
    if (!setup.practice && !setup.watching) {
      // The contract pays as soon as the run is done (once: replays don't pay again).
      const { contract } = setup;
      // On time or late is judged by this run's pace: its CPI and the clocks it actually ran at.
      const late = contract ? jobSeconds(this.run, contract) > contract.deadline : false;
      if (contract) updateProgress((p) => completeContract(p, contract.id, Math.random, late));
      // Every real run is followed by its replay; the results come at the end of it.
      this.guide.say({ say: 'Run complete! Now watch your replay. Click anything in it to learn what it is.', dim: 0.3, keys: '[ENTER] OK', hold: true });
      const recording: Recording = {
        cycles: this.recording,
        dials: this.dialRecording,
        maxDial: setup.maxDial,
        canOverclock: setup.canOverclock,
        paid: Boolean(contract),
        late,
      };
      this.time.delayedCall(2000, () => this.scene.restart(watch(setup, recording)));
      return;
    }
    this.showingResults = true;
    const lines = setup.practice
      ? practiceLines(this.run, setup.returnTo)
      : resultLines({
          run: this.run,
          setup,
          tierTitle: this.words.tierTitle(),
          freshCpu: this.freshCpu,
          dials: setup.replay?.dials ?? this.dialRecording,
          money: getProgress().money,
        });
    const height = Math.min(524, lines.length * 21 + 36);
    const box = new Box(this, this.era, WIDTH / 2, HEIGHT / 2, 820, height).setDepth(500);
    // Left-aligned so the charts' columns line up.
    const text = this.text(WIDTH / 2, HEIGHT / 2, lines.join('\n'), 15).setAlign('left').setDepth(501).setLineSpacing(4);
    glideIn(this, [box.body, text]);
  }
}
