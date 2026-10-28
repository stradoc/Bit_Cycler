/**
 * Keyboard-navigation extensions (Vimium, Surfingkeys, Tridactyl...) bind single
 * letters such as f, j, d and r, and swallow them before the page sees them.
 * They all pass keys through while a text field has focus, so the game keeps
 * focus on an invisible input. Key events still bubble up to `window`, where
 * Phaser and the play scene listen.
 */
export function keepKeyboardFocus(): void {
  const sink = document.createElement('input');
  sink.type = 'text';
  sink.tabIndex = -1;
  sink.autocomplete = 'off';
  sink.setAttribute('aria-hidden', 'true');
  sink.setAttribute('inputmode', 'none'); // no on-screen keyboard on touch devices
  Object.assign(sink.style, {
    position: 'fixed',
    left: '-100px',
    top: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
  });
  document.body.append(sink);

  const focus = () => sink.focus({ preventScroll: true });
  sink.addEventListener('input', () => (sink.value = '')); // never accumulate typed text
  // Extensions blur the field on Escape; take focus straight back.
  sink.addEventListener('blur', () => setTimeout(focus, 0));
  window.addEventListener('pointerdown', focus);
  focus();
}
