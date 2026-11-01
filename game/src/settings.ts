import { TUTORIAL, type TutorialLevel } from './data/tours.ts';
import { DEFAULT_DIFFICULTY, isDifficulty, type Difficulty } from './rhythm/tempo.ts';

export type Settings = {
  /** Audio calibration offset in seconds. */
  readonly offset: number;
  /** How fast songs go (rhythm/tempo.ts DIFFICULTIES). */
  readonly difficulty: Difficulty;
  /** The menus' computer hum (fan, mains hum, hard drive) on or off (M). */
  readonly music: boolean;
  /** Dark mode, for eras that have a dark variant (the 32-bit desktop). */
  readonly dark: boolean;
  /** Every sound's volume, 0-1. */
  readonly volume: number;
  /** Strength of the CRT eras' scanlines, glow, curve and flicker, 0-1 (visual/display.ts, visual/terminal.ts). */
  readonly crt: number;
  /** The intro has played in full once; after that it boots quickly. */
  readonly bootSeen: boolean;
  /** TICK's welcome on the main menu has played (once per computer; BRIEFS plays it again). */
  readonly welcomed: boolean;
  /** How much TICK teaches (data/tours.ts TUTORIAL), chosen at his welcome. */
  readonly tutorial: TutorialLevel;
};

const STORAGE_KEY = 'bit-cycler-settings';
const DEFAULTS: Settings = { offset: 0, difficulty: DEFAULT_DIFFICULTY, music: true, dark: false, volume: 1, crt: 1, bootSeen: false, welcomed: false, tutorial: 'full' };

let current: Settings | undefined;

export function getSettings(): Settings {
  if (!current) {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      // RELAXED MODE used to be a switch of its own: switched on, it's the RELAXED difficulty.
      const difficulty = isDifficulty(stored.difficulty) ? stored.difficulty : stored.relaxed === true ? 'relaxed' : DEFAULT_DIFFICULTY;
      delete stored.relaxed;
      current = { ...DEFAULTS, ...stored, difficulty };
    } catch {
      current = DEFAULTS; // storage blocked or corrupt: fall back to defaults
    }
  }
  return current ?? DEFAULTS;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  current = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Not saved, but still applies for this session.
  }
  return current;
}

/** What TICK teaches with the tutorial chosen: tours, lesson 1's close looks, practice's tips. */
export function teaching(): (typeof TUTORIAL)[TutorialLevel] {
  return TUTORIAL[getSettings().tutorial] ?? TUTORIAL.full;
}
