import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CycleReport, Outcome } from '../game/src/rhythm/pipelineRun.ts';
import { callsLine, cleanSkillLog, logJob, NO_CALLS, SKILL_JOBS_KEPT, skillReport, tallyCycle, totalCalls, type SkillJob, type Tally } from '../game/src/rhythm/skills.ts';
import { parseSave, saveText } from '../game/src/saveFile.ts';
import type { Slot } from '../game/src/sim/pipeline.ts';
import { NEW_GAME } from '../game/src/sim/progress.ts';

// The learning objective, measured (rhythm/skills.ts): the player's right
// calls of each kind, job by job. Checked here without a browser.

const slot = {} as Slot;
/** A cycle where the player's choice turned out `outcome`; `mispredicted` when a branch is decided. */
function cycle(outcome: Outcome | null, mispredicted?: boolean): CycleReport {
  const decision = outcome ? { slot, action: null, outcome, judgment: 'PERFECT' as const, hazard: null, waited: false } : null;
  return { event: { kind: 'idle' }, flushed: [], decision, dial: 1, mispredicted } as CycleReport;
}
const tally = (cycles: CycleReport[], guessing = false) => cycles.reduce((t, c) => tallyCycle(t, c, guessing), NO_CALLS);

test('a call is a choice: routing right or wrong, stalling at a hazard or not, each branch guess', () => {
  const t = tally([cycle('issued'), cycle('issued'), cycle('wrong-unit'), cycle('stalled'), cycle('violation'), cycle('wasted-stall')]);
  assert.deepEqual(t.routing, { right: 2, total: 3 });
  assert.deepEqual(t.hazards, { right: 1, total: 3 });
  assert.deepEqual(t.branches, { right: 0, total: 0 });
  // Timing isn't understanding: a missed or off-beat press isn't a call.
  assert.deepEqual(tally([cycle('missed'), cycle('off-beat'), cycle(null)]), NO_CALLS);
  // Branches count only when the player guesses them (tier 4 on).
  assert.deepEqual(tally([cycle(null, false), cycle(null, true)], true).branches, { right: 1, total: 2 });
  assert.deepEqual(tally([cycle(null, true)], false).branches, { right: 0, total: 0 });
});

const job = (day: number, calls: Partial<Tally>): SkillJob => ({ day, tier: 2, calls: { ...NO_CALLS, ...calls } });

test('the save keeps each job\'s calls, cleans what it reads back, and old saves start with none', () => {
  let log: SkillJob[] = [];
  for (let i = 0; i < SKILL_JOBS_KEPT + 5; i++) log = logJob(log, job(1, { routing: { right: 1, total: 1 } }));
  assert.equal(log.length, SKILL_JOBS_KEPT);
  assert.deepEqual(cleanSkillLog([job(2, {}), { day: 'x' }, { day: 1, tier: 1, calls: { routing: { right: 3, total: 2 } } }, null]), [job(2, {})]);
  assert.deepEqual(cleanSkillLog(undefined), []);
  const saved = parseSave(saveText({ ...NEW_GAME, skills: [job(3, { hazards: { right: 4, total: 5 } })] }, 0));
  assert.deepEqual(saved?.progress.skills, [job(3, { hazards: { right: 4, total: 5 } })]);
  const { skills, ...old } = NEW_GAME;
  assert.equal(skills.length, 0);
  assert.deepEqual(parseSave(saveText(old as typeof NEW_GAME, 0))?.progress.skills, []);
});

test('REPORT.TXT says what it measures, sums the calls, and charts each kind job by job', () => {
  assert.equal(skillReport([]).pages.length, 1);
  assert.ok(skillReport([]).pages[0].some((line) => line.includes('NO JOBS PLAYED YET')));
  const log = [
    job(1, { routing: { right: 9, total: 10 }, hazards: { right: 1, total: 4 } }),
    job(2, { routing: { right: 10, total: 10 }, hazards: { right: 3, total: 4 } }),
    job(3, { routing: { right: 10, total: 10 }, hazards: { right: 4, total: 4 } }),
  ];
  assert.deepEqual(totalCalls(log).hazards, { right: 8, total: 12 });
  const report = skillReport(log);
  assert.equal(report.pages.length, 4);
  const [summary, , hazards, branches] = report.pages;
  assert.ok(summary.some((line) => line.startsWith('HAZARDS') && line.includes('67% OF 12')));
  // The hazard chart rises job by job: 25%, 75%, 100%.
  assert.deepEqual(hazards.filter((line) => line.includes('%')).map((line) => line.match(/(\d+)%/)?.[1]), ['25', '75', '100']);
  assert.ok(branches.some((line) => line.includes('NO CALLS YET')));
  for (const page of report.pages) for (const line of page) assert.ok(line.length <= 50, `too wide for the viewer: ${line}`);
});

test("the results card's line names only the kinds of call the job had", () => {
  assert.equal(callsLine(NO_CALLS), '');
  assert.equal(callsLine({ ...NO_CALLS, routing: { right: 26, total: 26 }, hazards: { right: 4, total: 5 } }), 'RIGHT CALLS: ROUTE 26/26  HAZARD 4/5');
});
