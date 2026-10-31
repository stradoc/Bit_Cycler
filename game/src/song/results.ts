import { formatCount, formatDuration, formatMhz, formatMoney } from '../format.ts';
import type { PipelineRun } from '../rhythm/pipelineRun.ts';
import type { Cpu } from '../sim/cpu.ts';
import type { MissKind } from '../sim/memory.ts';
import { perfectCycles, type PipelineOptions } from '../sim/pipeline.ts';
import { payFor, type Contract } from '../sim/progress.ts';
import { bar, deadlineBar } from '../visual/asciiChart.ts';
import { MISS_WORDS } from './layout.ts';
import type { SongSetup } from './view.ts';

// The results after a song: where the cycles went (which gives the CPI), the
// time per instruction (CPI x clock period) next to the CPUs it improves on,
// and the whole contract at that pace against its deadline.

/** A finished run, and what it's compared with. */
export type Finished = {
  readonly run: PipelineRun;
  readonly setup: SongSetup;
  readonly tierTitle: string;
  /** The CPU as the program started, for the best cases. */
  readonly freshCpu: Cpu;
  readonly ratedMhz: number;
  /** The clock dial on each cycle: as played, and as watched in a replay. */
  readonly dials: readonly number[];
  readonly contract: Contract | undefined;
  readonly late: boolean;
  readonly paid: boolean;
  /** The player's money now. */
  readonly money: number;
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
    returnTo ? '[ENTER] CONTRACT BOARD' : '[ENTER] PLAY    [Q] TITLE',
  ];
}

/** This CPU's hardware, for best-case comparisons at the rated clock. */
function simOptions(f: Finished): PipelineOptions {
  const { forwarding, predictor, singleCycle, l1 } = f.setup;
  return { forwarding, predictor, singleCycle, cache: l1, mhz: f.ratedMhz };
}

/**
 * What this tier added, and the best a CPU without it could do (tier 3:
 * forwarding, tier 4: guessing, tiers 5-6: overriding the predictor).
 */
function baseline(f: Finished): { label: string; cycles: number } | undefined {
  const options = simOptions(f);
  if (f.setup.predictor) return { label: 'PREDICTOR ALONE', cycles: perfectCycles(f.freshCpu, options, 'hardware') };
  if (f.setup.guessing) return { label: 'NEVER GUESSING', cycles: perfectCycles(f.freshCpu, { ...options, predictor: undefined }, 'hardware') };
  if (f.setup.forwarding) return { label: 'NO FORWARDING', cycles: perfectCycles(f.freshCpu, { ...options, forwarding: false }) };
  return undefined;
}

/** The results of a real run (or its replay), as charts. */
export function resultLines(f: Finished): string[] {
  const { run, setup, contract } = f;
  const p = run.pipeline;
  const { chip } = run;
  const n = Math.max(1, p.instructions);
  const time = (micros: number) => formatDuration(micros / 1e6);
  // Time per instruction at the clocks actually run, plus the time the clock was stopped to cool (µs).
  const avgPeriod = chip.micros / Math.max(1, chip.cycles);
  const cooling = chip.haltedMicros / n;
  const perInstruction = p.cpi * avgPeriod + cooling;
  const lines = [`RESULTS: ${setup.spec.client ?? setup.spec.name} ON ${f.tierTitle}`];

  // Extra lines only when they apply: branch guessing, and a clock that wasn't the rated one.
  if (setup.predictor) {
    lines.push(`BRANCH GUESSES ${p.branches - p.mispredicted}/${p.branches} RIGHT (PREDICTOR ALONE: ${p.branches - p.predictorMisses}/${p.branches})`);
  } else if (setup.guessing) {
    lines.push(`BRANCH GUESSES ${p.branches - p.mispredicted}/${p.branches} RIGHT`);
  }
  if (chip.cycles > 0 && (f.dials.some((d) => d !== 1) || chip.overheats > 0)) {
    lines.push(
      `CLOCK: AVERAGE ${formatMhz(Number((1 / avgPeriod).toPrecision(3)))}, PEAK ${Math.round(chip.peak)}°C` +
        (chip.overheats > 0 ? `, OVERHEATED ${chip.overheats}x: MAX CLOCK NOW ${Math.round(chip.maxDial * 100)}%` : ''),
    );
  }
  if (chip.haltedBeats > 0) {
    lines.push(`CLOCK STOPPED TO COOL FOR ${chip.haltedBeats} BEATS: NO CYCLES, BUT ${time(chip.haltedMicros)} LOST (+${time(cooling)} PER INSTRUCTION)`);
  }

  const { memory } = p;
  if (setup.l1 && memory.loads > 0) {
    const kinds = (Object.keys(MISS_WORDS) as MissKind[]).filter((k) => memory.missKinds[k] > 0).map((k) => `${memory.missKinds[k]} ${MISS_WORDS[k]}`);
    lines.push(
      `L1 CACHE: ${memory.hits} OF ${memory.loads} LOADS HIT (${Math.round((memory.hits / memory.loads) * 100)}%)` + (kinds.length > 0 ? `, MISSES: ${kinds.join(', ')}` : ''),
    );
  }

  // Where the cycles went: every cycle either finished an instruction or was lost.
  const fill = Math.max(0, p.cycles - p.instructions - p.stalls - p.flushed - p.memoryCycles);
  const waited: [string, number][] = p.memoryCycles > 0 ? [[`WAITING ON RAM (${memory.ramTrips} TRIP${memory.ramTrips === 1 ? '' : 'S'})`, p.memoryCycles]] : [];
  const rows: [string, number][] = setup.singleCycle
    ? [['FINISHED AN INSTRUCTION', p.instructions], ['LOST (MISSED OR WRONG KEY)', p.stalls], ...waited]
    : [
        ['FINISHED AN INSTRUCTION', p.instructions],
        ['STALLED (WAITING / MISSED)', p.stalls],
        ['FLUSHED (WRONG PATH)', p.flushed],
        ...waited,
        ['FILLING AND EMPTYING', fill],
      ];
  const count = (c: number) => String(c).padStart(String(p.cycles).length);
  lines.push('', `WHERE THE ${p.cycles} CYCLES WENT`);
  for (const [label, c] of rows) lines.push(`  ${label.padEnd(27)} ${bar(c, p.cycles, 24)} ${count(c)}`);
  lines.push(`  CPI = ${p.cycles} CYCLES / ${p.instructions} INSTRUCTIONS = ${p.cpi.toFixed(2)}`);

  // Time per instruction: CPI x clock period, next to the CPU this tier improved on (all at the rated clock, RAM waits included).
  const compare: [string, number, number][] = [['YOU', p.cpi, avgPeriod]];
  const base = baseline(f);
  if (base) compare.push([`${base.label} (BEST)`, base.cycles / n, 1 / f.ratedMhz]);
  if (setup.l1) compare.push(['NO CACHE (BEST)', perfectCycles(f.freshCpu, { ...simOptions(f), cache: false }) / n, 1 / f.ratedMhz]);
  if (!setup.singleCycle) {
    const singleMhz = f.ratedMhz / 4;
    const singleCycles = perfectCycles(f.freshCpu, { ...simOptions(f), singleCycle: true, mhz: singleMhz });
    compare.push(['SINGLE-CYCLE', singleCycles / n, 1 / singleMhz]);
  }
  const slowest = Math.max(...compare.map(([, cpi, period]) => cpi * period));
  lines.push('', 'TIME PER INSTRUCTION = CPI x CLOCK PERIOD');
  for (const [label, cpi, period] of compare) {
    const sum = `${cpi.toFixed(2)} x ${time(period)} = ${time(cpi * period)}`;
    lines.push(`  ${label.padEnd(20)} ${sum.padEnd(27)} ${bar(cpi * period, slowest, 18)}`);
  }

  // The whole contract at this pace: the song is the first part of the job.
  if (contract) {
    const seconds = (contract.instructions * perInstruction) / 1e6;
    const verdict = f.late ? `LATE: HALF PAY ${formatMoney(payFor(contract, true))}` : `ON TIME: PAID ${formatMoney(contract.pay)}`;
    lines.push(
      '',
      `WHOLE CONTRACT = ${formatCount(contract.instructions)} INSTRUCTIONS x YOUR ${time(perInstruction)} = ${formatDuration(seconds)}`,
      `  NEEDED IN ${formatDuration(contract.deadline).padEnd(12)} ${deadlineBar(seconds, contract.deadline, 24)}  ${f.paid ? verdict : ''}`,
    );
    if (f.paid) lines.push(`  MONEY NOW ${formatMoney(f.money)}`);
  }

  lines.push('', contract && f.paid ? '[ENTER] CONTRACT BOARD    [W] WATCH AGAIN    [Q] TITLE' : '[ENTER] PLAY AGAIN    [W] WATCH AGAIN    [Q] TITLE');
  return lines;
}
