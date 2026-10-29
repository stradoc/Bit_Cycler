import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chip, relativePower, steadyTemperature, THERMAL, type ThermalConfig } from '../game/src/sim/thermal.ts';

test('power grows faster than the clock: +50% clock costs about 2.2x the power', () => {
  assert.equal(relativePower(1, true), 1);
  assert.ok(Math.abs(relativePower(1.5, true) - 2.16) < 1e-9); // 1.5 x 1.2^2
  assert.ok(relativePower(0.8, true) < 0.8); // underclocking saves more than it slows
  assert.equal(relativePower(1, false), THERMAL.idlePower); // stalls and bubbles run cooler
});

/** Plays one beat: a busy cycle, or a beat with the clock stopped while it cools. */
const beat = (chip: Chip) => (chip.halted ? chip.coolBeat() : chip.cycle(true));

test('at the rated clock a busy new chip settles at 70°C and never overheats', () => {
  const chip = new Chip(4);
  for (let i = 0; i < 1000; i++) chip.cycle(true);
  assert.ok(Math.abs(chip.temperature - steadyTemperature(1)) < 0.01);
  assert.ok(Math.abs(chip.temperature - 70) < 0.01);
  assert.equal(chip.overheats, 0);
  assert.ok(Math.abs(chip.micros - 1000 / 4) < 1e-6); // 0.25 µs per cycle
});

test('only 140% and up can ever overheat a new chip; 130% settles below the limit', () => {
  assert.ok(steadyTemperature(1.3) < THERMAL.throttleAt);
  assert.ok(steadyTemperature(1.4) > THERMAL.throttleAt);
});

test('an overheat stops the clock: no cycles run, it cools in a few beats, the time still counts, then it runs again', () => {
  const chip = new Chip(4);
  chip.setDial(1.5);
  let firstStop = -1;
  let stopBeats = 0;
  for (let i = 1; firstStop < 0 || chip.halted; i++) {
    beat(chip);
    if (chip.halted && firstStop < 0) firstStop = i;
    else if (chip.halted) stopBeats++;
  }
  // Fast enough to happen within a song, slow enough to react to: about 28 busy beats at 150%.
  assert.ok(firstStop > 20 && firstStop < 40, `stopped after ${firstStop} beats`);
  // With only leakage, it cools quickly: a short freeze.
  assert.ok(stopBeats >= 3 && stopBeats <= 12, `stopped for ${stopBeats} beats`);
  assert.equal(chip.cycles, firstStop);
  assert.equal(chip.haltedBeats, stopBeats + 1);
  assert.ok(chip.haltedMicros > 0 && chip.totalMicros > chip.micros);
  assert.equal(chip.dial, 1.4); // runs again at the worn chip's top clock
});

test('a worn chip overheats sooner: its top clock is as risky as 150% on a new chip, even worn down to 100%', () => {
  const beatsToOverheat = (maxDial: number, cooler: ThermalConfig = THERMAL, dial = maxDial) => {
    const chip = new Chip(4, maxDial, cooler);
    chip.setDial(dial);
    for (let i = 1; i <= 400; i++) {
      chip.cycle(true);
      if (chip.halted) return i;
    }
    return Infinity;
  };
  const fresh = beatsToOverheat(1.5);
  for (const worn of [1.4, 1.3, 1.2, 1.1, 1]) {
    assert.ok(Math.abs(beatsToOverheat(worn) - fresh) <= 1, `top clock ${worn}: ${beatsToOverheat(worn)} vs ${fresh} beats`);
    const chip = new Chip(4, worn);
    assert.ok(chip.throttleAt < THERMAL.throttleAt && chip.resumeAt < chip.throttleAt);
  }
  assert.equal(Math.round(new Chip(4, 1.4).throttleAt), 88);
  assert.equal(Math.round(new Chip(4, 1).throttleAt), 65);
  // Worn out, the rated clock overheats, so underclock: 90% only just stays safe, 80% easily.
  assert.equal(beatsToOverheat(1, THERMAL, 0.9), Infinity);
  assert.equal(beatsToOverheat(1, THERMAL, 0.8), Infinity);
  // Kept at its top, a worn-out chip keeps stopping to cool but always starts again.
  const chip = new Chip(4, 1);
  for (let i = 0; i < 300; i++) beat(chip);
  assert.ok(chip.overheats >= 5, `${chip.overheats} overheats`);
  assert.ok(chip.cycles > 150, `${chip.cycles} cycles ran`);
  assert.equal(chip.maxDial, 1); // can't wear past its rated clock
  // The fan keeps even a worn chip's top clock safe.
  for (const worn of [1.5, 1.4, 1.3, 1.2, 1.1, 1]) assert.equal(beatsToOverheat(worn, { ...THERMAL, ratedRise: 24 }), Infinity);
});

test('without the overclocking upgrade, H stops at the rated clock, and a new chip is safe there', () => {
  const chip = new Chip(4, THERMAL.maxDial, THERMAL, false);
  assert.equal(chip.setDial(1.3), 1);
  for (let i = 0; i < 500; i++) chip.cycle(true);
  assert.equal(chip.overheats, 0);
});

test('each overheat wears the chip: the maximum clock drops 10%, never below rated', () => {
  const chip = new Chip(4);
  chip.setDial(1.5);
  while (chip.overheats === 0) chip.cycle(true);
  assert.equal(chip.maxDial, 1.4);
  assert.equal(chip.dial, 1.4); // pulled down with it
  assert.equal(chip.setDial(1.5), 1.4); // H can't go past the new maximum
  const worn = new Chip(4, 1);
  assert.equal(worn.setDial(1.2), 1); // a worn-out chip runs at its rated clock, no faster
  assert.equal(worn.setDial(0.5), THERMAL.minDial);
});
