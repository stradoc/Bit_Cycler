// Reputation: how the companies see you, as two counts. GOOD counts jobs done
// on time and never goes down; it sets your level, and each level pays more.
// BAD counts late jobs: each mark cuts pay a little, and marks fade (a job on
// time takes one off, and so does ending a day), so a rough patch costs for a
// while but never undoes what you built. In the first week pay never drops
// below normal. The player sees only the level's name, as a STATUS (and the
// board's badge); the rates and the marks stay hidden. The numbers are REPUTATION (data/economy.ts); this module is
// the only place that works out a level, a multiplier or reputation's words.
// Later rewards (special jobs, cosmetics, sketchier clients) read `good` and
// `bad` through it, so BAD stays its own count.
import { REPUTATION } from '../data/economy.js';
import { ASCII, bar } from '../visual/asciiChart.js';
/** A new player's: nothing either way. */
export const NO_REPUTATION = { good: 0, bad: 0 };
/** The level GOOD has reached (its place in the table), and the next one if there is one. */
export function levelOf(reputation) {
    let index = 0;
    REPUTATION.levels.forEach((level, i) => {
        if (reputation.good >= level.good)
            index = i;
    });
    return { index, level: REPUTATION.levels[index], next: REPUTATION.levels[index + 1] };
}
/** The first week (days 1 to REPUTATION.graceDays): companies forgive a new player, so pay never drops below normal. */
export function inGrace(day) {
    return day <= REPUTATION.graceDays;
}
/** The level's rate less REPUTATION.cutPerMark for each bad mark, before any floor. */
function markedPay(reputation) {
    return levelOf(reputation).level.pay * (1 - REPUTATION.cutPerMark * reputation.bad);
}
/** What jobs pay at now: the level's rate, less REPUTATION.cutPerMark for each bad mark, never below the day's floor. */
export function payMultiplier(reputation, day) {
    const floor = inGrace(day) ? REPUTATION.floor.grace : REPUTATION.floor.after;
    return Math.max(floor, markedPay(reputation));
}
/** A job finished on `day`: on time, GOOD goes up by its grade's weight and a bad mark fades; late, a bad mark. */
export function afterJob(reputation, grade, late) {
    const after = late
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
export function afterDay(reputation) {
    return { ...reputation, bad: Math.max(0, reputation.bad - REPUTATION.fades.dayEnd) };
}
/** A saved reputation, in range (saveFile.ts): whole numbers from 0; anything else starts again at nothing. */
export function cleanReputation(raw) {
    if (typeof raw !== 'object' || raw === null)
        return NO_REPUTATION;
    const { good, bad } = raw;
    const count = (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1e6;
    return count(good) && count(bad) ? { good: good, bad: bad } : NO_REPUTATION;
}
/** A pay multiplier as the game writes it: "x1.35". */
export function multiplierText(multiplier) {
    return `x${multiplier.toFixed(2)}`;
}
/** The developer screen's and the cheats' line, numbers and all: "TRUSTED ##.. +24 -2  PAY x1.80" (the level, how far up the levels it is, GOOD, BAD if any, the pay). The player sees only statusLine. */
export function reputationLine(reputation, day, glyphs = ASCII) {
    const { index } = levelOf(reputation);
    const top = REPUTATION.levels.length - 1;
    const marks = reputation.bad > 0 ? ` -${reputation.bad}` : '';
    return `${levelOf(reputation).level.name} ${bar(index, top, top, glyphs)} +${reputation.good}${marks}  PAY ${multiplierText(payMultiplier(reputation, day))}`;
}
/** What the player sees of reputation (the board): the level's name, nothing more. The rates and bad marks stay hidden. */
export function statusLine(reputation) {
    return `STATUS: ${levelOf(reputation).level.name}`;
}
/** The results card's line for a job: only when it raised the status. */
export function changeLine(change) {
    return change.levelUp ? `NEW STATUS: ${change.levelUp}` : undefined;
}
//# sourceMappingURL=reputation.js.map