export type Settings = {
  /** Audio calibration offset in seconds. */
  readonly offset: number;
  readonly relaxed: boolean;
  readonly eraIndex: number;
  /** The menus' computer hum (fan, mains hum, hard drive) on or off (M). */
  readonly music: boolean;
  /** Lesson ids whose briefing the player has finished. */
  readonly seenLessons: readonly string[];
};

const STORAGE_KEY = 'bit-cycler-settings';
const DEFAULTS: Settings = { offset: 0, relaxed: false, eraIndex: 0, music: true, seenLessons: [] };

let current: Settings | undefined;

export function getSettings(): Settings {
  if (!current) {
    try {
      current = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
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
