import { banner } from '../data/menuFiles.js';
import { formatHours, formatMoney } from '../format.js';
import { perfectCycles } from '../sim/pipeline.js';
import { payFor } from '../sim/progress.js';
import { deadlineBar, frame, spread, stackedBar } from '../visual/asciiChart.js';
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
    const fill = Math.max(0, p.cycles - p.instructions - p.stalls - p.flushed - p.memoryCycles - p.refillCycles);
    const counts = [['finished', p.instructions], ['stalled', p.stalls], ['flushed', p.flushed], ['ram', p.memoryCycles], ['refill', p.refillCycles], ['fill', fill]];
    const rated = pipelineOptions(setup, ratedMhz);
    const best = (options, guesses) => perfectCycles(f.freshCpu, options, guesses) / n / (ratedMhz * 1e6);
    const compare = [];
    if (setup.predictor)
        compare.push({ cpu: 'predictor-alone', time: best(rated, 'hardware') });
    else if (setup.guessing)
        compare.push({ cpu: 'never-guessing', time: best({ ...rated, predictor: undefined }, 'hardware') });
    else if (setup.forwarding)
        compare.push({ cpu: 'no-forwarding', time: best({ ...rated, forwarding: false }) });
    if (setup.l1)
        compare.push({ cpu: 'no-cache', time: best({ ...rated, cache: false }) });
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
        ramTrips: p.memory.ramTrips,
        period,
        cooling: chip.haltedMicros / n / 1e6,
        compare,
        branches: setup.guessing ? { right: p.branches - p.mispredicted, total: p.branches, predictorRight: setup.predictor ? p.branches - p.predictorMisses : undefined } : undefined,
        cache: setup.l1 && p.memory.loads > 0 ? { hits: p.memory.hits, loads: p.memory.loads } : undefined,
        clock: chip.cycles > 0 && (f.dials.some((d) => d !== 1) || chip.overheats > 0)
            ? { averageMhz: Number((1 / period / 1e6).toPrecision(3)), peak: Math.round(chip.peak), overheats: chip.overheats, maxDial: chip.maxDial }
            : undefined,
    };
}
/** Each use's character in the cycles' bar, and its name in the key under it. */
const USE_MARKS = {
    finished: { char: '#', name: 'FINISHED' },
    stalled: { char: '=', name: 'STALLED' },
    flushed: { char: 'x', name: 'FLUSHED' },
    ram: { char: '~', name: 'WAITING ON RAM' },
    refill: { char: '+', name: 'REFILLING' },
    fill: { char: '.', name: 'FILLING' },
};
/** How wide the card's lines are (characters). */
export const CARD_WIDTH = 50;
export function resultCard(report) {
    const w = CARD_WIDTH;
    const word = { 'on-time': 'ON TIME', late: 'LATE', done: 'DONE' }[report.verdict];
    const lines = [];
    const { job } = report;
    if (job) {
        lines.push(spread(report.client, report.verdict === 'late' ? `HALF PAY: ${formatMoney(job.pay)}` : `PAID ${formatMoney(job.pay)}`, w), spread(`THE JOB TOOK ${formatHours(job.seconds)}`, `DUE IN ${formatHours(job.deadline)}`, w), deadlineBar(job.seconds, job.deadline, w - 2), '');
    }
    else {
        lines.push(report.client, '');
    }
    // Where the cycles went: a bar, then its key. A single-cycle CPU's lost cycles are misses, not stalls.
    const name = (use) => (use === 'stalled' && report.singleCycle ? 'MISSED' : USE_MARKS[use].name);
    lines.push(spread(`WHERE THE ${report.cycles} CYCLES WENT`, `CPI ${report.cpi.toFixed(2)}`, w));
    lines.push(`[${stackedBar(report.uses.filter((u) => u.use !== 'fill').map((u) => ({ value: u.cycles, char: USE_MARKS[u.use].char })), report.cycles, w - 2)}]`);
    let key = '';
    for (const { use, cycles } of report.uses) {
        const entry = `${USE_MARKS[use].char} ${cycles} ${name(use)}`;
        if (key && key.length + 3 + entry.length > w) {
            lines.push(key);
            key = entry;
        }
        else
            key = key ? `${key}   ${entry}` : entry;
    }
    lines.push(key);
    // A paid contract goes back to the board; any other run plays again.
    const next = report.job ? '[ENTER] CONTRACT BOARD' : '[ENTER] PLAY AGAIN';
    return { stamp: frame(banner(word)), late: report.verdict === 'late', lines, keys: `${next}   [W] WATCH AGAIN   [T] ASK TICK   [Q] MENU` };
}
//# sourceMappingURL=results.js.map