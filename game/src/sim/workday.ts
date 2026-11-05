import { GRADES, WORKDAY } from '../data/economy.ts';
import { formatClock } from '../format.ts';
import { programByName } from '../data/programs.ts';
import { completeContract, contractSeconds, fillBoard, isTutorial, payFor, type Contract, type DayRecord, type DayTally, type Progress, type Random } from './progress.ts';

// The calendar: one home for the workday (the decisions are in CHANGELOG.md,
// 2026-11-01). A day is WORKDAY.hours of your CPU's time, from 9:00. Time
// passes only as jobs are finished (each takes its job time, at the pace it
// was played) and when you log off; a job a perfect run couldn't finish
// before the end of the day is locked until tomorrow. Ending the day closes
// its timecard (remembered in the day history), drops the offers whose last
// day it was, and deals new ones. Day 1 is Monday, November 1 (WORKDAY.firstDay);
// the calendar screen shows the month, each day's record and its events.

/** Seconds in a workday, and when it starts and ends (seconds since midnight). */
export const DAY_SECONDS = WORKDAY.hours * 3600;
export const DAY_START = WORKDAY.startHour * 3600;
export const DAY_END = DAY_START + DAY_SECONDS;

/** The days' names, Monday first, and the months'. */
export const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'] as const;

const DAY_MS = 86_400_000;
const FIRST_DAY_MS = Date.UTC(WORKDAY.firstDay.year, WORKDAY.firstDay.month, WORKDAY.firstDay.date);

/** A game day as a date: its year, month (0 = January), date, and weekday (0 = Monday). */
export type CalendarDate = { readonly year: number; readonly month: number; readonly date: number; readonly weekday: number };

export function calendarDate(day: number): CalendarDate {
  const at = new Date(FIRST_DAY_MS + (day - 1) * DAY_MS);
  return { year: at.getUTCFullYear(), month: at.getUTCMonth(), date: at.getUTCDate(), weekday: (at.getUTCDay() + 6) % 7 };
}

/** The game day that falls on a date (0 or less: before the game began). */
export function dayOn(year: number, month: number, date: number): number {
  return Math.round((Date.UTC(year, month, date) - FIRST_DAY_MS) / DAY_MS) + 1;
}

export function weekday(day: number): string {
  return WEEKDAYS[calendarDate(day).weekday];
}

/** "NOV 3". */
export function shortDate(day: number): string {
  const { month, date } = calendarDate(day);
  return `${MONTHS[month].slice(0, 3)} ${date}`;
}

/**
 * The month that `day` falls in, as weeks from Monday to Sunday of game
 * days (null in the cells before the 1st and after the last).
 */
export function monthWeeks(day: number): (number | null)[][] {
  const { year, month } = calendarDate(day);
  const first = dayOn(year, month, 1);
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array<null>(calendarDate(first).weekday).fill(null), ...Array.from({ length }, (_, i) => first + i)];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

/** Seconds since midnight now: the day's start plus the seconds worked. */
export function clockSeconds(progress: Progress): number {
  return DAY_START + progress.worked;
}

/** Seconds of today's workday left (0 once it's over, overtime included). */
export function timeLeft(progress: Progress): number {
  return Math.max(0, DAY_SECONDS - progress.worked);
}

/** Today's hours are used up: the day is over, and its timecard is due. */
export function dayOver(progress: Progress): boolean {
  return progress.worked >= DAY_SECONDS;
}

/** A perfect run of the job would finish before the end of today (the tutorial job always fits: it takes no time to speak of). */
export function fitsToday(contract: Contract, progress: Progress): boolean {
  return isTutorial(contract) || contractSeconds(contract, progress) <= timeLeft(progress);
}

/**
 * A real run of a job finished: it pays (half if `late`), the clock moves on
 * by the job's time as played (`seconds`; past 5:00 it's overtime, and the
 * day is over), and the day's tally counts it.
 */
export function finishJob(progress: Progress, contract: Contract, seconds: number, late: boolean, random: Random): Progress {
  const paid = completeContract(progress, contract.id, random, late);
  const today: DayTally = {
    jobs: progress.today.jobs + 1,
    late: progress.today.late + (late ? 1 : 0),
    earned: progress.today.earned + payFor(contract, late),
  };
  return { ...paid, worked: progress.worked + seconds, today };
}

/**
 * Ends the day (logging off, or its hours used up): its timecard, then the
 * next morning: offers on their last day go, new ones are dealt (sized to
 * the CPU now), and the tally starts again.
 */
export function endDay(progress: Progress, random: Random): { progress: Progress; timecard: DayRecord } {
  const timecard: DayRecord = { ...progress.today, day: progress.day, out: clockSeconds(progress) };
  const day = progress.day + 1;
  const board = progress.board.filter((contract) => contract.expires >= day);
  const history = [...progress.history, timecard].slice(-WORKDAY.historyDays);
  const morning = fillBoard({ ...progress, day, worked: 0, today: { jobs: 0, late: 0, earned: 0 }, board, history }, random);
  return { progress: morning, timecard };
}

/** "MONDAY NOV 1, 1:40 PM": the date and time, for the boot report and the save slots. */
export function dateLine(progress: Progress): string {
  return `${weekday(progress.day)} ${shortDate(progress.day)}, ${formatClock(clockSeconds(progress))}`;
}

/** A finished day's record, if the calendar still remembers it. */
export function recordOf(progress: Progress, day: number): DayRecord | undefined {
  return progress.history.find((record) => record.day === day);
}

/**
 * Something marked on the calendar. One list, so new kinds (special
 * contracts, a campaign's deadline) are added here and every screen shows them.
 */
export type CalendarEvent = { readonly kind: 'offers-end'; readonly clients: readonly string[] };

/** What's marked on a day from today on: the offers on the board whose last day it is. */
export function eventsOn(progress: Progress, day: number): CalendarEvent[] {
  if (day < progress.day) return [];
  const ending = progress.board.filter((contract) => contract.expires === day && !isTutorial(contract));
  return ending.length > 0 ? [{ kind: 'offers-end', clients: ending.map((contract) => programByName(contract.program).client ?? contract.program) }] : [];
}

/** A grade's heading on the board (GRADES). */
export function gradeName(contract: Contract): string {
  return GRADES.find((grade) => grade.id === contract.grade)?.name ?? '';
}
