import { parseSave, saveText, type Saved } from './saveFile.ts';
import { teaching } from './settings.ts';
import { fillBoard, NEW_GAME, newCampaign, type Progress } from './sim/progress.ts';

// Saves the player's progress in the browser, like settings.ts does for
// preferences. There are three slots; one is active: everything the game
// reads and saves goes to it, the developer screen's changes too.

export type SlotId = '1' | '2' | '3';
export const CAMPAIGN_SLOTS: readonly SlotId[] = ['1', '2', '3'];

const slotKey = (slot: SlotId) => `bit-cycler-save-${slot}`;
const ACTIVE_KEY = 'bit-cycler-slot';
/** The developer screen's own save and the campaign it went back to, before it edited the active save (2026-11-01): cleared when read. */
const DEV_KEYS = { save: 'bit-cycler-save-dev', campaign: 'bit-cycler-campaign-slot' };
/** Where the only save lived before slots; moved to slot 1. */
const OLD_KEY = 'bit-cycler-save';
const SETTINGS_KEY = 'bit-cycler-settings';

let active: SlotId | undefined;
let current: Progress | undefined;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not saved, but still applies for this session.
  }
}

/** How a slot is named on screen. */
export function slotName(slot: SlotId): string {
  return `SLOT ${slot}`;
}

const isSlot = (value: string | null): value is SlotId => CAMPAIGN_SLOTS.includes(value as SlotId);

/** The save from before slots goes to slot 1, with the briefings read, which the settings used to keep. */
function migrate(): void {
  const old = read(OLD_KEY);
  if (old === null) return;
  const saved = parseSave(old);
  if (saved && read(slotKey('1')) === null) {
    let seenLessons: string[] = [];
    try {
      const lessons = JSON.parse(read(SETTINGS_KEY) ?? '{}').seenLessons;
      if (Array.isArray(lessons)) seenLessons = lessons.filter((id) => typeof id === 'string');
    } catch {
      // No settings to take them from.
    }
    write(slotKey('1'), saveText({ ...saved.progress, seenLessons }, Date.now()));
  }
  write(OLD_KEY, null);
}

/** The slot being played. */
export function activeSlot(): SlotId {
  if (!active) {
    migrate();
    // Someone left playing the old developer save goes back to the campaign they came from; that save is cleared.
    const stored = read(ACTIVE_KEY) === 'dev' ? read(DEV_KEYS.campaign) : read(ACTIVE_KEY);
    write(DEV_KEYS.save, null);
    write(DEV_KEYS.campaign, null);
    active = isSlot(stored) ? stored : '1';
    write(ACTIVE_KEY, active);
  }
  return active;
}

/** Plays `slot` from now on (empty: a new game, saved once something happens). */
export function switchSlot(slot: SlotId): void {
  active = slot;
  current = undefined;
  write(ACTIVE_KEY, slot);
}

/** What a slot holds, or null if it's empty. */
export function loadSlot(slot: SlotId): Saved | null {
  activeSlot(); // moves an old save into its slot first
  const text = read(slotKey(slot));
  return text === null ? null : parseSave(text);
}

export function hasSave(slot: SlotId = activeSlot()): boolean {
  return loadSlot(slot) !== null;
}

export function getProgress(): Progress {
  if (!current) {
    const loaded = loadSlot(activeSlot())?.progress ?? NEW_GAME;
    // ?money=5000 in the URL sets the money (dev shortcut, for trying the shop).
    const money = Number(new URLSearchParams(location.search).get('money'));
    current = fillBoard({ ...loaded, ...(money ? { money } : {}) }, Math.random);
  }
  return current;
}

export function setProgress(progress: Progress): Progress {
  current = progress;
  write(slotKey(activeSlot()), saveText(progress, Date.now()));
  return progress;
}

export function updateProgress(change: (progress: Progress) => Progress): Progress {
  return setProgress(change(getProgress()));
}

/** A new game in `slot` (erasing what was there), which becomes the active slot. */
export function newGame(slot: SlotId = activeSlot()): Progress {
  switchSlot(slot);
  // The tutorial job is part of TICK's teaching: skipped with the tutorial.
  return setProgress(teaching().tips ? newCampaign() : fillBoard(NEW_GAME, Math.random));
}

/**
 * Every save erased (the three slots), as before the game was first
 * played; slot 1 is the one played next. Settings are the
 * caller's to reset (SettingsScene's START OVER keeps the player's sound and screen).
 */
export function eraseEverything(): void {
  for (const slot of CAMPAIGN_SLOTS) write(slotKey(slot), null);
  write(OLD_KEY, null);
  switchSlot('1');
}

export function deleteSlot(slot: SlotId): void {
  write(slotKey(slot), null);
  if (slot === activeSlot()) current = undefined;
}

/** A slot's save as the text of an exported file, or null if it's empty. */
export function exportSlot(slot: SlotId): string | null {
  const saved = loadSlot(slot);
  return saved && saveText(saved.progress, saved.savedAt);
}

/** Puts an exported save into `slot`. False if the text isn't a save. */
export function importSlot(slot: SlotId, text: string): boolean {
  const saved = parseSave(text);
  if (!saved) return false;
  write(slotKey(slot), saveText(saved.progress, saved.savedAt || Date.now()));
  if (slot === activeSlot()) current = undefined;
  return true;
}
