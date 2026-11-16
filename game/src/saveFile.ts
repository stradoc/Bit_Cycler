// The save format, kept free of browser storage so it can be tested in Node:
// the player's progress and when it was saved, as JSON. The same text goes
// into browser storage and into exported files, so an exported save can be
// imported on another computer.
import { cleanSkillLog } from './rhythm/skills.ts';
import { cleanCompanyJobs, cleanMail } from './sim/mail.ts';
import { cleanReputation } from './sim/reputation.ts';

import { CLOCK, COOLING, CPU_PARTS, GRADES, MEMORY_PARTS, WORKDAY } from './data/economy.ts';
import { chipByBits, fitChip, NEW_GAME, type Contract, type DayRecord, type Progress } from './sim/progress.ts';
import { SHOWCASES } from './sim/showcase.ts';
import { THERMAL } from './sim/thermal.ts';

const GAME = 'bit-cycler';
export const SAVE_VERSION = 1;

export type Saved = { readonly progress: Progress; readonly savedAt: number };

/** A save as text: what browser storage keeps and what an exported file holds. */
export function saveText(progress: Progress, savedAt: number): string {
  return JSON.stringify({ game: GAME, version: SAVE_VERSION, savedAt, progress });
}

/**
 * Reads a save, or null if the text isn't one. Also reads the first saves,
 * which were the progress object alone. Fields an older save lacks take a new
 * game's values, and out-of-range numbers (an edited file) are pulled back in.
 */
export function parseSave(text: string): Saved | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(data)) return null;
  const wrapped = data.game === GAME && isObject(data.progress);
  const raw = wrapped ? (data.progress as Record<string, unknown>) : data;
  if (typeof raw.money !== 'number' || !Array.isArray(raw.parts)) return null;
  const savedAt = wrapped && typeof data.savedAt === 'number' ? data.savedAt : 0;
  return { progress: cleanProgress(raw), savedAt };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/**
 * The L1's upgrades before 2026-11-16 (8 LINES, 2-WAY SETS, 8-BYTE BLOCKS),
 * now gone: an old save's are one L1 size step each, so nothing it paid for
 * is lost. Their shop keys in the log of what was bought become the L1's
 * size step. The one place the old ids survive.
 */
const OLD_L1_UPGRADES = ['lines', 'ways', 'blocks'];
const L1_SIZE_KEY = `${MEMORY_PARTS[0].id}size`;

/** Each cache level's size steps, in range: from an old save's L1 upgrades if it has them, else from its own steps. */
function cleanSizes(sizes: unknown, oldUpgrades: unknown): number[] {
  if (Array.isArray(oldUpgrades)) {
    const steps = new Set(oldUpgrades.filter((id) => OLD_L1_UPGRADES.includes(id))).size;
    return MEMORY_PARTS.map((part, i) => (i === 0 ? Math.min(steps, part.sizes.length) : 0));
  }
  const given = Array.isArray(sizes) ? sizes : [];
  return MEMORY_PARTS.map((part, i) => Math.round(clamp(given[i], 0, part.sizes.length, 0)));
}

function cleanProgress(raw: Record<string, unknown>): Progress {
  const { cacheUpgrades: oldUpgrades, ...current } = raw;
  const progress = { ...NEW_GAME, ...current } as Progress;
  // CPU parts are bought in order, so keep the parts that follow that order from the first one.
  let parts = 0;
  while (parts < CPU_PARTS.length && progress.parts[parts] === CPU_PARTS[parts].id) parts++;
  // Saves from before the chips start at 8-bit, then get the narrowest chip their parts and clock need (fitChip).
  return fitChip({
    ...progress,
    money: Math.round(clamp(progress.money, 0, 1e12, 0)),
    wordBits: chipByBits(progress.wordBits)?.bits ?? NEW_GAME.wordBits,
    parts: CPU_PARTS.slice(0, parts).map((part) => part.id),
    clockLevel: Math.round(clamp(progress.clockLevel, 0, CLOCK.factors.length - 1, 0)),
    cacheLevels: Math.round(clamp(progress.cacheLevels, 0, MEMORY_PARTS.length, 0)),
    // Saves from before the size steps have none (or their old L1 upgrades as steps).
    cacheSizes: cleanSizes(current.cacheSizes, oldUpgrades),
    // Saves from before the shop kept a log start with none (sim/showcase.ts then goes by the parts' own order).
    bought: Array.isArray(progress.bought)
      ? progress.bought
          .map((key) => (OLD_L1_UPGRADES.includes(key) ? L1_SIZE_KEY : key))
          .filter((key, i, keys) => typeof key === 'string' && keys.lastIndexOf(key) === i)
          .slice(-64)
      : [],
    cooling: Math.round(clamp(progress.cooling, 0, COOLING.length - 1, 0)),
    overclocking: progress.overclocking === true,
    deepPipeline: progress.deepPipeline === 'on' || progress.deepPipeline === 'off' ? progress.deepPipeline : 'none',
    chipMaxDial: clamp(progress.chipMaxDial, 1, THERMAL.maxDial, THERMAL.maxDial),
    // Contracts saved before deadlines existed are dropped; the board refills when loaded.
    board: Array.isArray(progress.board) ? progress.board.filter(isContract).map(cleanContract) : [],
    nextId: Math.round(clamp(progress.nextId, 1, Number.MAX_SAFE_INTEGER, 1)),
    seenLessons: Array.isArray(progress.seenLessons) ? progress.seenLessons.filter((id) => typeof id === 'string') : [],
    // Saves from before tips were remembered: none given yet.
    seenTips: Array.isArray(progress.seenTips) ? progress.seenTips.filter((id) => typeof id === 'string') : [],
    // Saves from before the calendar start on day 1 at 9:00.
    day: Math.round(clamp(progress.day, 1, Number.MAX_SAFE_INTEGER, 1)),
    worked: clamp(progress.worked, 0, 24 * 3600, 0),
    today: isObject(progress.today)
      ? {
          jobs: Math.round(clamp(progress.today.jobs, 0, 1e6, 0)),
          late: Math.round(clamp(progress.today.late, 0, 1e6, 0)),
          earned: Math.round(clamp(progress.today.earned, 0, 1e12, 0)),
        }
      : NEW_GAME.today,
    history: Array.isArray(progress.history) ? progress.history.filter(isDayRecord).slice(-WORKDAY.historyDays) : [],
    // Saves from before the calls were counted start with none.
    skills: cleanSkillLog(progress.skills),
    reputation: cleanReputation(progress.reputation),
    // Saves from before the inbox have no mail yet (loading delivers the welcome: save.ts) and no jobs counted per company.
    mail: cleanMail(progress.mail),
    companyJobs: cleanCompanyJobs(progress.companyJobs),
  });
}

function isDayRecord(value: unknown): value is DayRecord {
  return isObject(value) && ['day', 'out', 'jobs', 'late', 'earned'].every((key) => typeof value[key] === 'number');
}

/** A contract as saved: what it shows off is kept only if it's a part a job can show (sim/showcase.ts). */
function cleanContract(contract: Contract): Contract {
  const { shows, ...rest } = contract;
  return SHOWCASES.some((part) => part.id === shows) ? { ...rest, shows } : rest;
}

function isContract(value: unknown): value is Contract {
  return (
    isObject(value) &&
    typeof value.deadline === 'number' &&
    typeof value.program === 'string' &&
    typeof value.instructions === 'number' &&
    typeof value.pay === 'number' &&
    // Contracts from before the calendar (sections, no expiry day) are dropped; the board deals new ones.
    GRADES.some((grade) => grade.id === value.grade) &&
    typeof value.expires === 'number'
  );
}
