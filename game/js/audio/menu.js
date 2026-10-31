import { getSettings, updateSettings } from '../settings.js';
import { output } from './output.js';
// Menu sound, modeled on the terminal sounds of SUPERHOT's in-game computer
// (measured for their length, pitch and balance; nothing of theirs is used):
// short, crisp sounds with flat shapes, not soft analog thumps. Keys are
// recordings of a real mechanical keyboard (Cherry MX Blue, CC0; see
// assets/sounds/CREDITS.txt), with synthesized ticks until they load; opening
// something pings and going back pongs (two quick taps and a 1 kHz tone); an
// error is a short flat buzz; each new line of text gets a tiny bright tick.
// The room's hum is breathing noise with one low tone and the CRT's faint
// whine. The intro adds the power-on, the POST beep, the drives, and a
// start-up chime as the title appears. Everything but the keys is
// synthesized. Songs have their own music.
const FADE = 0.6; // seconds to fade the hum in or out
/** Seconds the fan and the hard drive take to spin up after the power button. */
const SPIN_UP = 3.5;
let context;
let noise;
/** The running hum: its master gain, its sources (to stop), and the hard drive timer. */
let hum;
const buses = new WeakMap();
function contextOf(scene) {
    return scene.sound instanceof Phaser.Sound.WebAudioSoundManager ? scene.sound.context : undefined;
}
/**
 * Whether a sound made now would play now. Phaser pauses the audio clock while
 * the window is in the background, but timers keep going: sounds scheduled
 * then would all wait at the same stopped moment and play at once on return.
 */
function live(ctx) {
    return ctx?.state === 'running';
}
/**
 * Where the menu's sounds go: the very top rolled off above 12 kHz and a
 * gentle compressor that blends the layers of each sound into one, then the
 * volume setting.
 */
function uiBus(ctx) {
    let bus = buses.get(ctx);
    if (!bus) {
        const soft = ctx.createBiquadFilter();
        soft.type = 'lowpass';
        soft.frequency.value = 12000;
        soft.Q.value = 0.5;
        const glue = ctx.createDynamicsCompressor();
        glue.threshold.value = -14;
        glue.ratio.value = 2.5;
        glue.attack.value = 0.003;
        glue.release.value = 0.12;
        // Filtered layers come out quiet: bring them up a little, to sit under the songs.
        const makeUp = ctx.createGain();
        makeUp.gain.value = 1.2;
        soft.connect(glue).connect(makeUp).connect(output(ctx));
        buses.set(ctx, soft);
        bus = soft;
    }
    return bus;
}
/** Two seconds of white noise, shared by the hum, the drive and the key clicks. */
function noiseBuffer(ctx) {
    if (!noise || noise.sampleRate !== ctx.sampleRate) {
        noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++)
            data[i] = Math.random() * 2 - 1;
    }
    return noise;
}
/** A burst of filtered noise that dies away: a key's click, a drive head, and so on. */
function noiseBurst(ctx, at, duration, filter, frequency, volume, destination = uiBus(ctx), q = 1) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx);
    const band = ctx.createBiquadFilter();
    band.type = filter;
    band.frequency.value = frequency;
    band.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0005, at + duration);
    source.connect(band).connect(gain).connect(destination);
    source.start(at, Math.random() * 1.5);
    source.stop(at + duration + 0.02);
}
/** A tone that starts at once and dies away; with `to`, its pitch slides there as it fades (a thump). */
function tone(ctx, at, frequency, duration, volume, type = 'sine', to) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    if (to)
        osc.frequency.exponentialRampToValueAtTime(to, at + duration * 0.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0005, at + duration);
    osc.connect(gain).connect(uiBus(ctx));
    osc.start(at);
    osc.stop(at + duration + 0.01);
}
/** A tone held flat for `duration` with quick fades at each end (no decay): a digital beep or buzz. */
function flat(ctx, at, frequency, duration, volume, type = 'square', lowpass = 3000) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = lowpass;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.003);
    gain.gain.setValueAtTime(volume, at + duration - 0.004);
    gain.gain.linearRampToValueAtTime(0, at + duration);
    osc.connect(soften).connect(gain).connect(uiBus(ctx));
    osc.start(at);
    osc.stop(at + duration + 0.01);
}
/** A square wave's upper harmonics only (a band around 1.6 kHz), held flat: the buzz in an error. */
function buzz(ctx, at, frequency, duration, volume) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = frequency;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1600;
    band.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.003);
    gain.gain.setValueAtTime(volume, at + duration - 0.004);
    gain.gain.linearRampToValueAtTime(0, at + duration);
    osc.connect(band).connect(gain).connect(uiBus(ctx));
    osc.start(at);
    osc.stop(at + duration + 0.01);
}
/** Which of the three typing ticks plays next, so repeated keys don't all sound alike. */
let variation = 0;
/**
 * Recorded keystrokes from a real mechanical keyboard (Cherry MX Blue, CC0:
 * assets/sounds/CREDITS.txt): eight letters, Enter and Space. Loaded once;
 * until they arrive (or if they can't load), keys use the synthesized tick.
 */
const KEY_FILES = { letter: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `letter-${n}`), enter: ['enter'], space: ['space'] };
let keySamples;
let keysLoading = false;
/** Starts loading the recorded keystrokes (decoding works before the player has pressed anything). */
export function loadMenuSounds(scene) {
    const ctx = contextOf(scene);
    if (!ctx || keySamples || keysLoading)
        return;
    keysLoading = true;
    const load = (name) => fetch(`assets/sounds/keys/${name}.wav`)
        .then((response) => response.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data));
    const kinds = Object.keys(KEY_FILES);
    Promise.all(kinds.map((kind) => Promise.all(KEY_FILES[kind].map(load))))
        .then((loaded) => {
        keySamples = Object.fromEntries(kinds.map((kind, i) => [kind, loaded[i]]));
    })
        .catch(() => (keysLoading = false));
}
/** Plays a recorded keystroke, a few percent higher or lower each time so repeats don't sound identical; false if none are loaded. */
function recordedKey(ctx, at, kind, scale) {
    const samples = keySamples?.[kind];
    if (!samples?.length)
        return false;
    const source = ctx.createBufferSource();
    source.buffer = samples[Math.floor(Math.random() * samples.length)];
    source.playbackRate.value = 0.96 + Math.random() * 0.08;
    const gain = ctx.createGain();
    gain.gain.value = 0.55 * scale;
    source.connect(gain).connect(output(ctx));
    source.start(at);
    return true;
}
/**
 * One key, as a short dry tick: `letter` (one of three variations around
 * 1.15-1.55 kHz, most of it in the first 30 ms, hardly any low end), `enter`
 * (louder and fuller, a 1 kHz core with broadband click and a little low
 * knock, and a faint second tick as it comes back up), `space` (soft
 * broadband noise, no pitch).
 */
function key(ctx, at, kind = 'letter', scale = 1) {
    if (recordedKey(ctx, at, kind, scale))
        return;
    if (kind === 'space') {
        noiseBurst(ctx, at, 0.08, 'bandpass', 2800, 0.7 * scale, uiBus(ctx), 0.4);
        return;
    }
    if (kind === 'enter') {
        noiseBurst(ctx, at, 0.04, 'bandpass', 2800, 1.4 * scale, uiBus(ctx), 0.5);
        noiseBurst(ctx, at, 0.02, 'highpass', 6500, 0.5 * scale);
        tone(ctx, at, 1020, 0.05, 0.25 * scale);
        tone(ctx, at, 110, 0.04, 0.2 * scale, 'sine', 75);
        noiseBurst(ctx, at + 0.11, 0.015, 'bandpass', 2400, 0.3 * scale, uiBus(ctx), 0.8);
        return;
    }
    variation = (variation + 1) % 3;
    const pitch = [1180, 1350, 1520][variation] * (0.98 + Math.random() * 0.04);
    noiseBurst(ctx, at, 0.03, 'bandpass', pitch, 0.9 * scale, uiBus(ctx), 2.2);
    tone(ctx, at, pitch, 0.035, 0.16 * scale, 'triangle', pitch * 0.85);
    noiseBurst(ctx, at, 0.018, 'bandpass', 3600, 0.6 * scale, uiBus(ctx), 1);
    tone(ctx, at, 90, 0.02, 0.025 * scale);
}
/**
 * Ping (opening something) and pong (going back): two quick taps, then a
 * tone near 1 kHz that holds and fades, with a little high sparkle; the pong
 * is lower and rounder and ends on a small tap.
 */
function pingPong(ctx, at, pong) {
    const pitch = pong ? 960 : 1000;
    for (const tap of [0, 0.02]) {
        flat(ctx, at + tap, pitch, 0.014, pong ? 0.09 : 0.07, 'square', pong ? 3000 : 9000);
        noiseBurst(ctx, at + tap, 0.025, 'highpass', 6500, pong ? 0.6 : 0.45);
    }
    tone(ctx, at + 0.04, pitch, pong ? 0.17 : 0.13, pong ? 0.13 : 0.12, pong ? 'sine' : 'triangle');
    // The ping's bright partials; the pong's are fewer and softer.
    tone(ctx, at, pong ? 2960 : 2225, 0.08, pong ? 0.05 : 0.025);
    tone(ctx, at, pong ? 4950 : 5850, 0.06, pong ? 0.07 : 0.1);
    if (pong)
        flat(ctx, at + 0.18, pitch * 1.02, 0.03, 0.14, 'square', 2500);
}
/** A tiny bright tick: a new line of text appearing. */
function lineTick(ctx, at, volume = 1) {
    const pitch = [2450, 2500, 2425][variation] ?? 2450;
    variation = (variation + 1) % 3;
    flat(ctx, at, pitch, 0.025, 0.05 * volume, 'square', 10000);
    tone(ctx, at, pitch * 2.2, 0.04, 0.06 * volume);
    noiseBurst(ctx, at, 0.035, 'highpass', 6000, 0.3 * volume);
}
/** The hard drive seeking, softly: a few quick head ticks, then quiet for a while. */
function scheduleDrive(ctx, out) {
    if (!hum)
        return;
    const t = ctx.currentTime + 0.05;
    const clicks = live(ctx) ? 2 + Math.floor(Math.random() * 5) : 0;
    for (let i = 0; i < clicks; i++) {
        noiseBurst(ctx, t + i * (0.035 + Math.random() * 0.05), 0.01, 'bandpass', 1400 + Math.random() * 800, 0.07, out, 1.5);
    }
    hum.drive = setTimeout(() => scheduleDrive(ctx, out), 3000 + Math.random() * 7000);
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
 * Starts (or keeps) the room's hum, unless the player turned it off: soft
 * noise from the fan and the room, breathing slowly; one low tone under it;
 * the CRT's faint high whine; and now and then the drive seeking. `spinUp`:
 * the intro's power button, so it starts from rest and comes up to speed.
 */
export function playMenuMusic(scene, spinUp = false) {
    const ctx = contextOf(scene);
    if (!ctx || hum || !getSettings().music)
        return;
    context = ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(1, t + (spinUp ? SPIN_UP * 0.6 : FADE));
    out.connect(output(ctx));
    const sources = [];
    const loopNoise = () => {
        const source = ctx.createBufferSource();
        source.buffer = noiseBuffer(ctx);
        source.loop = true;
        source.loopStart = Math.random();
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
    loopNoise().connect(filter('lowpass', 480, 70)).connect(air).connect(out);
    oscillator(0.08, 0.08).connect(gainOf(0.006)).connect(air.gain);
    // Its body: a low band of the same noise.
    loopNoise().connect(filter('bandpass', 170, 40)).connect(gainOf(0.022)).connect(out);
    // One low tone under it all.
    oscillator(57, 18).connect(gainOf(0.012)).connect(out);
    // The CRT's faint high whine.
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
    hum = { out, sources, drive: undefined };
    // A fresh power-on: the drive's first seeks come with the boot's own reads, not on a timer.
    if (spinUp)
        hum.drive = setTimeout(() => scheduleDrive(ctx, out), 9000);
    else
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
/**
 * A menu sound: move (a typing tick), confirm (a ping), back (a pong), buy
 * (a burst of typing, then a ping), error (a short flat buzz).
 */
export function uiSound(scene, kind) {
    const ctx = contextOf(scene);
    if (!live(ctx))
        return;
    const t = ctx.currentTime;
    if (kind === 'move') {
        key(ctx, t, 'letter', 0.8);
    }
    else if (kind === 'confirm' || kind === 'back') {
        pingPong(ctx, t, kind === 'back');
    }
    else if (kind === 'buy') {
        let at = t;
        for (let i = 0; i < 5; i++) {
            key(ctx, at, 'letter', 0.7);
            at += 0.06 + Math.random() * 0.05;
        }
        key(ctx, at + 0.04, 'enter', 0.8);
        pingPong(ctx, at + 0.12, false);
    }
    else {
        // A short flat buzz, square-ish around 128 Hz, cut off clean: a little body, mostly its buzzing upper harmonics.
        flat(ctx, t, 128, 0.07, 0.035, 'square', 500);
        buzz(ctx, t, 128, 0.07, 0.2);
    }
}
/** One key typed in the intro or the menu's arrival: a letter, Space, or Enter (ending a command). */
export function typeSound(scene, kind = 'letter') {
    const ctx = contextOf(scene);
    if (!live(ctx))
        return;
    key(ctx, ctx.currentTime, kind, kind === 'enter' ? 0.8 : 0.65);
}
/** A new line of text appearing (`volume` lower when lines pour out fast). */
export function lineSound(scene, volume = 1) {
    const ctx = contextOf(scene);
    if (!live(ctx))
        return;
    lineTick(ctx, ctx.currentTime, volume);
}
/**
 * The power button: the switch, then the machine waking over about three
 * seconds (a low tone and soft noise rising together, a few faint crackles of
 * static as the screen charges, then a soft chime as it settles); on a CRT,
 * also the low "thoom" of the tube and its degaussing coil's fading hum.
 */
export function powerOnSound(scene, crt) {
    const ctx = contextOf(scene);
    if (!ctx)
        return;
    const t = ctx.currentTime;
    key(ctx, t, 'enter');
    const rise = ctx.createOscillator();
    rise.frequency.setValueAtTime(55, t + 0.1);
    rise.frequency.exponentialRampToValueAtTime(220, t + 2.4);
    const riseGain = ctx.createGain();
    riseGain.gain.setValueAtTime(0.0001, t + 0.1);
    riseGain.gain.exponentialRampToValueAtTime(0.05, t + 2);
    riseGain.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    rise.connect(riseGain).connect(uiBus(ctx));
    rise.start(t + 0.1);
    rise.stop(t + 3.05);
    const air = ctx.createBufferSource();
    air.buffer = noiseBuffer(ctx);
    const airBand = ctx.createBiquadFilter();
    airBand.type = 'bandpass';
    airBand.frequency.setValueAtTime(200, t + 0.1);
    airBand.frequency.exponentialRampToValueAtTime(2400, t + 2.6);
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.0001, t + 0.1);
    airGain.gain.exponentialRampToValueAtTime(0.05, t + 2.2);
    airGain.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    air.connect(airBand).connect(airGain).connect(uiBus(ctx));
    air.start(t + 0.1, Math.random());
    air.stop(t + 3.05);
    for (let i = 0; i < 6; i++)
        noiseBurst(ctx, t + 0.6 + Math.random() * 1.6, 0.006, 'highpass', 4000, 0.06);
    tone(ctx, t + 2.7, 1320, 0.5, 0.05, 'triangle');
    tone(ctx, t + 2.7, 660, 0.6, 0.04);
    if (!crt)
        return;
    tone(ctx, t + 0.04, 70, 0.6, 0.18, 'sine', 45);
    const coil = ctx.createOscillator();
    coil.type = 'sawtooth';
    coil.frequency.value = 60;
    const band = ctx.createBiquadFilter();
    band.type = 'lowpass';
    band.frequency.value = 220;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0005, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.07, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 1);
    coil.connect(band).connect(gain).connect(uiBus(ctx));
    coil.start(t + 0.05);
    coil.stop(t + 1.05);
}
/** The power button again: the switch, and on a CRT a soft falling whine as the picture collapses. */
export function powerOffSound(scene, crt) {
    const ctx = contextOf(scene);
    if (!live(ctx))
        return;
    const t = ctx.currentTime;
    key(ctx, t, 'enter');
    if (!crt)
        return;
    tone(ctx, t + 0.05, 700, 0.6, 0.04, 'sine', 40);
    tone(ctx, t + 0.5, 60, 0.3, 0.12, 'sine', 40);
}
/** A reverb's impulse: two seconds and a half of stereo noise dying away, made once per context. */
const rooms = new WeakMap();
function roomImpulse(ctx) {
    let room = rooms.get(ctx);
    if (!room) {
        const length = Math.round(ctx.sampleRate * 2.5);
        room = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
            const data = room.getChannelData(channel);
            for (let i = 0; i < length; i++)
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
        }
        rooms.set(ctx, room);
    }
    return room;
}
/**
 * The start-up chime, as the title appears at the end of the boot (our own,
 * in the spirit of the warm start-up sounds old operating systems played): a
 * soft pad on a major-ninth chord swelling in, a rising arpeggio of bell
 * tones over it, a high shimmer, all in a gentle reverb. Returns its length (s).
 */
export function startupChime(scene) {
    const ctx = contextOf(scene);
    if (!live(ctx))
        return 0;
    const t = ctx.currentTime + 0.05;
    const length = 4.2;
    const mix = ctx.createGain();
    mix.gain.value = 0.22;
    const reverb = ctx.createConvolver();
    reverb.buffer = roomImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    mix.connect(output(ctx));
    mix.connect(reverb).connect(wet).connect(output(ctx));
    // The pad: F major ninth (F3 A3 C4 E4 G4), each note two slightly detuned voices, softened.
    const pad = ctx.createGain();
    pad.gain.setValueAtTime(0.0001, t);
    pad.gain.exponentialRampToValueAtTime(0.5, t + 0.9);
    pad.gain.setValueAtTime(0.5, t + 1.6);
    pad.gain.exponentialRampToValueAtTime(0.0001, t + length);
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.setValueAtTime(600, t);
    warm.frequency.exponentialRampToValueAtTime(2200, t + 1.2);
    warm.frequency.exponentialRampToValueAtTime(900, t + length);
    pad.connect(warm).connect(mix);
    for (const note of [174.61, 220, 261.63, 329.63, 392]) {
        for (const detune of [-6, 6]) {
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = note;
            osc.detune.value = detune;
            const voice = ctx.createGain();
            voice.gain.value = 0.09;
            osc.connect(voice).connect(pad);
            osc.start(t);
            osc.stop(t + length + 0.05);
        }
    }
    // The bells: C5 E5 G5 C6 rising, each a sine with a bell's inharmonic partial, ringing out.
    [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => {
        const at = t + 0.35 + i * 0.22;
        for (const [ratio, volume, ring] of [[1, 0.22, 1.8], [2.76, 0.06, 0.6]]) {
            const osc = ctx.createOscillator();
            osc.frequency.value = note * ratio;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + ring);
            osc.connect(gain).connect(mix);
            osc.start(at);
            osc.stop(at + ring + 0.05);
        }
    });
    // A high shimmer as the last bell rings.
    const shimmer = ctx.createOscillator();
    shimmer.frequency.value = 2093;
    const sheen = ctx.createGain();
    sheen.gain.setValueAtTime(0.0001, t + 1);
    sheen.gain.exponentialRampToValueAtTime(0.03, t + 1.5);
    sheen.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    shimmer.connect(sheen).connect(mix);
    shimmer.start(t + 1);
    shimmer.stop(t + 3.3);
    return length;
}
/**
 * The boot's own sounds, timed with its text (data/boot.ts): `beep`, a
 * short flat beep when the power-on self test passes; `floppy`, a floppy
 * drive reading (the head stepping track to track, the disk turning); `disk`,
 * a hard drive reading (soft head ticks in bursts).
 */
export function bootSound(scene, kind) {
    const ctx = contextOf(scene);
    if (!live(ctx))
        return;
    const t = ctx.currentTime + 0.02;
    if (kind === 'beep') {
        flat(ctx, t, 880, 0.12, 0.07, 'square', 2500);
    }
    else if (kind === 'floppy') {
        // The head stepping in runs, then the motor turning the disk.
        let at = t;
        for (let run = 0; run < 3; run++) {
            const steps = 4 + Math.floor(Math.random() * 6);
            for (let i = 0; i < steps; i++, at += 0.022) {
                tone(ctx, at, 150 + Math.random() * 25, 0.02, 0.06, 'triangle');
                noiseBurst(ctx, at, 0.008, 'bandpass', 1100, 0.04);
            }
            at += 0.12 + Math.random() * 0.15;
        }
        noiseBurst(ctx, t, at - t + 0.4, 'lowpass', 260, 0.04);
    }
    else {
        // Head ticks, soft, in uneven bursts.
        let at = t;
        for (let burst = 0; burst < 3; burst++) {
            const clicks = 3 + Math.floor(Math.random() * 5);
            for (let i = 0; i < clicks; i++, at += 0.025 + Math.random() * 0.04) {
                noiseBurst(ctx, at, 0.01, 'bandpass', 1400 + Math.random() * 900, 0.1, uiBus(ctx), 1.5);
            }
            at += 0.1 + Math.random() * 0.2;
        }
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