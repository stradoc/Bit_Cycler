import { audioOf, bus, live } from './mix.ts';
import { playKey, type KeyKind } from './samples.ts';
import { blip, buzz, flat, noiseBurst, tone } from './synth.ts';

// Every short sound the game makes, by name: screens call cue(scene, 'move')
// and never build sounds themselves, so a sound is changed here for every
// screen at once. The interface sounds are modeled on the terminal sounds of
// SUPERHOT's in-game computer (measured for their length, pitch and balance;
// nothing of theirs is used): short, crisp sounds with flat shapes, not soft
// analog thumps. Keys are recordings (audio/samples.ts), with synthesized
// ticks until they load. The song's sounds play on its own bus, with its music.

export type CueOptions = {
  /** When, on the audio clock (now unless given). */
  readonly at?: number;
  /** Louder or softer than designed (1). */
  readonly volume?: number;
};

/** What the cues that need more than a time and a volume need (and must be given). */
type Extras = {
  /** One beat of waiting for memory: the beat's length (s), and how many cycles tick by in it. */
  readonly waiting: { readonly length: number; readonly ticks: number };
};

/** A cue's own options after the time and volume: `cue(scene, 'waiting', { at, length, ticks })`, `cue(scene, 'move')`. */
export type CueArgs<N extends Cue> = N extends keyof Extras ? [options: CueOptions & Extras[N]] : [options?: CueOptions];

type Recipe<Extra = object> = (ctx: BaseAudioContext, at: number, scale: number, extra: Extra) => void;

/** Which of the three typing ticks plays next, so repeated keys don't all sound alike. */
let variation = 0;

/**
 * One key: a recording if they've loaded, else a short dry tick. `letter`
 * (one of three variations around 1.15-1.55 kHz, most of it in the first
 * 30 ms, hardly any low end), `enter` (louder and fuller, a 1 kHz core with
 * broadband click and a little low knock, and a faint second tick as it comes
 * back up), `space` (soft broadband noise, no pitch).
 */
export function key(ctx: BaseAudioContext, at: number, kind: KeyKind = 'letter', scale = 1): void {
  if (playKey(ctx, at, kind, scale)) return;
  const ui = bus(ctx, 'ui');
  if (kind === 'space') {
    noiseBurst(ctx, at, 0.08, 'bandpass', 2800, 0.7 * scale, ui, 0.4);
    return;
  }
  if (kind === 'enter') {
    noiseBurst(ctx, at, 0.04, 'bandpass', 2800, 1.4 * scale, ui, 0.5);
    noiseBurst(ctx, at, 0.02, 'highpass', 6500, 0.5 * scale);
    tone(ctx, at, 1020, 0.05, 0.25 * scale);
    tone(ctx, at, 110, 0.04, 0.2 * scale, 'sine', 75);
    noiseBurst(ctx, at + 0.11, 0.015, 'bandpass', 2400, 0.3 * scale, ui, 0.8);
    return;
  }
  variation = (variation + 1) % 3;
  const pitch = [1180, 1350, 1520][variation] * (0.98 + Math.random() * 0.04);
  noiseBurst(ctx, at, 0.03, 'bandpass', pitch, 0.9 * scale, ui, 2.2);
  tone(ctx, at, pitch, 0.035, 0.16 * scale, 'triangle', pitch * 0.85);
  noiseBurst(ctx, at, 0.018, 'bandpass', 3600, 0.6 * scale, ui, 1);
  tone(ctx, at, 90, 0.02, 0.025 * scale);
}

/**
 * Ping (opening something) and pong (going back): two quick taps, then a
 * tone near 1 kHz that holds and fades, with a little high sparkle; the pong
 * is lower and rounder and ends on a small tap.
 */
function pingPong(ctx: BaseAudioContext, at: number, pong: boolean, scale: number): void {
  const pitch = pong ? 960 : 1000;
  for (const tap of [0, 0.02]) {
    flat(ctx, at + tap, pitch, 0.014, (pong ? 0.09 : 0.07) * scale, 'square', pong ? 3000 : 9000);
    noiseBurst(ctx, at + tap, 0.025, 'highpass', 6500, (pong ? 0.6 : 0.45) * scale);
  }
  tone(ctx, at + 0.04, pitch, pong ? 0.17 : 0.13, (pong ? 0.13 : 0.12) * scale, pong ? 'sine' : 'triangle');
  // The ping's bright partials; the pong's are fewer and softer.
  tone(ctx, at, pong ? 2960 : 2225, 0.08, (pong ? 0.05 : 0.025) * scale);
  tone(ctx, at, pong ? 4950 : 5850, 0.06, (pong ? 0.07 : 0.1) * scale);
  if (pong) flat(ctx, at + 0.18, pitch * 1.02, 0.03, 0.14 * scale, 'square', 2500);
}

/** The song's bus, for its sounds. */
const song = (ctx: BaseAudioContext) => bus(ctx, 'song');

/** Every cue, by name. */
const CUES = {
  // ---- the interface ----
  /** Moving the selection: a typing tick. */
  move: (ctx, at, scale) => key(ctx, at, 'letter', 0.8 * scale),
  /** Opening or choosing something: a ping. */
  confirm: (ctx, at, scale) => pingPong(ctx, at, false, scale),
  /** Going back: a pong. */
  back: (ctx, at, scale) => pingPong(ctx, at, true, scale),
  /** Buying: a burst of typing, Enter, then a ping. */
  buy: (ctx, at, scale) => {
    for (let i = 0; i < 5; i++) {
      key(ctx, at, 'letter', 0.7 * scale);
      at += 0.06 + Math.random() * 0.05;
    }
    key(ctx, at + 0.04, 'enter', 0.8 * scale);
    pingPong(ctx, at + 0.12, false, scale);
  },
  /** Not allowed: a short flat buzz, square-ish around 128 Hz, cut off clean (a little body, mostly its buzzing upper harmonics). */
  error: (ctx, at, scale) => {
    flat(ctx, at, 128, 0.07, 0.035 * scale, 'square', 500);
    buzz(ctx, at, 128, 0.07, 0.2 * scale);
  },
  /** Typing (the intro, the menu's commands): a letter, Space, Enter. */
  letter: (ctx, at, scale) => key(ctx, at, 'letter', 0.65 * scale),
  space: (ctx, at, scale) => key(ctx, at, 'space', 0.65 * scale),
  enter: (ctx, at, scale) => key(ctx, at, 'enter', 0.8 * scale),
  /** A new line of text appearing: a tiny bright tick (volume lower when lines pour out fast). */
  line: (ctx, at, scale) => {
    const pitch = [2450, 2500, 2425][variation] ?? 2450;
    variation = (variation + 1) % 3;
    flat(ctx, at, pitch, 0.025, 0.05 * scale, 'square', 10000);
    tone(ctx, at, pitch * 2.2, 0.04, 0.06 * scale);
    noiseBurst(ctx, at, 0.035, 'highpass', 6000, 0.3 * scale);
  },

  // ---- the computer (the boot, timed with its text in data/boot.ts) ----
  /** The power-on self test passing: one short flat beep. */
  beep: (ctx, at, scale) => flat(ctx, at, 880, 0.12, 0.07 * scale, 'square', 2500),
  /** A floppy drive reading: the head stepping track to track in runs, then the motor turning the disk. */
  floppy: (ctx, at, scale) => {
    const start = at;
    for (let run = 0; run < 3; run++) {
      const steps = 4 + Math.floor(Math.random() * 6);
      for (let i = 0; i < steps; i++, at += 0.022) {
        tone(ctx, at, 150 + Math.random() * 25, 0.02, 0.06 * scale, 'triangle');
        noiseBurst(ctx, at, 0.008, 'bandpass', 1100, 0.04 * scale);
      }
      at += 0.12 + Math.random() * 0.15;
    }
    noiseBurst(ctx, start, at - start + 0.4, 'lowpass', 260, 0.04 * scale);
  },
  /** A hard drive reading: soft head ticks in uneven bursts. */
  disk: (ctx, at, scale) => {
    for (let burst = 0; burst < 3; burst++) {
      const clicks = 3 + Math.floor(Math.random() * 5);
      for (let i = 0; i < clicks; i++, at += 0.025 + Math.random() * 0.04) {
        noiseBurst(ctx, at, 0.01, 'bandpass', 1400 + Math.random() * 900, 0.1 * scale, bus(ctx, 'ui'), 1.5);
      }
      at += 0.1 + Math.random() * 0.2;
    }
  },

  // ---- the song ----
  /** The metronome: a click on each beat, higher on the first of the bar. */
  beat: (ctx, at, scale) => blip(ctx, 880, at, 0.05, 'square', 0.15 * scale, song(ctx)),
  downbeat: (ctx, at, scale) => blip(ctx, 1760, at, 0.05, 'square', 0.15 * scale, song(ctx)),
  /** An instruction issued, pitched by the unit it goes to. */
  'hit-alu': (ctx, at, scale) => blip(ctx, 660, at, 0.06, 'square', 0.1 * scale, song(ctx)),
  'hit-mem': (ctx, at, scale) => blip(ctx, 523, at, 0.06, 'square', 0.1 * scale, song(ctx)),
  'hit-branch': (ctx, at, scale) => blip(ctx, 784, at, 0.06, 'square', 0.1 * scale, song(ctx)),
  /** A stall held for a hazard. */
  stall: (ctx, at, scale) => blip(ctx, 330, at, 0.08, 'triangle', 0.08 * scale, song(ctx)),
  /** A mistake: a low rasp. */
  mistake: (ctx, at, scale) => blip(ctx, 110, at, 0.15, 'sawtooth', 0.08 * scale, song(ctx)),
  /** One beat of waiting for memory: a low drone through it, and fast ticks for the cycles going by. */
  waiting: (ctx, at, scale, { length, ticks }: Extras['waiting']) => {
    blip(ctx, 55, at, length * 0.95, 'sawtooth', 0.05 * scale, song(ctx));
    for (let i = 0; i < ticks; i++) blip(ctx, 2400, at + (i * length) / ticks, 0.015, 'square', 0.03 * scale, song(ctx));
  },
  /** The data arrived: a bright double click. */
  arrived: (ctx, at, scale) => {
    blip(ctx, 1320, at, 0.06, 'square', 0.07 * scale, song(ctx));
    blip(ctx, 1760, at + 0.07, 0.06, 'square', 0.07 * scale, song(ctx));
  },
} satisfies Record<string, Recipe<never>>;

export type Cue = keyof typeof CUES;

/** Every cue's name, in the order above (for exporting them all, audio/render.ts). */
export const CUE_NAMES = Object.keys(CUES) as Cue[];

/** Schedules a cue on any audio, playing or not (an offline render plays it into a file). */
export function playCue<N extends Cue>(ctx: BaseAudioContext, name: N, ...[options]: CueArgs<N>): void {
  (CUES[name] as Recipe<CueOptions | undefined>)(ctx, options?.at ?? ctx.currentTime, options?.volume ?? 1, options);
}

/** Plays a cue on the audio of `ctx` if it's running (for code that has no scene: the conductor). */
export function cueOn<N extends Cue>(ctx: AudioContext | undefined, name: N, ...options: CueArgs<N>): void {
  if (live(ctx)) playCue(ctx, name, ...options);
}

/** Plays a cue: cue(this, 'move'). Silent while the game's audio is paused (the window in the background). */
export function cue<N extends Cue>(scene: Phaser.Scene, name: N, ...options: CueArgs<N>): void {
  cueOn(audioOf(scene), name, ...options);
}
