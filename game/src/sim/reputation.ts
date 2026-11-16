// Reputation: how the companies see you, as two counts. GOOD counts jobs done
// on time and never goes down; it sets your level, and each level pays more.
// BAD counts late jobs: each mark cuts pay a little, and marks fade (a job on
// time takes one off, and so does ending a day), so a rough patch costs for a
// while but never undoes what you built. In the first week pay never drops
// below normal. The player sees only the level's name, as a STATUS (and the
// inbox's badge); the rates and the marks stay hidden. The numbers are REPUTATION (data/economy.ts); this module is
// the only place that works out a level, a multiplier or reputation's words.
// Later rewards (special jobs, cosmetics, sketchier clients) read `good` and
// `bad` through it, so BAD stays its own count.

import { REPUTATION, type GradeId } from '../data/economy.ts';
import { ASCII, bar, type Glyphs } from '../visual/asciiChart.ts';

/** The two counts: jobs done well (GOOD) and bad marks still standing (BAD). */
export type Reputation = { readonly good: number; readonly bad: number };

/** A new player's: nothing either way. */
export const NO_REPUTATION: Reputation = { good: 0, bad: 0 };

/** A level of REPUTATION.levels: its name, the GOOD it needs, and its pay. */
export type ReputationLevel = (typeof REPUTATION.levels)[number];

/** What one finished job did to reputation, worked out once, as it was paid (it travels to the results card). */
export type ReputationChange = {
  readonly before: Reputation;
  readonly after: Reputation;
  readonly late: boolean;
  /** The level's name, if this job reached a new one. */
  readonly levelUp?: string;
};

/** The level GOOD has reached (its place in the table), and the next one if there is one. */
export function levelOf(reputation: Reputation): { readonly index: number; readonly level: ReputationLevel; readonly next?: ReputationLevel } {
  let index = 0;
  REPUTATION.levels.forEach((level, i) => {
    if (reputation.good >= level.good) index = i;
  });
  return { index, level: REPUTATION.levels[index], next: REPUTATION.levels[index + 1] };
}

/** The first week (days 1 to REPUTATION.graceDays): companies forgive a new player, so pay never drops below normal. */
export function inGrace(day: number): boolean {
  return day <= REPUTATION.graceDays;
}

/** The level's rate less REPUTATION.cutPerMark for each bad mark, before any floor. */
function markedPay(reputation: Reputation): number {
  return levelOf(reputation).level.pay * (1 - REPUTATION.cutPerMark * reputation.bad);
}

/** What jobs pay at now: the level's rate, less REPUTATION.cutPerMark for each bad mark, never below the day's floor. */
export function payMultiplier(reputation: Reputation, day: number): number {
  const floor = inGrace(day) ? REPUTATION.floor.grace : REPUTATION.floor.after;
  return Math.max(floor, markedPay(reputation));
}

/** A job finished on `day`: on time, GOOD goes up by its grade's weight and a bad mark fades; late, a bad mark. */
export function afterJob(reputation: Reputation, grade: GradeId, late: boolean): ReputationChange {
  const after: Reputation = late
    ? { ...reputation, bad: reputation.bad + REPUTATION.badPerLate }
    : { good: reputation.good + REPUTATION.goodPerJob[grade], bad: Math.max(0, reputation.bad - REPUTATION.fades.onTime) };
  const [was, now] = [levelOf(reputation), levelOf(after)];
  return {
    before: reputation,
    after,
    late,
    ...(now.index > was.index ? { levelUp: now.level.name } : {}),
  };
}

/** A day ended (logging off): a bad mark fades. */
export function afterDay(reputation: Reputation): Reputation {
  return { ...reputation, bad: Math.max(0, reputation.bad - REPUTATION.fades.dayEnd) };
}

/** A saved reputation, in range (saveFile.ts): whole numbers from 0; anything else starts again at nothing. */
export function cleanReputation(raw: unknown): Reputation {
  if (typeof raw !== 'object' || raw === null) return NO_REPUTATION;
  const { good, bad } = raw as Record<string, unknown>;
  const count = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1e6;
  return count(good) && count(bad) ? { good: good as number, bad: bad as number } : NO_REPUTATION;
}

/** A pay multiplier as the game writes it: "x1.35". */
export function multiplierText(multiplier: number): string {
  return `x${multiplier.toFixed(2)}`;
}

/** The developer screen's and the cheats' line, numbers and all: "TRUSTED ##.. +24 -2  PAY x1.80" (the level, how far up the levels it is, GOOD, BAD if any, the pay). The player sees only statusLine. */
export function reputationLine(reputation: Reputation, day: number, glyphs: Glyphs = ASCII): string {
  const { index } = levelOf(reputation);
  const top = REPUTATION.levels.length - 1;
  const marks = reputation.bad > 0 ? ` -${reputation.bad}` : '';
  return `${levelOf(reputation).level.name} ${bar(index, top, top, glyphs)} +${reputation.good}${marks}  PAY ${multiplierText(payMultiplier(reputation, day))}`;
}

/** What the player sees of reputation (the board): the level's name, nothing more. The rates and bad marks stay hidden. */
export function statusLine(reputation: Reputation): string {
  return `STATUS: ${levelOf(reputation).level.name}`;
}

/** The results card's line for a job: only when it raised the status. */
export function changeLine(change: ReputationChange): string | undefined {
  return change.levelUp ? `NEW STATUS: ${change.levelUp}` : undefined;
}
