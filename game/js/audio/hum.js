import { getSettings, updateSettings } from '../settings.js';
import { currentEra } from '../ui/eras.js';
import { audioOf, bus, live } from './mix.js';
import { noiseBurst, noiseLoop } from './synth.js';
// The computer's hum in the menus, made from the era's computer (ui/eras.ts):
// soft noise from the fan and the room, breathing slowly; one low tone under
// it; a CRT's faint high whine; and now and then the drive seeking (unless
// it's an SSD, which is silent). Songs have their own music.
const FADE = 0.6; // seconds to fade the hum in or out
/** Seconds the fan and the hard drive take to spin up after the power button. */
const SPIN_UP = 3.5;
/** What makes one hum differ from another: a new era with a different computer brings a new hum. */
const voiceOf = (era) => `${era.sound.whine} ${era.computer.drive}`;
/** The running hum: its master gain, its sources (to stop), the drive's timer, and which hum it is. */
let hum;
/** The drive seeking once, softly, at `at`: a few quick head ticks. */
export function seek(ctx, at, out) {
    const clicks = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < clicks; i++) {
        noiseBurst(ctx, at + i * (0.035 + Math.random() * 0.05), 0.01, 'bandpass', 1400 + Math.random() * 800, 0.07, out, 1.5);
    }
}
/** Seconds until the drive seeks again. */
export const nextSeek = () => 3 + Math.random() * 7;
/** The live hum's drive: seeks now (unless the audio is paused), then again in a while. */
function scheduleDrive(ctx, out) {
    if (!hum)
        return;
    if (live(ctx))
        seek(ctx, ctx.currentTime + 0.05, out);
    hum.drive = setTimeout(() => scheduleDrive(ctx, out), nextSeek() * 1000);
}
/** The hum's level rising from nothing at `t`: quickly, or slowly as the fan spins up. */
export function fadeIn(out, t, spinUp) {
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(1, t + (spinUp ? SPIN_UP * 0.6 : FADE));
}
/** Sets an AudioParam to `value`, or (spinning up) ramps it there from `from` over SPIN_UP seconds. */
function spin(param, value, from, t, spinUp) {
    if (!spinUp) {
        param.value = value;
        return;
    }
    param.setValueAtTime(from, t);
    param.exponentialRampToValueAtTime(value, t + SPIN_UP);
}
/**
 * The hum's steady sounds for `era`, into `out`, started at `t` (the drive's
 * seeks are scheduled separately). `spinUp`: from rest, coming up to speed.
 * Returns the sources, to stop.
 */
export function buildHum(ctx, era, out, t, spinUp) {
    const sources = [];
    const noise = () => {
        const source = noiseLoop(ctx);
        sources.push(source);
        return source;
    };
    const oscillator = (frequency, from) => {
        const osc = ctx.createOscillator();
        spin(osc.frequency, frequency, from, t, spinUp);
        sources.push(osc);
        return osc;
    };
    const gainOf = (value) => {
        const gain = ctx.createGain();
        gain.gain.value = value;
        return gain;
    };
    const filter = (type, frequency, from, q = 0.7) => {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.Q.value = q;
        spin(f.frequency, frequency, from, t, spinUp);
        return f;
    };
    // The fan and the room: soft noise, breathing in and out every twelve seconds or so.
    const air = gainOf(0.03);
    noise().connect(filter('lowpass', 480, 70)).connect(air).connect(out);
    oscillator(0.08, 0.08).connect(gainOf(0.006)).connect(air.gain);
    // Its body: a low band of the same noise.
    noise().connect(filter('bandpass', 170, 40)).connect(gainOf(0.022)).connect(out);
    // One low tone under it all.
    oscillator(57, 18).connect(gainOf(0.012)).connect(out);
    // The CRT's faint high whine.
    if (era.sound.whine)
        oscillator(15_700, 15_700).connect(gainOf(0.002)).connect(out);
    // Spinning up: a soft rising whine that fades once at speed.
    if (spinUp) {
        const whine = gainOf(0);
        whine.gain.setValueAtTime(0.0001, t);
        whine.gain.exponentialRampToValueAtTime(0.004, t + SPIN_UP * 0.7);
        whine.gain.exponentialRampToValueAtTime(0.0001, t + SPIN_UP * 1.5);
        oscillator(1800, 200).connect(whine).connect(out);
    }
    for (const source of sources)
        source.start(t);
    return sources;
}
/**
 * Starts the hum for the era on screen, unless the player turned it off; a
 * hum already going keeps going (or changes, if the era's computer did).
 * `spinUp`: the intro's power button, so it starts from rest and comes up to speed.
 */
export function startHum(scene, spinUp = false) {
    const ctx = audioOf(scene);
    const era = currentEra();
    if (!ctx || !getSettings().music)
        return;
    if (hum?.voice === voiceOf(era))
        return;
    stopHum();
    const t = ctx.currentTime;
    const out = ctx.createGain();
    fadeIn(out, t, spinUp);
    out.connect(bus(ctx, 'hum'));
    const sources = buildHum(ctx, era, out, t, spinUp);
    hum = { ctx, out, sources, drive: undefined, voice: voiceOf(era) };
    if (era.computer.drive === 'ssd')
        return;
    // A fresh power-on: the drive's first seeks come with the boot's own reads, not on a timer.
    if (spinUp)
        hum.drive = setTimeout(() => scheduleDrive(ctx, out), 9000);
    else
        scheduleDrive(ctx, out);
}
/** Fades the hum out (a song starting, the computer switched off). */
export function stopHum() {
    if (!hum)
        return;
    const { ctx, out, sources, drive } = hum;
    if (drive !== undefined)
        clearTimeout(drive);
    const end = ctx.currentTime + FADE;
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
    out.gain.linearRampToValueAtTime(0, end);
    for (const source of sources)
        source.stop(end + 0.05);
    hum = undefined;
}
/** M in the menus: the hum on / off (remembered). Returns whether it's now on. */
export function toggleHum(scene) {
    const music = !getSettings().music;
    updateSettings({ music });
    if (music)
        startHum(scene);
    else
        stopHum();
    return music;
}
//# sourceMappingURL=hum.js.map