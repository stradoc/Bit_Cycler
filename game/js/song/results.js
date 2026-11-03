import { formatHours, formatMoney } from '../format.js';
import { L1_BASE, sameShape } from '../sim/memory.js';
import { perfectCycles } from '../sim/pipeline.js';
import { payFor } from '../sim/progress.js';
import { callsLine } from '../rhythm/skills.js';
import { pipelineOptions } from './setup.js';
/** The whole contract's time at this run's pace: its CPI and the clocks it actually ran at. */
export function jobSeconds(run, contract) {
    const p = run.pipeline;
    const { chip } = run;
    const micros = (chip.totalMicros / Math.max(1, chip.cycles)) * p.cycles;
    return (contract.instructions * (micros / Math.max(1, p.instructions))) / 1e6;
}
/** Practice's results: it ran safely, and how often you stalled. */
export function practiceLines(run, returnTo) {
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
/** A finished run's report. */
export function runReport(f) {
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
    const counts = [['finished', worked], ['stalled', p.stalls], ['flushed', p.flushed], ['ram', p.memoryCycles], ['refill', p.refillCycles], ['fill', fill]];
    const rated = pipelineOptions(setup, ratedMhz);
    const best = (options, guesses) => perfectCycles(f.freshCpu, options, guesses) / n / (ratedMhz * 1e6);
    const compare = [];
    if (setup.superscalar)
        compare.push({ cpu: 'one-at-a-time', time: best({ ...rated, superscalar: false }, 'hardware') });
    if (setup.predictor)
        compare.push({ cpu: 'predictor-alone', time: best(rated, 'hardware') });
    else if (setup.guessing)
        compare.push({ cpu: 'never-guessing', time: best({ ...rated, predictor: undefined }, 'hardware') });
    else if (setup.forwarding)
        compare.push({ cpu: 'no-forwarding', time: best({ ...rated, forwarding: false }) });
    if (setup.l1)
        compare.push({ cpu: 'no-cache', time: best({ ...rated, cache: undefined }) });
    // An upgraded L1 against the first one: what the upgrades bought.
    if (setup.l1 && !sameShape(setup.l1, L1_BASE))
        compare.push({ cpu: 'first-l1', time: best({ ...rated, cache: L1_BASE }) });
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
        clock: chip.cycles > 0 && (f.dials.some((d) => d !== 1) || chip.overheats > 0)
            ? { averageMhz: Number((1 / period / 1e6).toPrecision(3)), peak: Math.round(chip.peak), overheats: chip.overheats, maxDial: chip.maxDial }
            : undefined,
    };
}
/** Each use's mark in the cycles' bar (the pipeline filling is its empty part), and its name in the key under it. */
const USE_MARKS = {
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
const VERDICTS = {
    'on-time': { word: 'ON TIME', tone: 'good' },
    late: { word: 'LATE', tone: 'bad' },
    done: { word: 'DONE', tone: 'info' },
};
/**
 * The results card: the verdict as a stamp, the pay and the job's time
 * against its deadline (the part TICK calls the verdict), where the cycles
 * went (the cycles), the right calls, and the keys.
 */
export function resultCard(report) {
    const rows = [];
    const { job } = report;
    if (job) {
        rows.push({ kind: 'line', left: report.client, right: report.verdict === 'late' ? `HALF PAY: ${formatMoney(job.pay)}` : `PAID ${formatMoney(job.pay)}`, part: 'verdict' }, { kind: 'line', left: `THE JOB TOOK ${formatHours(job.seconds)}`, right: `DUE IN ${formatHours(job.deadline)}`, part: 'verdict' }, { kind: 'deadline', seconds: job.seconds, deadline: job.deadline, part: 'verdict' }, { kind: 'gap' });
    }
    else {
        rows.push({ kind: 'line', left: report.client, part: 'verdict' }, { kind: 'gap' });
    }
    // Where the cycles went: a bar, then its key. A single-cycle CPU's lost cycles are misses, not stalls.
    const name = (use) => (use === 'stalled' && report.singleCycle ? 'MISSED' : USE_MARKS[use].name);
    rows.push({ kind: 'line', left: `WHERE THE ${report.cycles} CYCLES WENT`, right: `CPI ${report.cpi.toFixed(2)}`, part: 'cycles' }, {
        kind: 'stack',
        segments: report.uses.flatMap(({ use, cycles }) => {
            const { mark } = USE_MARKS[use];
            return mark === 'empty' ? [] : [{ value: cycles, tone: mark }];
        }),
        total: report.cycles,
        part: 'cycles',
    }, {
        kind: 'legend',
        entries: report.uses.map(({ use, cycles }) => ({ mark: USE_MARKS[use].mark, text: `${cycles} ${name(use)}${use === 'finished' && report.pairs > 0 ? `, ${report.pairs} AS PAIRS` : ''}` })),
        part: 'cycles',
    });
    const calls = callsLine(report.calls);
    if (calls)
        rows.push({ kind: 'gap' }, { kind: 'line', left: calls });
    // A paid contract goes back to the board; any other run plays again.
    const next = report.job ? '[ENTER] CONTRACT BOARD' : '[ENTER] PLAY AGAIN';
    return { stamp: { ...VERDICTS[report.verdict], part: 'verdict' }, rows, keys: `${next}   [W] WATCH AGAIN   [T] ASK TICK   [Q] MENU`, width: CARD_WIDTH };
}
//# sourceMappingURL=results.js.map