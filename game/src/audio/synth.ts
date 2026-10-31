import { bus } from './mix.ts';

// The building blocks every synthesized sound is made of, scheduled at an
// audio-clock time `at` into a bus (the interface bus unless given). They work
// on the game's live audio and on an offline one (rendering to a file, audio/render.ts).

let noise: AudioBuffer | undefined;

/** Two seconds of white noise, shared by everything that hisses. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  if (!noise || noise.sampleRate !== ctx.sampleRate) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

/** Looping noise from a random place in the buffer (a hum's air, a modem's hiss). */
export function noiseLoop(ctx: BaseAudioContext): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;
  source.loopStart = Math.random();
  return source;
}

/** A burst of filtered noise that dies away: a key's click, a drive head, and so on. */
export function noiseBurst(
  ctx: BaseAudioContext,
  at: number,
  duration: number,
  filter: BiquadFilterType,
  frequency: number,
  volume: number,
  destination: AudioNode = bus(ctx, 'ui'),
  q = 1,
): void {
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
export function tone(
  ctx: BaseAudioContext,
  at: number,
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
  to?: number,
  destination: AudioNode = bus(ctx, 'ui'),
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + duration * 0.6);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0005, at + duration);
  osc.connect(gain).connect(destination);
  osc.start(at);
  osc.stop(at + duration + 0.01);
}

/** A tone held flat for `duration` with quick fades at each end (no decay): a digital beep, or a buzz's body. */
export function flat(
  ctx: BaseAudioContext,
  at: number,
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'square',
  lowpass = 3000,
  destination: AudioNode = bus(ctx, 'ui'),
): void {
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
  osc.connect(soften).connect(gain).connect(destination);
  osc.start(at);
  osc.stop(at + duration + 0.01);
}

/** A square wave's upper harmonics only (a band around 1.6 kHz), held flat: the buzz in an error. */
export function buzz(ctx: BaseAudioContext, at: number, frequency: number, duration: number, volume: number, destination: AudioNode = bus(ctx, 'ui')): void {
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
  osc.connect(band).connect(gain).connect(destination);
  osc.start(at);
  osc.stop(at + duration + 0.01);
}

/** A short chiptune tone with a fast decay, at full level from its start: the song's hits and the metronome's click. */
export function blip(
  ctx: BaseAudioContext,
  frequency: number,
  at = ctx.currentTime,
  duration = 0.06,
  type: OscillatorType = 'square',
  volume = 0.1,
  destination: AudioNode = bus(ctx, 'song'),
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
  osc.connect(gain).connect(destination);
  osc.start(at);
  osc.stop(at + duration + 0.01);
}
