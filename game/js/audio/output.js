import { getSettings, updateSettings } from '../settings.js';
// Every sound goes out through one gain per audio context, set by the volume
// setting, instead of straight to the speakers.
const outputs = new WeakMap();
/**
 * The gain for a volume setting (0-1). Squared, because hearing works in
 * ratios: on a straight line 50% sounds barely quieter than 100% and the
 * change all happens near the bottom; squared, 50% is about -12 dB, roughly
 * half as loud to the ear.
 */
const gainFor = (volume) => volume * volume;
/** Where every sound connects: the speakers, at the player's volume. */
export function output(ctx) {
    let out = outputs.get(ctx);
    if (!out) {
        out = ctx.createGain();
        out.gain.value = gainFor(getSettings().volume);
        out.connect(ctx.destination);
        outputs.set(ctx, out);
    }
    return out;
}
/** Sets and remembers the volume (0-1); sounds already playing change too. */
export function setVolume(ctx, volume) {
    updateSettings({ volume });
    const out = ctx && outputs.get(ctx);
    out?.gain.setTargetAtTime(gainFor(volume), out.context.currentTime, 0.02);
}
//# sourceMappingURL=output.js.map