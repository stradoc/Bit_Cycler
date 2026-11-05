import { SONGS } from '../data/songs.js';
import { tempoForClock } from '../rhythm/tempo.js';
import { ERAS } from '../ui/eras.js';
import { CUE_NAMES, playCue } from './cues.js';
import { buildHum, fadeIn, nextSeek, seek } from './hum.js';
import { chimeAt, powerOffAt, powerOnAt } from './machine.js';
import { bus } from './mix.js';
import { LayeredMusic } from './music.js';
import { loadKeys } from './samples.js';
import { encodeWav, mergeIfMono, peak, trimSilence } from './wav.js';
// Every sound the game makes, rendered offline (faster than real time, into
// a buffer instead of the speakers) and written as WAV files, to listen to or
// open in an audio editor. tools/export-sounds.mjs runs this in a browser. The
// game itself doesn't use it: it still makes its sounds as it plays.
// Rendered at the game's own levels (volume 100%), so files compare as they
// do in the game; random sounds (typing, the drives) are one take each.
const RATE = 44_100;
/** The song's sounds and music at the first pipelined CPU's tempo (4 MHz, about 87 BPM). */
const BEAT = 60 / tempoForClock(4);
/** Beats in one pass through a song (four to a bar). */
const songBeats = (song) => song.chords.length * 4;
/** What each of the music's layers adds (audio/music.ts), for the files' names. */
const LAYER_NAMES = ['bass', 'melody', 'hats', 'drums', 'arpeggio'];
const HUM_SECONDS = 15;
/** The green CRT's computer (a CRT and a drive: the 8-, 16- and 32-bit eras all hum like it) and the modern one (an LCD and an SSD). */
const [CRT, LCD] = [ERAS[0], ERAS[3]];
/** The folder each cue goes in (every cue must have one). */
const CUE_FOLDER = {
    move: 'interface', confirm: 'interface', back: 'interface', buy: 'interface', error: 'interface', line: 'interface',
    letter: 'typing', space: 'typing', enter: 'typing',
    'guide-talk': 'guide', 'guide-hello': 'guide', 'guide-bye': 'guide',
    beep: 'computer', floppy: 'computer', disk: 'computer',
    beat: 'song', downbeat: 'song', 'hit-alu': 'song', 'hit-mem': 'song', 'hit-branch': 'song', stall: 'song', mistake: 'song', waiting: 'song', arrived: 'song',
};
/** The hum of `era`'s computer, steady, with its drive seeking now and then. */
function hum(ctx, era, spinUp) {
    const out = ctx.createGain();
    if (spinUp)
        fadeIn(out, 0, true);
    out.connect(bus(ctx, 'hum'));
    buildHum(ctx, era, out, 0, spinUp);
    if (era.computer.drive === 'ssd')
        return;
    for (let at = spinUp ? 4 : 1; at < ctx.length / RATE - 0.5; at += nextSeek())
        seek(ctx, at, out);
}
const SOUNDS = [
    ...CUE_NAMES.map((name) => ({
        file: `${CUE_FOLDER[name]}/${name}.wav`,
        seconds: 4,
        make: (ctx) => name === 'waiting'
            ? playCue(ctx, name, { at: 0, length: BEAT, ticks: 4 })
            : name === 'guide-talk'
                ? playCue(ctx, name, { at: 0, pitch: 620 })
                : playCue(ctx, name, { at: 0 }),
    })),
    { file: 'computer/power-on-crt.wav', seconds: 5, make: (ctx) => powerOnAt(ctx, CRT, 0) },
    { file: 'computer/power-on-lcd.wav', seconds: 5, make: (ctx) => powerOnAt(ctx, LCD, 0) },
    { file: 'computer/power-off-crt.wav', seconds: 2, make: (ctx) => powerOffAt(ctx, CRT, 0) },
    { file: 'computer/power-off-lcd.wav', seconds: 2, make: (ctx) => powerOffAt(ctx, LCD, 0) },
    { file: 'computer/startup-chime.wav', seconds: 8, make: (ctx) => void chimeAt(ctx, 0) },
    { file: 'hum/crt.wav', seconds: HUM_SECONDS, keep: true, make: (ctx) => hum(ctx, CRT, false) },
    { file: 'hum/lcd.wav', seconds: HUM_SECONDS, keep: true, make: (ctx) => hum(ctx, LCD, false) },
    { file: 'hum/spin-up.wav', seconds: 8, keep: true, make: (ctx) => hum(ctx, CRT, true) },
    // Every song once through, with the pipeline full (all five layers).
    ...SONGS.map((song, i) => ({
        file: `music/${String(i + 1).padStart(2, '0')}-${song.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.wav`,
        seconds: songBeats(song) * BEAT + 1,
        make: (ctx) => {
            const music = new LayeredMusic(ctx, song);
            for (let beat = 0; beat < songBeats(song); beat++)
                music.playBeat(beat, beat * BEAT, BEAT, 5);
        },
    })),
    // How the music reacts to the run (song/groove.ts), on the first song: two beats, then the reaction, then the song going on.
    ...['hold', 'skip', 'flush'].map((mode) => ({
        file: `music/reactions/${mode}.wav`,
        seconds: 5 * BEAT + 1,
        make: (ctx) => {
            const music = new LayeredMusic(ctx, SONGS[0]);
            music.playBeat(0, 0, BEAT, 5);
            music.playBeat(1, BEAT, BEAT, 5);
            music.playBeat(1, 2 * BEAT, BEAT, 5, mode);
            music.playBeat(2, 3 * BEAT, BEAT, 5);
            music.playBeat(3, 4 * BEAT, BEAT, 5);
        },
    })),
    {
        file: 'music/reactions/memory-wait.wav',
        seconds: 6 * BEAT + 1,
        make: (ctx) => {
            const music = new LayeredMusic(ctx, SONGS[0]);
            music.playBeat(0, 0, BEAT, 5);
            for (let beat = 1; beat <= 3; beat++)
                music.drone(0, beat * BEAT, BEAT);
            music.playBeat(1, 4 * BEAT, BEAT, 5);
            music.playBeat(2, 5 * BEAT, BEAT, 5);
        },
    },
    {
        file: 'music/reactions/ending.wav',
        seconds: 4 * BEAT + 3,
        make: (ctx) => {
            const music = new LayeredMusic(ctx, SONGS[0]);
            for (let beat = 0; beat < 4; beat++)
                music.playBeat(28 + beat, beat * BEAT, BEAT, 5);
            music.ending(4 * BEAT, BEAT);
        },
    },
    // The first song as the pipeline fills: one layer per occupied stage.
    ...[1, 2, 3, 4, 5].map((layers) => ({
        file: `music/layers/${layers}-${LAYER_NAMES.slice(0, layers).join('-')}.wav`,
        seconds: songBeats(SONGS[0]) * BEAT + 1,
        make: (ctx) => {
            const music = new LayeredMusic(ctx, SONGS[0]);
            for (let beat = 0; beat < songBeats(SONGS[0]); beat++)
                music.playBeat(beat, beat * BEAT, BEAT, layers);
        },
    })),
];
/** Every file the export writes. */
export function soundFiles() {
    return SOUNDS.map((sound) => sound.file);
}
/** Bytes as base64 text (to hand a file from the browser to the export script). */
function base64(bytes) {
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
        text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
}
/** Renders one sound into a WAV file: its bytes (base64), length, channels and peak level. */
export async function renderSound(file) {
    const sound = SOUNDS.find((s) => s.file === file);
    if (!sound)
        throw new Error(`no sound ${file}`);
    // The recorded keys, decoded once.
    await loadKeys(new OfflineAudioContext(1, 1, RATE));
    const ctx = new OfflineAudioContext(2, Math.ceil(sound.seconds * RATE), RATE);
    sound.make(ctx);
    const buffer = await ctx.startRendering();
    const rendered = [0, 1].map((channel) => buffer.getChannelData(channel));
    const channels = mergeIfMono(sound.keep ? rendered : trimSilence(rendered, RATE));
    return { wav: base64(encodeWav(channels, RATE)), seconds: (channels[0]?.length ?? 0) / RATE, channels: channels.length, peak: peak(channels) };
}
//# sourceMappingURL=render.js.map