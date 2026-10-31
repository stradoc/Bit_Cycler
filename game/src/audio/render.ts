import { tempoForClock } from '../rhythm/tempo.ts';
import { ERAS } from '../ui/eras.ts';
import { CUE_NAMES, playCue, type Cue } from './cues.ts';
import { buildHum, fadeIn, nextSeek, seek } from './hum.ts';
import { chimeAt, powerOffAt, powerOnAt } from './machine.ts';
import { bus } from './mix.ts';
import { LayeredMusic } from './music.ts';
import { loadKeys } from './samples.ts';
import { encodeWav, mergeIfMono, peak, trimSilence } from './wav.ts';

// Every sound the game makes, rendered offline (faster than real time, into
// a buffer instead of the speakers) and written as WAV files, to listen to or
// open in an audio editor. tools/export-sounds.mjs runs this in a browser. The
// game itself doesn't use it: it still makes its sounds as it plays.
// Rendered at the game's own levels (volume 100%), so files compare as they
// do in the game; random sounds (typing, the drives) are one take each.

const RATE = 44_100;
/** The song's sounds and music at the first pipelined CPU's tempo (4 MHz, about 87 BPM). */
const BEAT = 60 / tempoForClock(4);
/** One pass through the music's chords: four bars. */
const MUSIC_BEATS = 16;
const HUM_SECONDS = 15;
/** The green CRT's computer (a CRT and a drive: the 8-, 16- and 32-bit eras all hum like it) and the modern one (an LCD and an SSD). */
const [CRT, LCD] = [ERAS[0], ERAS[3]];

type Sound = {
  /** Where it's written, e.g. "interface/move.wav". */
  readonly file: string;
  /** How long to render; the silence after the sound is cut unless `keep`. */
  readonly seconds: number;
  readonly keep?: boolean;
  readonly make: (ctx: OfflineAudioContext) => void;
};

/** The folder each cue goes in (every cue must have one). */
const CUE_FOLDER: Readonly<Record<Cue, string>> = {
  move: 'interface', confirm: 'interface', back: 'interface', buy: 'interface', error: 'interface', line: 'interface',
  letter: 'typing', space: 'typing', enter: 'typing',
  beep: 'computer', floppy: 'computer', disk: 'computer',
  beat: 'song', downbeat: 'song', 'hit-alu': 'song', 'hit-mem': 'song', 'hit-branch': 'song', stall: 'song', mistake: 'song', waiting: 'song', arrived: 'song',
};

/** The hum of `era`'s computer, steady, with its drive seeking now and then. */
function hum(ctx: OfflineAudioContext, era: (typeof ERAS)[number], spinUp: boolean): void {
  const out = ctx.createGain();
  if (spinUp) fadeIn(out, 0, true);
  out.connect(bus(ctx, 'hum'));
  buildHum(ctx, era, out, 0, spinUp);
  if (era.computer.drive === 'ssd') return;
  for (let at = spinUp ? 4 : 1; at < ctx.length / RATE - 0.5; at += nextSeek()) seek(ctx, at, out);
}

const SOUNDS: readonly Sound[] = [
  ...CUE_NAMES.map(
    (name): Sound => ({
      file: `${CUE_FOLDER[name]}/${name}.wav`,
      seconds: 4,
      make: (ctx) => (name === 'waiting' ? playCue(ctx, name, { at: 0, length: BEAT, ticks: 4 }) : playCue(ctx, name, { at: 0 })),
    }),
  ),
  { file: 'computer/power-on-crt.wav', seconds: 5, make: (ctx) => powerOnAt(ctx, CRT, 0) },
  { file: 'computer/power-on-lcd.wav', seconds: 5, make: (ctx) => powerOnAt(ctx, LCD, 0) },
  { file: 'computer/power-off-crt.wav', seconds: 2, make: (ctx) => powerOffAt(ctx, CRT, 0) },
  { file: 'computer/power-off-lcd.wav', seconds: 2, make: (ctx) => powerOffAt(ctx, LCD, 0) },
  { file: 'computer/startup-chime.wav', seconds: 8, make: (ctx) => void chimeAt(ctx, 0) },
  { file: 'hum/crt.wav', seconds: HUM_SECONDS, keep: true, make: (ctx) => hum(ctx, CRT, false) },
  { file: 'hum/lcd.wav', seconds: HUM_SECONDS, keep: true, make: (ctx) => hum(ctx, LCD, false) },
  { file: 'hum/spin-up.wav', seconds: 8, keep: true, make: (ctx) => hum(ctx, CRT, true) },
  // The music as the pipeline fills: one layer per occupied stage.
  ...[1, 2, 3, 4, 5].map(
    (layers): Sound => ({
      file: `music/${layers}-${layers === 1 ? 'layer' : 'layers'}.wav`,
      seconds: MUSIC_BEATS * BEAT + 1,
      make: (ctx) => {
        const music = new LayeredMusic(ctx);
        for (let beat = 0; beat < MUSIC_BEATS; beat++) music.playBeat(beat, beat * BEAT, BEAT, layers);
      },
    }),
  ),
];

/** Every file the export writes. */
export function soundFiles(): string[] {
  return SOUNDS.map((sound) => sound.file);
}

/** Bytes as base64 text (to hand a file from the browser to the export script). */
function base64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** Renders one sound into a WAV file: its bytes (base64), length, channels and peak level. */
export async function renderSound(file: string): Promise<{ wav: string; seconds: number; channels: number; peak: number }> {
  const sound = SOUNDS.find((s) => s.file === file);
  if (!sound) throw new Error(`no sound ${file}`);
  // The recorded keys, decoded once.
  await loadKeys(new OfflineAudioContext(1, 1, RATE));
  const ctx = new OfflineAudioContext(2, Math.ceil(sound.seconds * RATE), RATE);
  sound.make(ctx);
  const buffer = await ctx.startRendering();
  const rendered = [0, 1].map((channel) => buffer.getChannelData(channel));
  const channels = mergeIfMono(sound.keep ? rendered : trimSilence(rendered, RATE));
  return { wav: base64(encodeWav(channels, RATE)), seconds: (channels[0]?.length ?? 0) / RATE, channels: channels.length, peak: peak(channels) };
}
