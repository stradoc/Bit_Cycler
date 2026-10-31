import { audioOf, bus } from './mix.ts';

// Recorded sounds. For now, keystrokes from a real mechanical keyboard
// (Cherry MX Blue, CC0: assets/sounds/CREDITS.txt): eight letters, Enter and
// Space. Loaded once; until they arrive (or if they can't load), keys use a
// synthesized tick instead (audio/cues.ts).

const KEY_FILES = { letter: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `letter-${n}`), enter: ['enter'], space: ['space'] } as const;
export type KeyKind = keyof typeof KEY_FILES;

let keySamples: Record<KeyKind, AudioBuffer[]> | undefined;
let loading: Promise<void> | undefined;

/** Loads the recordings once, decoded by `ctx` (decoding works before the player has pressed anything). */
export function loadKeys(ctx: BaseAudioContext): Promise<void> {
  if (keySamples) return Promise.resolve();
  const load = (name: string) =>
    fetch(`assets/sounds/keys/${name}.wav`)
      .then((response) => response.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data));
  const kinds = Object.keys(KEY_FILES) as KeyKind[];
  loading ??= Promise.all(kinds.map((kind) => Promise.all(KEY_FILES[kind].map(load))))
    .then((loaded) => {
      keySamples = Object.fromEntries(kinds.map((kind, i) => [kind, loaded[i]])) as Record<KeyKind, AudioBuffer[]>;
    })
    .catch(() => {
      loading = undefined; // try again next time
    });
  return loading;
}

/** Starts loading the recordings with a scene's audio. */
export function loadSounds(scene: Phaser.Scene): void {
  const ctx = audioOf(scene);
  if (ctx) void loadKeys(ctx);
}

/** Plays a recorded keystroke, a few percent higher or lower each time so repeats don't sound identical; false if none are loaded. */
export function playKey(ctx: BaseAudioContext, at: number, kind: KeyKind, scale: number): boolean {
  const samples = keySamples?.[kind];
  if (!samples?.length) return false;
  const source = ctx.createBufferSource();
  source.buffer = samples[Math.floor(Math.random() * samples.length)];
  source.playbackRate.value = 0.96 + Math.random() * 0.08;
  const gain = ctx.createGain();
  gain.gain.value = scale;
  source.connect(gain).connect(bus(ctx, 'keys'));
  source.start(at);
  return true;
}
