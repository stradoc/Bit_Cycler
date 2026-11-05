import { output } from './output.ts';

// Where every sound goes, and how loud: the game's sounds play into a few
// buses, each with its level here, all of them into the volume setting
// (output.ts). To make something louder or softer everywhere, change its
// level in LEVELS.

export const LEVELS = {
  /** Synthesized interface and machine sounds: ticks, pings, buzzes, the power button, the drives. After a soft filter and a gentle compressor. */
  ui: 1.2,
  /** Recorded keystrokes. */
  keys: 0.55,
  /** The room's hum. */
  hum: 1,
  /** The start-up chime, and how much of it goes into its reverb. */
  chime: 0.22,
  chimeReverb: 0.45,
  /** The song's music layers. */
  music: 0.6,
  /** The song's effects: hits, stalls, mistakes, waits for memory, the metronome. */
  song: 1,
} as const;

export type BusName = 'ui' | 'keys' | 'hum' | 'chime' | 'music' | 'song';

const buses = new WeakMap<BaseAudioContext, Partial<Record<BusName, AudioNode>>>();

/** The audio a scene plays through (Phaser's Web Audio context), if it has one. */
export function audioOf(scene: Phaser.Scene): AudioContext | undefined {
  return scene.sound instanceof Phaser.Sound.WebAudioSoundManager ? scene.sound.context : undefined;
}

/**
 * Whether a sound made now would play now. Phaser pauses the audio clock while
 * the window is in the background, but timers keep going: sounds scheduled
 * then would all wait at the same stopped moment and play at once on return.
 */
export function live<C extends BaseAudioContext>(ctx: C | undefined): ctx is C {
  return ctx?.state === 'running';
}

/** A level into the volume setting. */
function level(ctx: BaseAudioContext, value: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.value = value;
  gain.connect(output(ctx));
  return gain;
}

/** A reverb's impulse: two seconds and a half of stereo noise dying away. */
function roomImpulse(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.round(ctx.sampleRate * 2.5);
  const room = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = room.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
  }
  return room;
}

function makeBus(ctx: BaseAudioContext, name: BusName): AudioNode {
  if (name === 'ui') {
    // The very top rolled off above 12 kHz, and a gentle compressor that blends each sound's layers into one.
    const soft = ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 12000;
    soft.Q.value = 0.5;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -14;
    glue.ratio.value = 2.5;
    glue.attack.value = 0.003;
    glue.release.value = 0.12;
    soft.connect(glue).connect(level(ctx, LEVELS.ui));
    return soft;
  }
  if (name === 'chime') {
    // Played dry, and into a room.
    const chime = level(ctx, LEVELS.chime);
    const reverb = ctx.createConvolver();
    reverb.buffer = roomImpulse(ctx);
    chime.connect(reverb).connect(level(ctx, LEVELS.chimeReverb));
    return chime;
  }
  return level(ctx, LEVELS[name]);
}

/** The bus named `name` (made the first time it's asked for). */
export function bus(ctx: BaseAudioContext, name: BusName): AudioNode {
  let made = buses.get(ctx);
  if (!made) {
    made = {};
    buses.set(ctx, made);
  }
  return (made[name] ??= makeBus(ctx, name));
}
