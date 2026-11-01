import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Conductor } from '../game/src/audio/conductor.ts';

// The beat clock's pause (the pause menu): the beat stops where it is and
// carries on from there, however long the pause. Run on a stand-in audio
// clock moved by hand (no output timestamp, no latency, not "running", so no
// sounds are made).

function clock(): { ctx: AudioContext; at: (seconds: number) => void } {
  const fake = { currentTime: 0, outputLatency: 0 };
  return { ctx: fake as unknown as AudioContext, at: (seconds) => void (fake.currentTime = seconds) };
}

test('a paused beat stays put, and resumes from where it stopped', () => {
  const { ctx, at } = clock();
  const conductor = new Conductor(ctx, 60);
  conductor.start(); // beat 0 sounds 0.1 s from now (the scheduler's lookahead)
  at(2.1);
  assert.ok(Math.abs(conductor.currentBeat() - 2) < 0.01);
  conductor.pause();
  at(30);
  assert.ok(Math.abs(conductor.currentBeat() - 2) < 0.01, 'no beats go by while paused');
  conductor.resume();
  assert.ok(Math.abs(conductor.currentBeat() - 2) < 0.01, 'nothing skipped on resuming');
  at(31);
  assert.ok(Math.abs(conductor.currentBeat() - 3) < 0.01, 'one second later, one beat on (60 BPM)');
  conductor.stop();
});
