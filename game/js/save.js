import { fillBoard, NEW_GAME } from './sim/progress.js';
// Saves the player's progress in the browser, like settings.ts does for preferences.
const STORAGE_KEY = 'bit-cycler-save';
let current;
export function getProgress() {
    if (!current) {
        let loaded = NEW_GAME;
        try {
            loaded = { ...NEW_GAME, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
        }
        catch {
            // Storage blocked or corrupt: start a new game.
        }
        // ?money=5000 in the URL sets the money (dev shortcut, for trying the shop).
        const money = Number(new URLSearchParams(location.search).get('money'));
        current = fillBoard(money ? { ...loaded, money } : loaded, Math.random);
    }
    return current;
}
export function setProgress(progress) {
    current = progress;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    }
    catch {
        // Not saved, but still applies for this session.
    }
    return progress;
}
export function updateProgress(change) {
    return setProgress(change(getProgress()));
}
export function newGame() {
    return setProgress(fillBoard(NEW_GAME, Math.random));
}
//# sourceMappingURL=save.js.map