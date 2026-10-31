export type Settings = {
  /** Audio calibration offset in seconds. */
  readonly offset: number;
  readonly relaxed: boolean;
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
};

const STORAGE_KEY = 'bit-cycler-settings';
const DEFAULTS: Settings = { offset: 0, relaxed: false, music: true, dark: false, volume: 1, crt: 1, bootSeen: false };

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
