/**
 * Keyboard input for every scene. Phaser's keyboard plugin is disabled: it
 * re-processes its whole per-frame queue each time a new key event arrives,
 * so two key events within one frame fire earlier handlers again (skipped
 * briefing pages, double presses on slow machines).
 */
export function onKeyDown(scene, handler) {
    const listener = (event) => {
        if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey)
            handler(event);
    };
    window.addEventListener('keydown', listener);
    scene.events.once('shutdown', () => window.removeEventListener('keydown', listener));
}
/**
 * A stable name for the key pressed: 'A'-'Z' and '0'-'9' by physical key
 * (independent of case, Shift and Caps Lock), otherwise the browser's key
 * name ('Enter', 'Escape', 'ArrowLeft', ' ').
 */
export function keyOf(event) {
    if (/^Key[A-Z]$/.test(event.code))
        return event.code.slice(3);
    if (/^(Digit|Numpad)[0-9]$/.test(event.code))
        return event.code.slice(-1);
    return event.key.length === 1 ? event.key.toUpperCase() : event.key;
}
//# sourceMappingURL=keys.js.map