import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, mergeIfMono, peak, trimSilence } from '../game/src/audio/wav.ts';

const word = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));

test('a WAV file has the standard header for its channels, rate and length', () => {
  const bytes = encodeWav([new Float32Array(3), new Float32Array(3)], 44_100);
  const view = new DataView(bytes.buffer);
  assert.equal(bytes.length, 44 + 3 * 2 * 2);
  assert.equal(word(bytes, 0), 'RIFF');
  assert.equal(view.getUint32(4, true), bytes.length - 8);
  assert.equal(word(bytes, 8), 'WAVE');
  assert.equal(word(bytes, 12), 'fmt ');
  assert.equal(view.getUint16(20, true), 1); // PCM
  assert.equal(view.getUint16(22, true), 2); // channels
  assert.equal(view.getUint32(24, true), 44_100);
  assert.equal(view.getUint32(28, true), 44_100 * 4); // bytes a second
  assert.equal(view.getUint16(32, true), 4); // bytes a frame
  assert.equal(view.getUint16(34, true), 16); // bits
  assert.equal(word(bytes, 36), 'data');
  assert.equal(view.getUint32(40, true), 12);
});

test('samples are 16-bit, interleaved, and clipped to full scale', () => {
  const left = Float32Array.from([1, -1, 2]);
  const right = Float32Array.from([0, 0.5, -3]);
  const view = new DataView(encodeWav([left, right], 8000).buffer);
  const samples = [0, 1, 2, 3, 4, 5].map((i) => view.getInt16(44 + i * 2, true));
  assert.deepEqual(samples, [32767, 0, -32768, 16384, 32767, -32768]);
});

test('the silence after a sound is cut, keeping a short tail', () => {
  const sound = new Float32Array(1000);
  sound[100] = 0.5;
  sound[400] = 0.0001; // below the floor: silence
  const [trimmed] = trimSilence([sound], 1000, 0.0005, 0.01);
  assert.equal(trimmed.length, 101 + 10);
  assert.equal(trimSilence([new Float32Array(50)], 1000, 0.0005, 0.01)[0].length, 10);
});

test('identical channels become one; different ones stay; the peak is the loudest sample', () => {
  const a = Float32Array.from([0.1, -0.7, 0.2]);
  assert.equal(mergeIfMono([a, a.slice()]).length, 1);
  assert.equal(mergeIfMono([a, Float32Array.from([0.1, -0.7, 0.3])]).length, 2);
  assert.equal(peak([a]), Math.fround(0.7));
});
