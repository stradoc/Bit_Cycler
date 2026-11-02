import { shortDate } from '../sim/workday.js';
import { bar } from '../visual/asciiChart.js';
// The game's measurable learning objective, and how it's measured: after
// playing, the player should understand a pipelined CPU's control decisions,
// determining which unit each instruction goes to, when it must wait for a
// value that isn't ready yet, and which way a branch will go (and, superscalar,
// which two can start together). Each of those
// is a call the player makes in every song, so each is counted: right calls
// out of all, job by job (missed and off-beat presses are timing, not
// understanding, so they don't count). The results card shows a job's calls;
// REPORT.TXT on the main menu charts them over the jobs played.
/** The control unit's three kinds of call, in the order the tiers bring them. */
export const SKILLS = ['routing', 'hazards', 'branches', 'pairing'];
/** How each kind of call is named: in full, short (the results card), what it is, and the tier it starts at. */
export const SKILL_WORDS = {
    routing: { name: 'ROUTING', short: 'ROUTE', what: 'WHICH UNIT EACH INSTRUCTION GOES TO', from: 'TIER 1' },
    hazards: { name: 'HAZARDS', short: 'HAZARD', what: "WAITING ONLY WHEN A VALUE ISN'T READY", from: 'THE PIPELINE (TIER 2)' },
    branches: { name: 'BRANCHES', short: 'BRANCH', what: 'WHICH WAY EACH BRANCH GOES', from: 'BRANCH GUESSING (TIER 4)' },
    pairing: { name: 'PAIRING', short: 'PAIR', what: 'WHICH TWO CAN START TOGETHER', from: 'SUPERSCALAR (TIER 7)' },
};
export const NO_CALLS = { routing: { right: 0, total: 0 }, hazards: { right: 0, total: 0 }, branches: { right: 0, total: 0 }, pairing: { right: 0, total: 0 } };
const add = (tally, skill, right) => ({
    ...tally,
    [skill]: { right: tally[skill].right + (right ? 1 : 0), total: tally[skill].total + 1 },
});
/**
 * One cycle's calls added to `tally`. Routing: an instruction sent to the
 * right unit, or the wrong one. Hazards: at a hazard, a stall (right) or
 * issuing anyway (wrong); with no hazard, a stall for nothing (wrong).
 * Branches (when the player guesses them, `guessing`): each guess as it's
 * decided. A missed or off-beat press is timing, so it isn't a call.
 */
export function tallyCycle(tally, report, guessing) {
    let out = tally;
    const d = report.decision;
    if (d) {
        if (d.outcome === 'issued' || d.outcome === 'paired')
            out = add(out, 'routing', true);
        else if (d.outcome === 'wrong-unit')
            out = add(out, 'routing', false);
        // Pairing (superscalar): a chord on two that could go together, a chord on two that couldn't, or one key when two could.
        if (d.outcome === 'paired')
            out = add(out, 'pairing', true);
        else if (d.outcome === 'wrong-pair' || (d.outcome === 'issued' && d.pairable))
            out = add(out, 'pairing', false);
        if (d.outcome === 'stalled')
            out = add(out, 'hazards', true);
        else if (d.outcome === 'violation' || d.outcome === 'wasted-stall')
            out = add(out, 'hazards', false);
    }
    if (guessing && report.mispredicted !== undefined)
        out = add(out, 'branches', !report.mispredicted);
    return out;
}
/** How many jobs the save remembers. */
export const SKILL_JOBS_KEPT = 200;
/** The log with one more job (the oldest dropped past SKILL_JOBS_KEPT). */
export function logJob(log, job) {
    return [...log, job].slice(-SKILL_JOBS_KEPT);
}
/**
 * A saved log, cleaned: anything that isn't a job's record is dropped, and a
 * kind of call a job has no count for (one saved before pairing existed) is none.
 */
export function cleanSkillLog(value) {
    if (!Array.isArray(value))
        return [];
    const count = (c) => {
        const o = c;
        return typeof o?.right === 'number' && typeof o?.total === 'number' && o.right >= 0 && o.right <= o.total;
    };
    return value
        .filter((job) => typeof job?.day === 'number' && typeof job?.tier === 'number' && SKILLS.every((skill) => job?.calls?.[skill] === undefined || count(job.calls[skill])))
        .map((job) => ({ day: job.day, tier: job.tier, calls: { ...NO_CALLS, ...job.calls } }))
        .slice(-SKILL_JOBS_KEPT);
}
/** Several jobs' calls added up. */
export function totalCalls(jobs) {
    return jobs.reduce((sum, job) => Object.fromEntries(SKILLS.map((skill) => [skill, { right: sum[skill].right + job.calls[skill].right, total: sum[skill].total + job.calls[skill].total }])), NO_CALLS);
}
const percent = ({ right, total }) => Math.round((right / total) * 100);
/** A job's calls in one line, for the results card ("RIGHT CALLS: ROUTE 26/26  HAZARD 4/5"); empty if it had none. */
export function callsLine(calls) {
    const parts = SKILLS.filter((skill) => calls[skill].total > 0).map((skill) => `${SKILL_WORDS[skill].short} ${calls[skill].right}/${calls[skill].total}`);
    return parts.length > 0 ? `RIGHT CALLS: ${parts.join('  ')}` : '';
}
/** How many of the latest jobs the report's columns and charts show. */
const RECENT = 5;
const CHART_JOBS = 8;
/**
 * REPORT.TXT: what the game measures, the player's right calls of each kind
 * (all jobs and the latest ones), then a page charting each kind job by job.
 */
export function skillReport(log) {
    const objective = [
        'WHAT THIS MEASURES',
        "AFTER PLAYING, YOU SHOULD UNDERSTAND A CPU'S",
        'CONTROL DECISIONS: WHICH UNIT EACH INSTRUCTION',
        'GOES TO, WHEN IT MUST WAIT FOR A VALUE, AND',
        'WHICH WAY A BRANCH GOES. EACH IS A CALL YOU MAKE.',
        "(MISSED AND OFF-BEAT PRESSES DON'T COUNT.)",
    ];
    if (log.length === 0)
        return { title: 'REPORT', pages: [[...objective, '', 'NO JOBS PLAYED YET: TAKE ONE FROM THE BOARD.']] };
    const all = totalCalls(log);
    const recent = totalCalls(log.slice(-RECENT));
    const cell = (count) => (count.total > 0 ? `${percent(count)}% OF ${count.total}` : '--').padEnd(16);
    const summary = [
        ...objective,
        '',
        `${''.padEnd(10)}${'ALL JOBS'.padEnd(16)}LAST ${RECENT} JOBS`,
        ...SKILLS.map((skill) => `${SKILL_WORDS[skill].name.padEnd(10)}${cell(all[skill])}${cell(recent[skill]).trimEnd()}`),
    ];
    const charts = SKILLS.map((skill) => {
        const jobs = log.filter((job) => job.calls[skill].total > 0).slice(-CHART_JOBS);
        const heading = `${SKILL_WORDS[skill].name}: ${SKILL_WORDS[skill].what}`;
        if (jobs.length === 0)
            return [heading, '', 'NO CALLS YET.', `THEY START WITH ${SKILL_WORDS[skill].from}.`];
        return [
            heading,
            `RIGHT CALLS IN YOUR LAST ${jobs.length === 1 ? 'JOB' : `${jobs.length} JOBS`}, OLDEST FIRST:`,
            '',
            ...jobs.map((job) => {
                const count = job.calls[skill];
                return `${shortDate(job.day).padEnd(7)}T${job.tier}  [${bar(count.right, count.total, 10)}] ${`${percent(count)}%`.padStart(4)}  ${count.right}/${count.total}`;
            }),
        ];
    });
    return { title: 'REPORT', pages: [summary, ...charts] };
}
//# sourceMappingURL=skills.js.map