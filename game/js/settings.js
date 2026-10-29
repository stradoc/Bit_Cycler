const STORAGE_KEY = 'bit-cycler-settings';
const DEFAULTS = { offset: 0, relaxed: false, eraIndex: 0, music: true, seenLessons: [] };
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
//# sourceMappingURL=settings.js.map