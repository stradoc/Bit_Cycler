import { TUTORIAL } from './data/tours.js';
const STORAGE_KEY = 'bit-cycler-settings';
const DEFAULTS = { offset: 0, relaxed: false, music: true, dark: false, volume: 1, crt: 1, bootSeen: false, welcomed: false, tutorial: 'full' };
let current;
export function getSettings() {
    if (!current) {
        try {
            current = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
        }
        catch {
            current = DEFAULTS; // storage blocked or corrupt: fall back to defaults
        }
    }
    return current ?? DEFAULTS;
}
export function updateSettings(patch) {
    current = { ...getSettings(), ...patch };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    }
    catch {
        // Not saved, but still applies for this session.
    }
    return current;
}
/** What TICK teaches with the tutorial chosen: tours, lesson 1's close looks, practice's tips. */
export function teaching() {
    return TUTORIAL[getSettings().tutorial] ?? TUTORIAL.full;
}
//# sourceMappingURL=settings.js.map