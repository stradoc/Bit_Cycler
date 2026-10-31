// Files on the player's computer: exporting a save, and reading one back in.
/** A save is a few kilobytes; anything far bigger isn't one. */
const MAX_BYTES = 1_000_000;
/** Downloads `text` as a file named `name`. */
export function downloadText(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/**
 * Asks the player to choose a file and reads it as text: null if they cancel.
 * Browsers only open the file picker in answer to a key press or click, so
 * call it from one.
 */
export function pickTextFile() {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file || file.size > MAX_BYTES)
                return resolve(null);
            file.text().then(resolve, () => resolve(null));
        });
        input.addEventListener('cancel', () => resolve(null));
        input.click();
    });
}
//# sourceMappingURL=files.js.map