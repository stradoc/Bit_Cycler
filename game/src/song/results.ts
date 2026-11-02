import { formatHours, formatMoney } from '../format.ts';
import type { PipelineRun } from '../rhythm/pipelineRun.ts';
import type { Cpu } from '../sim/cpu.ts';
import { perfectCycles } from '../sim/pipeline.ts';
import { payFor, type Contract } from '../sim/progress.ts';
import type { Card, CardRow, Mark, Tone } from '../visual/asciiChart.ts';
import { callsLine, type Tally } from '../rhythm/skills.ts';
import { pipelineOptions, type SongSetup } from './setup.ts';

// The results after a song, kept short: a card with the verdict (on time or
// late, as a stamp), the pay, the job's time against its deadline, and where
// the cycles went (which gives the CPI), as data each era draws its own way
// (ui/card.ts). The rest (time per instruction next to the CPUs this one
// improves on, branch guesses, the cache, the clock) is in the run's report,
// for TICK to explain when asked (SongWords.resultsTour).

/** A finished run, and what it's compared with. Its contract, and whether it paid, are in its setup. */
export type Finished = {
  readonly run: PipelineRun;
  readonly setup: SongSetup;
  /** The CPU as the program started, for the best cases. */
  readonly freshCpu: Cpu;
  /** The clock dial on each cycle. */
  readonly dials: readonly number[];
  /** The player's right calls in the run (rhythm/skills.ts). */
  readonly calls: Tally;
};

/** The whole contract's time at this run's pace: its CPI and the clocks it actually ran at. */
export function jobSeconds(run: PipelineRun, contract: Contract): number {
  const p = run.pipeline;
  const { chip } = run;
  const micros = (chip.totalMicros / Math.max(1, chip.cycles)) * p.cycles;
  return (contract.instructions * (micros / Math.max(1, p.instructions))) / 1e6;
}

/** Practice's results: it ran safely, and how often you stalled. */
export function practiceLines(run: PipelineRun, returnTo: string | undefined): string[] {
  return [
    'PRACTICE COMPLETE',
    '',
    `ALL ${run.pipeline.instructions} INSTRUCTIONS RAN SAFELY.`,
    `YOU STALLED ${run.counts.stalled} TIMES WHILE VALUES WEREN'T READY.`,
    '',
    "NOW PLAY FOR REAL: NOTES WON'T WAIT.",
    '',
    returnTo ? '[ENTER] CONTRACT BOARD' : '[ENTER] PLAY    [Q] MENU',
  ];
}

/** What a cycle went to: finishing an instruction, or one of the ways it was lost. */
export type CycleUse = 'finished' | 'stalled' | 'flushed' | 'ram' | 'refill' | 'fill';

/** A run in numbers: what the results card shows and TICK explains. Times per instruction are in seconds. */
export type RunReport = {
  readonly client: string;
  /** On time or late (a paid contract), or just done (a run that wasn't one). */
  readonly verdict: 'on-time' | 'late' | 'done';
  /** What the contract paid, the whole job's time at this run's pace, and its deadline (seconds). */
  readonly job?: { readonly pay: number; readonly seconds: number; readonly deadline: number };
  readonly cycles: number;
  readonly instructions: number;
  readonly cpi: number;
  /** Every cycle, by what it went to (only the uses that happened, finished first); they add up to `cycles`. */
  readonly uses: readonly { readonly use: CycleUse; readonly cycles: number }[];
  /** A single-cycle CPU: its lost cycles are missed beats and wrong keys, not stalls. */
  readonly singleCycle: boolean;
  /** Superscalar: cycles that started two instructions at once (among the cycles that finished work). */
  readonly pairs: number;
  /** RAM trips, for the cycles spent waiting on them. */
  readonly ramTrips: number;
  /** The average clock period actually run at, and the time the clock stopped to cool, per instruction. */
  readonly period: number;
  readonly cooling: number;
  /** Time per instruction for the CPUs this one improves on, each at its best. */
  readonly compare: readonly { readonly cpu: 'one-at-a-time' | 'no-forwarding' | 'never-guessing' | 'predictor-alone' | 'no-cache' | 'single-cycle'; readonly time: number }[];
  readonly branches?: { readonly right: number; readonly total: number; readonly predictorRight?: number };
  readonly cache?: { readonly hits: number; readonly loads: number };
  /** The player's right calls of each kind: the learning objective, measured (rhythm/skills.ts). */
  readonly calls: Tally;
  /** Only when the clock wasn't the rated one, or the chip overheated. */
  readonly clock?: { readonly averageMhz: number; readonly peak: number; readonly overheats: number; readonly maxDial: number };
};

/** A finished run's report. */
export function runReport(f: Finished): RunReport {
  const { run, setup } = f;
  const { contract, ratedMhz } = setup;
  const p = run.pipeline;
  const { chip } = run;
  const n = Math.max(1, p.instructions);
  const paid = Boolean(contract && setup.replay?.paid);
  const late = setup.replay?.late ?? false;
  // Every cycle either finished an instruction or was lost; what's left over is the pipeline filling and emptying.
  // A pair finishes two instructions in one cycle, so the cycles that finished work are the instructions less the pairs.
  const worked = p.instructions - p.pairs;
  const fill = Math.max(0, p.cycles - worked - p.stalls - p.flushed - p.memoryCycles - p.refillCycles);
  const counts: [CycleUse, number][] = [['finished', worked], ['stalled', p.stalls], ['flushed', p.flushed], ['ram', p.memoryCycles], ['refill', p.refillCycles], ['fill', fill]];
  const rated = pipelineOptions(setup, ratedMhz);
  const best = (options: typeof rated, guesses?: 'hardware') => perfectCycles(f.freshCpu, options, guesses) / n / (ratedMhz * 1e6);
  const compare: RunReport['compare'][number][] = [];
  if (setup.superscalar) compare.push({ cpu: 'one-at-a-time', time: best({ ...rated, superscalar: false }, 'hardware') });
  if (setup.predictor) compare.push({ cpu: 'predictor-alone', time: best(rated, 'hardware') });
  else if (setup.guessing) compare.push({ cpu: 'never-guessing', time: best({ ...rated, predictor: undefined }, 'hardware') });
  else if (setup.forwarding) compare.push({ cpu: 'no-forwarding', time: best({ ...rated, forwarding: false }) });
  if (setup.l1) compare.push({ cpu: 'no-cache', time: best({ ...rated, cache: false }) });
  if (!setup.singleCycle) {
    // A single-cycle CPU's clock is a quarter of a pipelined one's (its cycle is all five stages long).
    const singleMhz = ratedMhz / 4;
    compare.push({ cpu: 'single-cycle', time: perfectCycles(f.freshCpu, { ...rated, singleCycle: true, mhz: singleMhz }) / n / (singleMhz * 1e6) });
  }
  const period = chip.micros / Math.max(1, chip.cycles) / 1e6;
  return {
    client: setup.spec.client ?? setup.spec.name,
    verdict: paid ? (late ? 'late' : 'on-time') : 'done',
    job: paid && contract ? { pay: payFor(contract, late), seconds: jobSeconds(run, contract), deadline: contract.deadline } : undefined,
    cycles: p.cycles,
    instructions: p.instructions,
    cpi: p.cpi,
    uses: counts.filter(([use, cycles]) => use === 'finished' || cycles > 0).map(([use, cycles]) => ({ use, cycles })),
    singleCycle: setup.singleCycle,
    pairs: p.pairs,
    ramTrips: p.memory.ramTrips,
    period,
    cooling: chip.haltedMicros / n / 1e6,
    compare,
    branches: setup.guessing ? { right: p.branches - p.mispredicted, total: p.branches, predictorRight: setup.predictor ? p.branches - p.predictorMisses : undefined } : undefined,
    calls: f.calls,
    cache: setup.l1 && p.memory.loads > 0 ? { hits: p.memory.hits, loads: p.memory.loads } : undefined,
    clock:
      chip.cycles > 0 && (f.dials.some((d) => d !== 1) || chip.overheats > 0)
        ? { averageMhz: Number((1 / period / 1e6).toPrecision(3)), peak: Math.round(chip.peak), overheats: chip.overheats, maxDial: chip.maxDial }
        : undefined,
  };
}

/** Each use's mark in the cycles' bar (the pipeline filling is its empty part), and its name in the key under it. */
const USE_MARKS: Readonly<Record<CycleUse, { mark: Mark; name: string }>> = {
  finished: { mark: 'good', name: 'FINISHED' },
  stalled: { mark: 'warn', name: 'STALLED' },
  flushed: { mark: 'bad', name: 'FLUSHED' },
  ram: { mark: 'info', name: 'WAITING ON RAM' },
  refill: { mark: 'extra', name: 'REFILLING' },
  fill: { mark: 'empty', name: 'FILLING' },
};

/** How wide the card's rows are (characters). */
export const CARD_WIDTH = 50;

/** The verdict's word on the stamp, and its tone. */
const VERDICTS: Readonly<Record<RunReport['verdict'], { word: string; tone: Tone }>> = {
  'on-time': { word: 'ON TIME', tone: 'good' },
  late: { word: 'LATE', tone: 'bad' },
  done: { word: 'DONE', tone: 'info' },
};

/**
 * The results card: the verdict as a stamp, the pay and the job's time
 * against its deadline (the part TICK calls the verdict), where the cycles
 * went (the cycles), the right calls, and the keys.
 */
export function resultCard(report: RunReport): Card {
  const rows: CardRow[] = [];
  const { job } = report;
  if (job) {
    rows.push(
      { kind: 'line', left: report.client, right: report.verdict === 'late' ? `HALF PAY: ${formatMoney(job.pay)}` : `PAID ${formatMoney(job.pay)}`, part: 'verdict' },
      { kind: 'line', left: `THE JOB TOOK ${formatHours(job.seconds)}`, right: `DUE IN ${formatHours(job.deadline)}`, part: 'verdict' },
      { kind: 'deadline', seconds: job.seconds, deadline: job.deadline, part: 'verdict' },
      { kind: 'gap' },
    );
  } else {
    rows.push({ kind: 'line', left: report.client, part: 'verdict' }, { kind: 'gap' });
  }
  // Where the cycles went: a bar, then its key. A single-cycle CPU's lost cycles are misses, not stalls.
  const name = (use: CycleUse) => (use === 'stalled' && report.singleCycle ? 'MISSED' : USE_MARKS[use].name);
  rows.push(
    { kind: 'line', left: `WHERE THE ${report.cycles} CYCLES WENT`, right: `CPI ${report.cpi.toFixed(2)}`, part: 'cycles' },
    {
      kind: 'stack',
      segments: report.uses.flatMap(({ use, cycles }) => {
        const { mark } = USE_MARKS[use];
        return mark === 'empty' ? [] : [{ value: cycles, tone: mark }];
      }),
      total: report.cycles,
      part: 'cycles',
    },
    {
      kind: 'legend',
      entries: report.uses.map(({ use, cycles }) => ({ mark: USE_MARKS[use].mark, text: `${cycles} ${name(use)}${use === 'finished' && report.pairs > 0 ? `, ${report.pairs} AS PAIRS` : ''}` })),
      part: 'cycles',
    },
  );
  const calls = callsLine(report.calls);
  if (calls) rows.push({ kind: 'gap' }, { kind: 'line', left: calls });
  // A paid contract goes back to the board; any other run plays again.
  const next = report.job ? '[ENTER] CONTRACT BOARD' : '[ENTER] PLAY AGAIN';
  return { stamp: { ...VERDICTS[report.verdict], part: 'verdict' }, rows, keys: `${next}   [W] WATCH AGAIN   [T] ASK TICK   [Q] MENU`, width: CARD_WIDTH };
}
