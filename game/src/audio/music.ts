import { output } from './output.ts';

// Five synth layers, one per pipeline stage: a full pipeline plays the full
// song, and a flush strips it back down. Am - F - C - G, one chord per bar.

const ROOTS = [110, 87.31, 130.81, 98]; // A2, F2, C3, G2
const CHORDS = [
  [0, 3, 7], // A minor
  [0, 4, 7], // F major
  [0, 4, 7], // C major
  [0, 4, 7], // G major
];
const LEAD_PATTERN = [0, 2, 1, 2];
const ARP_PATTERN = [0, 1, 2, 1];

const semitones = (base: number, steps: number) => base * 2 ** (steps / 12);

export class LayeredMusic {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly noise: AudioBuffer;

  constructor(ctx: AudioContext, volume = 0.6) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = volume;
    this.out.connect(output(ctx));
    this.noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  /** Schedules beat `beat` (from 0) at audio time `time` with the first `layers` (0-5) playing. */
  playBeat(beat: number, time: number, secondsPerBeat: number, layers: number): void {
    if (beat < 0) return;
    const bar = Math.floor(beat / 4) % ROOTS.length;
    const inBar = beat % 4;
    const root = ROOTS[bar];
    const chord = CHORDS[bar];
    const half = secondsPerBeat / 2;

    // 1 (IF): bass on every beat
    if (layers >= 1) this.tone('triangle', root, time, secondsPerBeat * 0.9, 0.22);
    // 2 (ID): hi-hat on the off-beat
    if (layers >= 2) this.noiseHit(time + half, 0.04, 0.05, 'highpass', 7000);
    // 3 (EX): kick on 1 and 3, snare on 2 and 4
    if (layers >= 3) {
      if (inBar % 2 === 0) this.kick(time);
      else this.noiseHit(time, 0.12, 0.09, 'bandpass', 1800);
    }
    // 4 (MEM): arpeggio in eighth notes
    if (layers >= 4) {
      for (let i = 0; i < 2; i++) {
        const step = ARP_PATTERN[(inBar * 2 + i) % ARP_PATTERN.length];
        this.tone('square', semitones(root * 2, chord[step]), time + i * half, half * 0.8, 0.035);
      }
    }
    // 5 (WB): lead melody
    if (layers >= 5) {
      this.tone('square', semitones(root * 4, chord[LEAD_PATTERN[inBar]]), time, secondsPerBeat * 0.7, 0.045);
    }
  }

  private envelope(time: number, duration: number, volume: number): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    gain.connect(this.out);
    return gain;
  }

  private tone(type: OscillatorType, frequency: number, time: number, duration: number, volume: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(this.envelope(time, duration, volume));
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  private kick(time: number): void {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    osc.connect(this.envelope(time, 0.18, 0.4));
    osc.start(time);
    osc.stop(time + 0.2);
  }

  private noiseHit(time: number, duration: number, volume: number, type: BiquadFilterType, frequency: number): void {
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
