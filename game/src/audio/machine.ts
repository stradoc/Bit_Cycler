import type { Era } from '../ui/eras.ts';
import { key } from './cues.ts';
import { audioOf, bus, live } from './mix.ts';
import { noiseBuffer, noiseBurst, tone } from './synth.ts';

// The computer switching on and off, and its start-up chime: longer sounds
// that follow the era's computer (a CRT degausses and thooms; an LCD doesn't).
// Each is built at a time `t` on any audio (the game's, or an offline one
// rendering a file), with a wrapper that plays it now in a scene.

/**
 * The power button: the switch, then the machine waking over about three
 * seconds (a low tone and soft noise rising together, a few faint crackles of
 * static as the screen charges, then a soft chime as it settles); on a CRT,
 * also the low "thoom" of the tube and its degaussing coil's fading hum.
 */
export function powerOnAt(ctx: BaseAudioContext, era: Era, t: number): void {
  const ui = bus(ctx, 'ui');
  key(ctx, t, 'enter');
  const rise = ctx.createOscillator();
  rise.frequency.setValueAtTime(55, t + 0.1);
  rise.frequency.exponentialRampToValueAtTime(220, t + 2.4);
  const riseGain = ctx.createGain();
  riseGain.gain.setValueAtTime(0.0001, t + 0.1);
  riseGain.gain.exponentialRampToValueAtTime(0.05, t + 2);
  riseGain.gain.exponentialRampToValueAtTime(0.0001, t + 3);
  rise.connect(riseGain).connect(ui);
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
  air.connect(airBand).connect(airGain).connect(ui);
  air.start(t + 0.1, Math.random());
  air.stop(t + 3.05);
  for (let i = 0; i < 6; i++) noiseBurst(ctx, t + 0.6 + Math.random() * 1.6, 0.006, 'highpass', 4000, 0.06);
  tone(ctx, t + 2.7, 1320, 0.5, 0.05, 'triangle');
  tone(ctx, t + 2.7, 660, 0.6, 0.04);
  if (era.computer.display !== 'crt') return;
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
  coil.connect(band).connect(gain).connect(ui);
  coil.start(t + 0.05);
  coil.stop(t + 1.05);
}

/** The power button, played now: even while the audio is still starting (the press is what starts it). */
export function powerOn(scene: Phaser.Scene, era: Era): void {
  const ctx = audioOf(scene);
  if (ctx) powerOnAt(ctx, era, ctx.currentTime);
}

/** The power button again: the switch, and on a CRT a soft falling whine as the picture collapses. */
export function powerOffAt(ctx: BaseAudioContext, era: Era, t: number): void {
  key(ctx, t, 'enter');
  if (era.computer.display !== 'crt') return;
  tone(ctx, t + 0.05, 700, 0.6, 0.04, 'sine', 40);
  tone(ctx, t + 0.5, 60, 0.3, 0.12, 'sine', 40);
}

export function powerOff(scene: Phaser.Scene, era: Era): void {
  const ctx = audioOf(scene);
  if (live(ctx)) powerOffAt(ctx, era, ctx.currentTime);
}

/**
 * The start-up chime, as the title appears at the end of the boot (our own,
 * in the spirit of the warm start-up sounds old operating systems played): a
 * soft pad on a major-ninth chord swelling in, a rising arpeggio of bell
 * tones over it, a high shimmer, all in a gentle reverb (the chime bus).
 * Returns its length (s), not counting the reverb's tail.
 */
export function chimeAt(ctx: BaseAudioContext, t: number): number {
  const length = 4.2;
  const mix = bus(ctx, 'chime');

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
    for (const [ratio, volume, ring] of [[1, 0.22, 1.8], [2.76, 0.06, 0.6]] as const) {
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

/** The start-up chime, played now (0 while the audio is paused). */
export function startupChime(scene: Phaser.Scene): number {
  const ctx = audioOf(scene);
  return live(ctx) ? chimeAt(ctx, ctx.currentTime + 0.05) : 0;
}
