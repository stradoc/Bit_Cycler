import { DEEP_PIPELINE } from '../data/economy.ts';
import { programByName, type ProgramSpec } from '../data/programs.ts';
import { songFor, type Song } from '../data/songs.ts';
import type { TierOptions } from '../data/tiers.ts';
import type { Judgment } from '../rhythm/judge.ts';
import type { Action, Outcome } from '../rhythm/pipelineRun.ts';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, isDifficulty, type Difficulty, type Pace } from '../rhythm/tempo.ts';
import type { PipelineOptions, Predictor } from '../sim/pipeline.ts';
import { deepActive, hasCache, ratedMhzFor, type Contract, type Progress } from '../sim/progress.ts';
import { THERMAL } from '../sim/thermal.ts';
import { ROWS, SINGLE_CYCLE_ROWS, type Rows } from './layout.ts';

// How a song is set up, worked out in one place: what it was started with (by
// flow.ts, the board, or the song starting itself again), filled in from the
// save and the URL's dev shortcuts. The scene, every part of the song screen
// and the results read this one object, so a new piece of hardware is added
// here and reaches all of them, and every retry and replay.

/** One cycle of a recorded run: the decision made (or null if nothing was in ID). */
export type Recorded = { readonly action: Action | null; readonly outcome: Outcome; readonly judgment: Judgment } | null;

/** A run just played, for its replay. */
export type Recording = {
  /** The decision on each cycle. */
  readonly cycles: readonly Recorded[];
  /** The clock dial on each cycle (G / H turn it). */
  readonly dials: readonly number[];
  /** The chip as the run started: its top clock (its wear), and whether H could pass the rated clock. */
  readonly maxDial: number;
  readonly canOverclock: boolean;
  /** The run paid its contract (half pay if `late`). */
  readonly paid: boolean;
  readonly late: boolean;
};

/**
 * What a song is started with. Anything left out comes from the save, then
 * the URL's dev shortcuts (README.md lists them).
 */
export type SongStart = TierOptions & {
  /** How fast the song goes (the settings' DIFFICULTY; ?difficulty=hard in the URL). */
  readonly difficulty?: Difficulty;
  /** The L1 data cache. */
  readonly l1?: boolean;
  /** The deep pipeline: a faster clock, dearer wrong guesses. */
  readonly deep?: boolean;
  /** Notes wait for the player, and mistakes are explained. */
  readonly practice?: boolean;
  /** The contract being played (from the board): it pays when a real run finishes. */
  readonly contract?: Contract;
  /** Practice right after buying a part: its results go back here (the board). */
  readonly returnTo?: string;
  /** A run to watch. */
  readonly replay?: Recording;
  /** The guide's tours of the song screen to play first, one after another (lesson ids in data/tours.ts SONG_TOURS). */
  readonly tour?: readonly string[];
  /** Where to go when the tour ends, instead of starting the song (a lesson with no practice). */
  readonly afterTour?: { readonly scene: string; readonly data?: object };
};

/** How this song is set up: the program, the CPU's hardware, and how it's played. */
export type SongSetup = {
  readonly program: string;
  readonly spec: ProgramSpec;
  /** The music: the program's own song (data/songs.ts), so a job always sounds the same. */
  readonly song: Song;
  /** Tier 1: every instruction does all five steps in one long beat. */
  readonly singleCycle: boolean;
  /** Tier 3: results go straight to the next instruction. */
  readonly forwarding: boolean;
  /** Tier 4: the player guesses each branch (J not taken, K taken). */
  readonly guessing: boolean;
  /** Tiers 5-6: a hardware predictor guesses first. */
  readonly predictor: Predictor | undefined;
  /** The L1 data cache (from the shop). */
  readonly l1: boolean;
  /** The deep pipeline, switched on in the shop (with branch guessing): the rated clock is faster and a wrong guess costs more. */
  readonly deep: boolean;
  /** The rated clock in MHz, from the clock upgrades owned; the dial over- or underclocks it. */
  readonly ratedMhz: number;
  /** The chip's top clock as the song starts (its wear), and whether H may pass the rated clock. */
  readonly maxDial: number;
  readonly canOverclock: boolean;
  /** Where the dial starts (?clock=150), or undefined for the rated clock. */
  readonly startDial: number | undefined;
  /** The difficulty chosen, which retries and replays keep; and the pace this song plays at (practice: always relaxed). */
  readonly difficulty: Difficulty;
  readonly pace: Pace;
  readonly practice: boolean;
  readonly contract: Contract | undefined;
  readonly returnTo: string | undefined;
  /** The run being watched, in a replay. */
  readonly replay: Recording | undefined;
  readonly watching: boolean;
  /** The guide's tours to play before the song starts, if any (only once: retries and replays drop them). */
  readonly tour: readonly string[] | undefined;
  /** Where the tour hands over to, if not to the song. */
  readonly afterTour: { readonly scene: string; readonly data?: object } | undefined;
  /** Where the EX / MEM / WB rows are drawn. */
  readonly rows: Rows;
};

/**
 * Works out a song's setup: `start` first, then the save (the parts owned
 * and the chip's wear), then the URL's dev shortcuts for anything still missing.
 */
export function songSetup(start: SongStart, progress: Progress, params: URLSearchParams): SongSetup {
  // ?single, ?forwarding, ?guessing and ?predictor=1-bit (or 2-bit) play tiers 1 and 3-6; ?practice starts in practice.
  const singleCycle = start.singleCycle ?? params.has('single');
  const predictorParam = params.get('predictor');
  const predictor = start.predictor ?? (predictorParam === '1-bit' || predictorParam === '2-bit' ? predictorParam : undefined);
  const practice = start.practice ?? params.has('practice');
  // ?contract=fair plays the board's first contract of that grade (easy, fair or stretch).
  const contract = start.contract ?? progress.board.find((c) => c.grade === params.get('contract'));
  const program = start.program ?? contract?.program ?? (predictor ? 'SUM GRID' : 'SUM ARRAY');
  const { replay } = start;
  const guessing = start.guessing ?? params.has('guessing');
  // ?deep fits the deep pipeline (on a pipelined CPU); from the save, only where branches are guessed.
  const deep = !singleCycle && (start.deep ?? ((guessing && deepActive(progress)) || params.has('deep')));
  // ?clock=150 starts the song overclocked, and allows it without the upgrade. Practice always runs at the rated clock.
  const clock = Number(params.get('clock')) / 100;
  const asked = params.get('difficulty');
  const difficulty = start.difficulty ?? (isDifficulty(asked) ? asked : DEFAULT_DIFFICULTY);
  return {
    program,
    spec: programByName(program),
    song: songFor(program),
    singleCycle,
    forwarding: start.forwarding ?? params.has('forwarding'),
    guessing,
    predictor,
    // ?cache fits the L1 cache.
    l1: start.l1 ?? (hasCache(progress) || params.has('cache')),
    deep,
    ratedMhz: ratedMhzFor(progress, !singleCycle, deep),
    // Wear is the chip's own, and a replay plays on the chip its run started on.
    // Practice always runs on a new chip, so it never overheats.
    maxDial: replay?.maxDial ?? (practice ? THERMAL.maxDial : progress.chipMaxDial),
    canOverclock: replay?.canOverclock ?? (progress.overclocking || params.has('clock')),
    startDial: clock && !practice && !replay ? clock : undefined,
    difficulty,
    pace: DIFFICULTIES[practice ? 'relaxed' : difficulty],
    practice,
    contract,
    returnTo: start.returnTo,
    replay,
    watching: replay !== undefined,
    // ?tour=tier1 plays a lesson's tour first (with ?practice); ?tour=memwall,cache plays two.
    tour: replay ? undefined : (start.tour ?? params.get('tour')?.split(',') ?? undefined),
    afterTour: replay ? undefined : start.afterTour,
    rows: singleCycle ? SINGLE_CYCLE_ROWS : ROWS,
  };
}

/** The hardware the simulator runs for this song, at a clock (MHz). */
export function pipelineOptions(setup: SongSetup, mhz: number): PipelineOptions {
  const { forwarding, predictor, singleCycle, l1, deep } = setup;
  return { forwarding, predictor, singleCycle, cache: l1, mhz, wrongGuessCycles: deep ? DEEP_PIPELINE.wrongGuessCycles : 1 };
}

// Starting the song again passes its whole setup on. songSetup reads only what
// SongStart names and works out the rest again, so the chip's wear is the save's
// latest (after an overheat in this run), unless a replay says otherwise.

/** Playing again, after practice or a replay: the same CPU, program and contract, for real. */
export function playAgain(setup: SongSetup): SongStart {
  return { ...setup, practice: false, replay: undefined, tour: undefined, afterTour: undefined };
}

/** Watching a run: the same song, playing back what was played. */
export function watch(setup: SongSetup, replay: Recording): SongStart {
  return { ...setup, practice: false, replay, tour: undefined, afterTour: undefined };
}
