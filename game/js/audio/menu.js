import { getSettings, updateSettings } from '../settings.js';
// Menu sound: the hum of an old computer left on (fan, mains hum, a faint
// CRT whine, and now and then the hard drive seeking) on the title, board,
// shop and briefings, and mechanical key presses for moving, choosing and
// buying. Songs have their own music. All synthesized: no sound files.
const FADE = 0.6; // seconds to fade the hum in or out
let context;
let noise;
/** The running hum: its master gain, its sources (to stop), and the hard drive timer. */
let hum;
function contextOf(scene) {
    return scene.sound instanceof Phaser.Sound.WebAudioSoundManager ? scene.sound.context : undefined;
}
/** Two seconds of white noise, shared by the fan, the drive and the key clicks. */
function noiseBuffer(ctx) {
    if (!noise || noise.sampleRate !== ctx.sampleRate) {
        noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++)
            data[i] = Math.random() * 2 - 1;
    }
    return noise;
}
/** A burst of filtered noise: the click of a key switch, a drive head, and so on. */
function noiseBurst(ctx, at, duration, filter, frequency, volume, destination = ctx.destination) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx);
    const band = ctx.createBiquadFilter();
    band.type = filter;
    band.frequency.value = frequency;
    band.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0005, at + duration);
    source.connect(band).connect(gain).connect(destination);
    source.start(at, Math.random() * 1.5);
    source.stop(at + duration + 0.02);
}
/** A short low tone that drops in pitch: the "thock" of a key bottoming out. */
function thock(ctx, at, frequency, volume) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, at);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.6, at + 0.05);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0005, at + 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.08);
}
/** One mechanical key press: the switch's click, then the keycap's thock. `heavy` is a bigger key. */
function keyPress(ctx, at, heavy = false) {
    const vary = 0.9 + Math.random() * 0.2;
    noiseBurst(ctx, at, 0.018, 'bandpass', 3800 * vary, heavy ? 0.22 : 0.16);
    thock(ctx, at + 0.004, (heavy ? 140 : 210) * vary, heavy ? 0.16 : 0.09);
    // The key coming back up: a softer click a moment later.
    noiseBurst(ctx, at + (heavy ? 0.09 : 0.07), 0.012, 'bandpass', 4500 * vary, 0.05);
}
/** The hard drive seeking: a few quick head clicks, then quiet for a while. */
function scheduleDrive(ctx, out) {
    if (!hum)
        return;
    const t = ctx.currentTime + 0.05;
    const clicks = 2 + Math.floor(Math.random() * 6);
    for (let i = 0; i < clicks; i++) {
        noiseBurst(ctx, t + i * (0.03 + Math.random() * 0.05), 0.012, 'bandpass', 1800 + Math.random() * 1500, 0.25, out);
    }
    hum.drive = setTimeout(() => scheduleDrive(ctx, out), 2500 + Math.random() * 6000);
}
/** Starts (or keeps) the computer's hum, unless the player turned it off. */
export function playMenuMusic(scene) {
    const ctx = contextOf(scene);
    if (!ctx || hum || !getSettings().music)
        return;
    context = ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE);
    out.connect(ctx.destination);
    const sources = [];
    // The fan: noise with the highs taken off.
    const fan = ctx.createBufferSource();
    fan.buffer = noiseBuffer(ctx);
    fan.loop = true;
    const fanFilter = ctx.createBiquadFilter();
    fanFilter.type = 'lowpass';
    fanFilter.frequency.value = 500;
    const fanGain = ctx.createGain();
    fanGain.gain.value = 0.05;
    fan.connect(fanFilter).connect(fanGain).connect(out);
    sources.push(fan);
    // Mains hum from the power supply (60 Hz and its first harmonic), and the CRT's faint high whine.
    for (const [frequency, volume, type] of [
        [60, 0.03, 'sine'],
        [120, 0.012, 'sine'],
        [15_700, 0.0025, 'sine'],
    ]) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = frequency;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        osc.connect(gain).connect(out);
        sources.push(osc);
    }
    for (const source of sources)
        source.start();
    hum = { out, sources, drive: undefined };
    scheduleDrive(ctx, out);
}
export function stopMenuMusic() {
    if (!hum || !context)
        return;
    const { out, sources, drive } = hum;
    if (drive !== undefined)
        clearTimeout(drive);
    const end = context.currentTime + FADE;
    out.gain.cancelScheduledValues(context.currentTime);
    out.gain.setValueAtTime(out.gain.value, context.currentTime);
    out.gain.linearRampToValueAtTime(0, end);
    for (const source of sources)
        source.stop(end + 0.05);
    hum = undefined;
}
/** A menu sound, as key presses: move (a light key), confirm (a heavy key), buy (a burst of typing), error (a dull double thunk). */
export function uiSound(scene, kind) {
    const ctx = contextOf(scene);
    if (!ctx)
        return;
    const t = ctx.currentTime;
    if (kind === 'move')
        keyPress(ctx, t);
    else if (kind === 'confirm')
        keyPress(ctx, t, true);
    else if (kind === 'buy') {
        // Typing out the order: quick, uneven key presses ending on a heavy one.
        let at = t;
        for (let i = 0; i < 5; i++) {
            keyPress(ctx, at);
            at += 0.06 + Math.random() * 0.05;
        }
        keyPress(ctx, at + 0.05, true);
    }
    else {
        thock(ctx, t, 90, 0.2);
        thock(ctx, t + 0.11, 80, 0.2);
    }
}
/** M in the menus: the computer's hum on / off (remembered). Returns whether it's now on. */
export function toggleMenuMusic(scene) {
    const music = !getSettings().music;
    updateSettings({ music });
    if (music)
        playMenuMusic(scene);
    else
        stopMenuMusic();
    return music;
}
//# sourceMappingURL=menu.js.map