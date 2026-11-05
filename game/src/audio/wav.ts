// Writing sounds as WAV files: plain 16-bit PCM, which every browser and
// audio editor reads. Plain functions on sample arrays (no browser audio),
// so they're tested in Node.

/** Each channel's samples, -1 to 1. */
export type Channels = readonly Float32Array[];

/** 16-bit PCM WAV bytes for these channels at `sampleRate`. Samples beyond -1..1 are clipped. */
export function encodeWav(channels: Channels, sampleRate: number): Uint8Array {
  const count = channels.length;
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * count * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const text = (at: number, word: string) => [...word].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  // The RIFF header, then the format chunk (PCM, channels, rate, bytes per second, bytes per frame, bits), then the data.
  text(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, dataBytes, true);
  // Frames interleaved: left, right, left, right...
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[i]));
      view.setInt16(at, Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff), true);
      at += 2;
    }
  }
  return bytes;
}

/** Cuts the silence after a sound ends (everything after its last sample above `floor`), keeping `tail` seconds. */
export function trimSilence(channels: Channels, sampleRate: number, floor = 0.0005, tail = 0.02): Float32Array[] {
  let last = -1;
  for (const channel of channels) {
    for (let i = channel.length - 1; i > last; i--) {
      if (Math.abs(channel[i]) > floor) {
        last = i;
        break;
      }
    }
  }
  const end = Math.min(channels[0]?.length ?? 0, last + 1 + Math.round(tail * sampleRate));
  return channels.map((channel) => channel.slice(0, end));
}

/** One channel if every channel is the same (most sounds are mono; the chime's reverb isn't). */
export function mergeIfMono(channels: Channels, tolerance = 1e-6): Float32Array[] {
  const [first, ...rest] = channels;
  if (!first) return [];
  const same = rest.every((channel) => channel.every((sample, i) => Math.abs(sample - first[i]) <= tolerance));
  return same ? [first] : [...channels];
}

/** The loudest sample's level (0-1). */
export function peak(channels: Channels): number {
  let loudest = 0;
  for (const channel of channels) for (const sample of channel) loudest = Math.max(loudest, Math.abs(sample));
  return loudest;
}
