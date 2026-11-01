import { ARP_LOW, BASS_LOW, compileSong, toneOf } from '../data/songs.js';
import { bus } from './mix.js';
// A song's music (data/songs.ts) as the run plays it. It follows the pipeline
// in five layers: the bass and the melody play whenever instructions do, and a
// fuller pipeline adds the hi-hats, then the kick and snare, then the
// arpeggio. It follows the player too (song/groove.ts): the song moves on only
// on cycles that do work; a stall holds it, a mistake makes it skip like a
// scratched CD, a flush dives like a tape stopping, and a wait for memory
// hangs on a drone. Key presses play notes of the chord, and the song ends
// on its home chord. Everything is synthesized like an 8-bit console's sound
// chip: pulse waves, a triangle and noise.
/** What each layer adds, in order: the first `layers` of them play. */
const LAYERS = { bass: 1, lead: 2, hats: 3, drums: 4, arp: 5 };
/** Each part's loudness on each wave (a narrow pulse sounds thinner, so it's played louder; the triangle is quiet by nature). */
const VOLUME = {
    lead: { square: 0.045, pulse25: 0.05, pulse12: 0.06, triangle: 0.13 },
    arp: { square: 0.026, pulse25: 0.03, pulse12: 0.034, triangle: 0.08 },
    bass: { square: 0.08, pulse25: 0.1, pulse12: 0.11, triangle: 0.22 },
};
/** The echo: the melody again this many steps later, this much quieter (a trick 8-bit composers used for depth). */
const ECHO = { steps: 3, volume: 0.35 };
/** Vibrato: how fast, and how long a note sounds before it starts. */
const VIBRATO = { hz: 5.5, delay: 0.15 };
/** A key press's note: MEM the chord's root, ALU its third, BRANCH its fifth (low to high, as the hits always were), from C5 up. */
const HIT_TONES = { MEM: 0, ALU: 1, BRANCH: 2 };
const HIT_LOW = 72;
/** A tape stop: how far the pitch falls over the beat. */
const TAPE_STOP = 0.3;
/** The ending: how many beats the home chord rings, but no longer than this many seconds (a real run's replay starts 2 s after it ends). */
const ENDING = { beats: 4, seconds: 1.8 };
const midiHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
/** Each song compiled once. */
const compiled = new Map();
/** Pulse waves of other widths than the square's 50%, built once per audio context from their harmonics. */
const pulses = new WeakMap();
function pulseWave(ctx, duty) {
    let byDuty = pulses.get(ctx);
    if (!byDuty)
        pulses.set(ctx, (byDuty = new Map()));
    let wave = byDuty.get(duty);
    if (!wave) {
        // A pulse wave's Fourier series: harmonic n has amplitude (2 / n pi) sin(n pi duty).
        const harmonics = 64;
        const real = new Float32Array(harmonics);
        const imag = new Float32Array(harmonics);
        for (let n = 1; n < harmonics; n++)
            real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
        wave = ctx.createPeriodicWave(real, imag);
        byDuty.set(duty, wave);
    }
    return wave;
}
export class LayeredMusic {
    ctx;
    out;
    noise;
    song;
    constructor(ctx, song) {
        this.ctx = ctx;
        // Its own gain into the music bus (audio/mix.ts), so a song's music can fade apart from the rest.
        this.out = ctx.createGain();
        this.out.connect(bus(ctx, 'music'));
        this.noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++)
            data[i] = Math.random() * 2 - 1;
        if (!compiled.has(song))
            compiled.set(song, compileSong(song));
        this.song = compiled.get(song);
    }
    /** The bar that beat `beat` of the song falls in. */
    barOf(beat) {
        const { bars } = this.song;
        return bars[Math.floor(Math.max(0, beat) / 4) % bars.length];
    }
    /**
     * Schedules a beat at audio time `time` with the first `layers` (0-5)
     * playing. `mode` (song/groove.ts): 'play' plays beat `beat` of the song;
     * the others react to it as the beat just played (holding, skipping or
     * diving), since the song doesn't move on.
     */
    playBeat(beat, time, secondsPerBeat, layers, mode = 'play') {
        if (beat < 0)
            return;
        if (mode === 'hold')
            return this.hold(beat, time, secondsPerBeat, layers);
        if (mode === 'skip')
            return this.skip(beat, time, secondsPerBeat);
        if (mode === 'flush')
            return this.tapeStop(beat, time, secondsPerBeat);
        const bar = this.barOf(beat);
        const step = secondsPerBeat / 4;
        const first = (beat % 4) * 4;
        const inBeat = (s) => s >= first && s < first + 4;
        const at = (s) => time + (s - first) * step;
        const { sound } = this.song.song;
        if (layers >= LAYERS.bass) {
            for (const note of bar.bass.filter((n) => inBeat(n.step)))
                this.note(sound.bass, note, at(note.step), step, VOLUME.bass[sound.bass], 0.9);
        }
        if (layers >= LAYERS.lead) {
            for (const note of bar.lead.filter((n) => inBeat(n.step))) {
                this.note(sound.lead, note, at(note.step), step, VOLUME.lead[sound.lead], 0.85, sound.vibrato);
                if (sound.echo)
                    this.note(sound.lead, note, at(note.step) + ECHO.steps * step, step, VOLUME.lead[sound.lead] * ECHO.volume, 0.6);
            }
        }
        for (const hit of bar.drums.filter((h) => inBeat(h.step))) {
            const t = at(hit.step);
            if (hit.drum === 'h' && layers >= LAYERS.hats)
                this.hat(t, false);
            else if (hit.drum === 'o' && layers >= LAYERS.hats)
                this.hat(t, true);
            else if (hit.drum === 'k' && layers >= LAYERS.drums)
                this.kick(t);
            else if (hit.drum === 's' && layers >= LAYERS.drums)
                this.snare(t);
        }
        if (layers >= LAYERS.arp) {
            // Short plucks, so a fast arpeggio sparkles rather than smears.
            for (const note of bar.arp.filter((n) => inBeat(n.step)))
                this.note(sound.arp, note, at(note.step), step, VOLUME.arp[sound.arp], 0.6);
        }
    }
    /** A stall: the song waits a beat on the chord's root, the hi-hats still ticking. */
    hold(beat, time, secondsPerBeat, layers) {
        const { chord } = this.barOf(beat);
        const { sound } = this.song.song;
        this.tone(sound.bass, midiHz(toneOf(chord, 0, BASS_LOW)), time, secondsPerBeat * 0.95, VOLUME.bass[sound.bass] * 0.7, { hold: 0.7, attack: 0.03 });
        if (layers >= LAYERS.hats) {
            this.hat(time, false);
            this.hat(time + secondsPerBeat / 2, false);
        }
    }
    /** A mistake: the last sixteenth of the beat just played, stuttered four times and fading, with a crackle, like a scratched CD. */
    skip(beat, time, secondsPerBeat) {
        const bar = this.barOf(beat);
        const last = (beat % 4) * 4 + 3;
        const sounding = (notes) => notes.find((n) => n.step <= last && last < n.step + n.steps);
        const { sound } = this.song.song;
        const lead = sounding(bar.lead)?.midi ?? toneOf(bar.chord, 2, ARP_LOW + 12);
        const bass = sounding(bar.bass)?.midi ?? toneOf(bar.chord, 0, BASS_LOW);
        const step = secondsPerBeat / 4;
        this.noiseHit(time, 0.05, 0.06, 'highpass', 3000);
        for (let i = 0; i < 4; i++) {
            const fade = 1 - i * 0.2;
            this.tone(sound.lead, midiHz(lead), time + i * step, step * 0.45, VOLUME.lead[sound.lead] * fade);
            this.tone(sound.bass, midiHz(bass), time + i * step, step * 0.45, VOLUME.bass[sound.bass] * fade);
        }
    }
    /** A flush: the chord of the beat just played, falling in pitch and fading, like a tape stopping. */
    tapeStop(beat, time, secondsPerBeat) {
        const { chord } = this.barOf(beat);
        const { sound } = this.song.song;
        const length = secondsPerBeat * 0.9;
        this.tone(sound.bass, midiHz(toneOf(chord, 0, BASS_LOW)), time, length, VOLUME.bass[sound.bass], { slide: TAPE_STOP, hold: 0.3 });
        for (const index of [0, 1, 2]) {
            this.tone(sound.lead, midiHz(toneOf(chord, index, ARP_LOW + 12)), time, length, VOLUME.lead[sound.lead] * 0.6, { slide: TAPE_STOP, hold: 0.3 });
        }
    }
    /** One beat of waiting for memory: the chord hangs, quiet and low, under the cycles ticking by. */
    drone(beat, time, secondsPerBeat) {
        const { chord } = this.barOf(beat);
        const { sound } = this.song.song;
        const shape = { hold: 0.85, attack: 0.08 };
        this.tone('triangle', midiHz(toneOf(chord, 0, BASS_LOW)), time, secondsPerBeat, VOLUME.bass.triangle * 0.6, shape);
        this.tone(sound.arp, midiHz(toneOf(chord, 2, ARP_LOW)), time, secondsPerBeat, VOLUME.arp[sound.arp] * 0.8, shape);
    }
    /** A key press's pitch (Hz): a note of the chord at beat `beat` of the song, by the unit it went to. */
    hitPitch(beat, unit) {
        return midiHz(toneOf(this.barOf(beat).chord, HIT_TONES[unit], HIT_LOW));
    }
    /** The song's ending: its home chord (the first bar's) rings out, with a kick and a crash. */
    ending(time, secondsPerBeat) {
        const { chord } = this.song.bars[0];
        const { sound } = this.song.song;
        const length = Math.min(secondsPerBeat * ENDING.beats, ENDING.seconds);
        this.kick(time);
        this.hat(time, true);
        this.tone(sound.bass, midiHz(toneOf(chord, 0, BASS_LOW)), time, length, VOLUME.bass[sound.bass], { hold: 0.4 });
        // The chord strummed upward, and the melody's last word on the root an octave up.
        [0, 1, 2].forEach((index, i) => this.tone(sound.arp, midiHz(toneOf(chord, index, ARP_LOW)), time + i * 0.04, length, VOLUME.arp[sound.arp] * 1.4, { hold: 0.4 }));
        this.tone(sound.lead, midiHz(toneOf(chord, 0, HIT_LOW)), time, length, VOLUME.lead[sound.lead], { hold: 0.4, vibrato: sound.vibrato });
    }
    /** One note of a part: held for its steps (`length` of each, so notes don't run together), with vibrato on the longer ones. */
    note(wave, note, time, step, volume, length, vibrato = 0) {
        const duration = Math.max(step * 0.5, (note.steps - 1 + length) * step);
        // Held at full for most of the note, then let go, so long notes sing instead of fading at once.
        this.tone(wave, midiHz(note.midi), time, duration, volume, { hold: 0.6, vibrato });
    }
    /** A tone on one of the 8-bit waves. */
    tone(wave, hz, time, duration, volume, shape = {}) {
        const osc = this.ctx.createOscillator();
        if (wave === 'pulse12' || wave === 'pulse25')
            osc.setPeriodicWave(pulseWave(this.ctx, wave === 'pulse12' ? 0.125 : 0.25));
        else
            osc.type = wave;
        osc.frequency.setValueAtTime(hz, time);
        if (shape.slide)
            osc.frequency.exponentialRampToValueAtTime(hz * shape.slide, time + duration);
        const vibrato = shape.vibrato ?? 0;
        if (vibrato > 0 && duration > VIBRATO.delay * 2) {
            // A slow wobble in pitch that fades in once the note has started, as the old sound drivers did.
            const lfo = this.ctx.createOscillator();
            lfo.frequency.value = VIBRATO.hz;
            const depth = this.ctx.createGain();
            depth.gain.setValueAtTime(0, time);
            depth.gain.linearRampToValueAtTime(0, time + VIBRATO.delay);
            depth.gain.linearRampToValueAtTime(hz * (2 ** (vibrato / 1200) - 1), time + VIBRATO.delay * 2);
            lfo.connect(depth).connect(osc.frequency);
            lfo.start(time);
            lfo.stop(time + duration + 0.02);
        }
        osc.connect(this.envelope(time, duration, volume, shape.hold ?? 0, shape.attack));
        osc.start(time);
        osc.stop(time + duration + 0.02);
    }
    /** An attack to `volume`, held for the `hold` share of `duration`, then a fade to silence. */
    envelope(time, duration, volume, hold = 0, attack = 0.005) {
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + attack);
        if (hold > 0)
            gain.gain.setValueAtTime(volume, time + Math.max(attack, duration * hold));
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        gain.connect(this.out);
        return gain;
    }
    kick(time) {
        const osc = this.ctx.createOscillator();
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
        osc.connect(this.envelope(time, 0.18, 0.4));
        osc.start(time);
        osc.stop(time + 0.2);
    }
    snare(time) {
        this.noiseHit(time, 0.12, 0.09, 'bandpass', 1800);
    }
    /** A closed hi-hat, or an open one (longer). */
    hat(time, open) {
        if (open)
            this.noiseHit(time, 0.2, 0.04, 'highpass', 6000);
        else
            this.noiseHit(time, 0.04, 0.05, 'highpass', 7000);
    }
    noiseHit(time, duration, volume, type, frequency) {
        const source = this.ctx.createBufferSource();
        source.buffer = this.noise;
        const filter = this.ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        source.connect(filter).connect(this.envelope(time, duration, volume));
        source.start(time);
        source.stop(time + duration + 0.02);
    }
}
//# sourceMappingURL=music.js.map