import { parseSave, saveText } from './saveFile.js';
import { fillBoard, NEW_GAME } from './sim/progress.js';
export const CAMPAIGN_SLOTS = ['1', '2', '3'];
const slotKey = (slot) => `bit-cycler-save-${slot}`;
const ACTIVE_KEY = 'bit-cycler-slot';
/** Where the only save lived before slots; moved to slot 1. */
const OLD_KEY = 'bit-cycler-save';
const SETTINGS_KEY = 'bit-cycler-settings';
let active;
let current;
function read(key) {
    try {
        return localStorage.getItem(key);
    }
    catch {
        return null; // storage blocked
    }
}
function write(key, value) {
    try {
        if (value === null)
            localStorage.removeItem(key);
        else
            localStorage.setItem(key, value);
    }
    catch {
        // Not saved, but still applies for this session.
    }
}
/** How a slot is named on screen. */
export function slotName(slot) {
    return slot === 'dev' ? 'DEVELOPER SAVE' : `SLOT ${slot}`;
}
const isSlot = (value) => value === 'dev' || CAMPAIGN_SLOTS.includes(value);
/** The save from before slots goes to slot 1, with the briefings read, which the settings used to keep. */
function migrate() {
    const old = read(OLD_KEY);
    if (old === null)
        return;
    const saved = parseSave(old);
    if (saved && read(slotKey('1')) === null) {
        let seenLessons = [];
        try {
            const lessons = JSON.parse(read(SETTINGS_KEY) ?? '{}').seenLessons;
            if (Array.isArray(lessons))
                seenLessons = lessons.filter((id) => typeof id === 'string');
        }
        catch {
            // No settings to take them from.
        }
        write(slotKey('1'), saveText({ ...saved.progress, seenLessons }, Date.now()));
    }
    write(OLD_KEY, null);
}
/** The slot being played. */
export function activeSlot() {
    if (!active) {
        migrate();
        const stored = read(ACTIVE_KEY);
        active = isSlot(stored) ? stored : '1';
    }
    return active;
}
/** Plays `slot` from now on (empty: a new game, saved once something happens). */
export function switchSlot(slot) {
    active = slot;
    current = undefined;
    write(ACTIVE_KEY, slot);
}
/** What a slot holds, or null if it's empty. */
export function loadSlot(slot) {
    activeSlot(); // moves an old save into its slot first
    const text = read(slotKey(slot));
    return text === null ? null : parseSave(text);
}
export function hasSave(slot = activeSlot()) {
    return loadSlot(slot) !== null;
}
export function getProgress() {
    if (!current) {
        const loaded = loadSlot(activeSlot())?.progress ?? NEW_GAME;
        // ?money=5000 in the URL sets the money (dev shortcut, for trying the shop).
        const money = Number(new URLSearchParams(location.search).get('money'));
        current = fillBoard({ ...loaded, ...(money ? { money } : {}) }, Math.random);
    }
    return current;
}
export function setProgress(progress) {
    current = progress;
    write(slotKey(activeSlot()), saveText(progress, Date.now()));
    return progress;
}
export function updateProgress(change) {
    return setProgress(change(getProgress()));
}
/** A new game in `slot` (erasing what was there), which becomes the active slot. */
export function newGame(slot = activeSlot()) {
    switchSlot(slot);
    return setProgress(fillBoard(NEW_GAME, Math.random));
}
export function deleteSlot(slot) {
    write(slotKey(slot), null);
    if (slot === activeSlot())
        current = undefined;
}
/** A slot's save as the text of an exported file, or null if it's empty. */
export function exportSlot(slot) {
    const saved = loadSlot(slot);
    return saved && saveText(saved.progress, saved.savedAt);
}
/** Puts an exported save into `slot`. False if the text isn't a save. */
export function importSlot(slot, text) {
    const saved = parseSave(text);
    if (!saved)
        return false;
    write(slotKey(slot), saveText(saved.progress, saved.savedAt || Date.now()));
    if (slot === activeSlot())
        current = undefined;
    return true;
}
//# sourceMappingURL=save.js.map