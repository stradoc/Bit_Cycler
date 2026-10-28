/** A short synthesized tone with a fast decay, played at audio-clock time `at`. */
export function blip(ctx, frequency, at = ctx.currentTime, duration = 0.06, type = 'square', volume = 0.1) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration + 0.01);
}
//# sourceMappingURL=sfx.js.map