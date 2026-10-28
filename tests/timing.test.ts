import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beatAtTime, secondsPerBeat, timeOfBeat } from '../game/src/audio/timing.ts';

test('120 BPM is half a second per beat', () => {
  assert.equal(secondsPerBeat(120), 0.5);
});

test('beat position counts from the start time', () => {
  assert.equal(beatAtTime(10, 10, 120), 0);
  assert.equal(beatAtTime(11, 10, 120), 2);
  assert.equal(beatAtTime(9.5, 10, 120), -1);
});

test('timeOfBeat is the inverse of beatAtTime (within float error)', () => {
  // 60/150 = 0.4 has no exact binary representation, so compare with a tolerance.
  for (const beat of [0, 1, 7, 33]) {
    const roundTrip = beatAtTime(timeOfBeat(beat, 4, 150), 4, 150);
    assert.ok(Math.abs(roundTrip - beat) < 1e-9, `beat ${beat} came back as ${roundTrip}`);
  }
});
