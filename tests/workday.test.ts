import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACTS_PER_GRADE, GRADES, WORKDAY } from '../game/src/data/economy.ts';
import { banner } from '../game/src/data/menuFiles.ts';
import { formatClock, formatHours } from '../game/src/format.ts';
import { parseSave } from '../game/src/saveFile.ts';
import { contractSeconds, fillBoard, NEW_GAME, newCampaign, type Contract, type Progress } from '../game/src/sim/progress.ts';
import { calendarDate, DAY_SECONDS, dateLine, dayOver, endDay, eventsOn, finishJob, fitsToday, monthWeeks, recordOf, shortDate, timeLeft, weekday } from '../game/src/sim/workday.ts';
import { calendarPage, monthGrid, stackedBar, timecard } from '../game/src/visual/asciiChart.ts';

// The workday: 8 hours of the CPU's time from 9:00; jobs use their time as
// played; a job that couldn't finish by 5:00 waits for tomorrow; ending the
// day closes its timecard and deals the next morning's offers.

const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const job = (seconds: number, extra: Partial<Contract> = {}): Contract => ({
  id: 99, grade: 'fair', program: 'SUM ARRAY', instructions: seconds * 1e6, deadline: 8 * 3600, pay: 100, expires: 1, ...extra,
});

test('a job fits today if a perfect run would finish by 5:00; the tutorial job always does', () => {
  const morning: Progress = { ...NEW_GAME, worked: 0 };
  assert.equal(contractSeconds(job(3 * 3600), morning), 3 * 3600); // CPI 1 at 1 MHz
  assert.ok(fitsToday(job(8 * 3600), morning));
  const afternoon: Progress = { ...morning, worked: 6 * 3600 };
  assert.equal(timeLeft(afternoon), 2 * 3600);
  assert.ok(fitsToday(job(2 * 3600), afternoon));
  assert.ok(!fitsToday(job(2 * 3600 + 60), afternoon));
  assert.ok(fitsToday(newCampaign().board[0], { ...newCampaign(), worked: DAY_SECONDS - 1 }));
});

test("finishing a job pays, moves the clock on by its time as played, and counts on the day's tally", () => {
  const board = fillBoard(NEW_GAME, seeded(5));
  const [first, second] = board.board;
  const one = finishJob(board, first, 3 * 3600, false, seeded(6));
  assert.equal(one.worked, 3 * 3600);
  assert.equal(one.money, first.pay);
  assert.deepEqual(one.today, { jobs: 1, late: 0, earned: first.pay });
  // Late: half pay, counted as late. A sloppy run past 5:00 is overtime, and the day is over.
  const two = finishJob(one, second, 6 * 3600, true, seeded(7));
  assert.equal(two.money, first.pay + Math.round(second.pay / 2));
  assert.deepEqual(two.today, { jobs: 2, late: 1, earned: first.pay + Math.round(second.pay / 2) });
  assert.ok(dayOver(two));
  assert.equal(timeLeft(two), 0);
});

test('ending the day: its timecard, then the next morning with the expired offers gone and new ones dealt', () => {
  const start = fillBoard({ ...NEW_GAME, day: 3 }, seeded(9));
  // One offer on its last day, one on offer till tomorrow.
  const lastDay = { ...start.board[0], expires: 3 };
  const tomorrow = { ...start.board[1], expires: 4 };
  const evening: Progress = { ...start, board: [lastDay, tomorrow, ...start.board.slice(2)], worked: 5 * 3600, today: { jobs: 2, late: 1, earned: 150 } };
  const { progress, timecard: card } = endDay(evening, seeded(10));
  assert.deepEqual(card, { jobs: 2, late: 1, earned: 150, day: 3, out: 14 * 3600 });
  assert.equal(progress.day, 4);
  assert.equal(progress.worked, 0);
  assert.deepEqual(progress.today, { jobs: 0, late: 0, earned: 0 });
  assert.ok(!progress.board.some((c) => c.id === lastDay.id), 'its last day is over');
  assert.ok(progress.board.some((c) => c.id === tomorrow.id), 'still on offer');
  assert.equal(progress.board.length, GRADES.length * CONTRACTS_PER_GRADE);
  // The tutorial job never expires.
  assert.equal(endDay(newCampaign(), seeded(1)).progress.board.length, 1);
});

test('the clock and the date read as a day at work', () => {
  assert.equal(formatClock(9 * 3600), '9:00 AM');
  assert.equal(formatClock(13 * 3600 + 40 * 60), '1:40 PM');
  assert.equal(formatClock(12 * 3600), '12:00 PM');
  assert.equal(formatClock(25 * 3600 + 15 * 60), '1:15 AM');
  assert.equal(formatHours(3 * 3600 + 20 * 60), '3 H 20 MIN');
  assert.equal(formatHours(4 * 3600), '4 H');
  assert.equal(formatHours(45 * 60), '45 MIN');
  assert.equal(formatHours(0.002), 'UNDER 1 MIN');
  assert.equal(formatHours(0), '0 MIN');
  assert.equal(dateLine({ ...NEW_GAME, day: 2, worked: 4.5 * 3600 }), 'TUESDAY NOV 2, 1:30 PM');
});

test('the calendar page, the timecard and the block-digit clock are drawn in even rows of characters', () => {
  const even = (lines: string[]) => assert.equal(new Set(lines.map((line) => line.length)).size, 1, lines.join('\n'));
  even(calendarPage('WEDNESDAY', 'NOV 12'));
  const card = timecard({ date: 'NOV 3', in: '9:00 AM', out: '5:00 PM', jobs: 3, late: 1, earned: '$410' });
  even(card);
  assert.ok(card.some((line) => /ON TIME +2/.test(line)));
  even(banner('12:45'));
  assert.equal(banner('12:45').length, 3);
});

test('a save from before the calendar starts on day 1 at 9:00, and its old contracts make way for sized ones', () => {
  const old = { ...NEW_GAME, board: [{ id: 1, section: 'standard', program: 'SUM ARRAY', instructions: 1e12, deadline: 86400, pay: 200 }] } as Record<string, unknown>;
  delete old.day;
  delete old.worked;
  delete old.today;
  const loaded = parseSave(JSON.stringify({ game: 'bit-cycler', version: 1, savedAt: 0, progress: old }))?.progress;
  assert.ok(loaded);
  assert.equal(loaded.day, 1);
  assert.equal(loaded.worked, 0);
  assert.deepEqual(loaded.today, { jobs: 0, late: 0, earned: 0 });
  assert.equal(loaded.board.length, 0);
});

test('day 1 is Monday, November 1, and the days run on through the months', () => {
  assert.deepEqual(calendarDate(1), { year: 2027, month: 10, date: 1, weekday: 0 });
  assert.equal(weekday(1), 'MONDAY');
  assert.equal(shortDate(30), 'NOV 30');
  assert.equal(`${weekday(31)} ${shortDate(31)}`, 'WEDNESDAY DEC 1');
  assert.equal(`${weekday(62)} ${shortDate(62)}`, 'SATURDAY JAN 1');
  assert.equal(calendarDate(62).year, 2028);
});

test("a month's grid: weeks from Monday, with blanks before the 1st and after the last", () => {
  const november = monthWeeks(10);
  assert.equal(november.length, 5);
  assert.deepEqual(november[0], [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(november[4], [29, 30, null, null, null, null, null]);
  const december = monthWeeks(40);
  assert.deepEqual(december[0], [null, null, 31, 32, 33, 34, 35], 'December 1 is a Wednesday');
  assert.ok(december.every((week) => week.length === 7));
});

test('the calendar remembers each finished day, and marks the days offers end on', () => {
  let progress = fillBoard(NEW_GAME, seeded(12));
  progress = { ...progress, worked: 6 * 3600, today: { jobs: 3, late: 1, earned: 210 } };
  progress = endDay(progress, seeded(13)).progress;
  assert.deepEqual(recordOf(progress, 1), { jobs: 3, late: 1, earned: 210, day: 1, out: 15 * 3600 });
  assert.equal(recordOf(progress, 2), undefined, 'today is not over');
  // Only the last WORKDAY.historyDays days are kept.
  for (let i = 0; i < WORKDAY.historyDays + 5; i++) progress = endDay(progress, seeded(20 + i)).progress;
  assert.equal(progress.history.length, WORKDAY.historyDays);
  assert.equal(progress.history.at(-1)?.day, progress.day - 1);
  // Every offer on the board ends today or tomorrow, and the calendar says so.
  const marked = [progress.day, progress.day + 1].flatMap((day) => eventsOn(progress, day).flatMap((event) => event.clients));
  assert.equal(marked.length, progress.board.length);
  assert.deepEqual(eventsOn(progress, progress.day - 1), [], 'nothing is marked on a day gone by');
});

test('the month grid has a box per day under the weekdays, and the workday bar can show a job after the hours used', () => {
  const lines = monthGrid(monthWeeks(1).map((week) => week.map((day) => (day === null ? null : [String(day), day === 3 ? 'TODAY' : '']))), ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
  assert.equal(new Set(lines.slice(1).map((line) => line.length)).size, 1, 'every row the same width');
  assert.match(lines[0], /MON .* SUN/);
  assert.equal(lines.length, 2 + 5 * 3, 'November: 5 weeks of 2-line boxes and their rules');
  assert.ok(lines[3].includes('|TODAY   |'), 'day 3 shows its words in its box');
  assert.equal(stackedBar([{ value: 2, tone: 'good' }, { value: 3, tone: 'warn' }], 8, 8).text, '##===...');
  assert.equal(stackedBar([{ value: 6, tone: 'good' }, { value: 4, tone: 'warn' }], 8, 8).text, '######==>', 'past the end of the day');
});
