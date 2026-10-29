import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chip, relativePower, steadyTemperature, THERMAL, type ThermalConfig } from '../game/src/sim/thermal.ts';

test('power grows faster than the clock: +50% clock costs about 2.2x the power', () => {
  assert.equal(relativePower(1, true), 1);
  assert.ok(Math.abs(relativePower(1.5, true) - 2.16) < 1e-9); // 1.5 x 1.2^2
  assert.ok(relativePower(0.8, true) < 0.8); // underclocking saves more than it slows
  assert.equal(relativePower(1, false), THERMAL.idlePower); // stalls and bubbles run cooler
});

test('at the rated clock a busy chip settles at 70°C and never throttles', () => {
  const chip = new Chip(4);
  for (let i = 0; i < 1000; i++) chip.cycle(true);
  assert.ok(Math.abs(chip.temperature - steadyTemperature(1)) < 0.01);
  assert.ok(Math.abs(chip.temperature - 70) < 0.01);
  assert.equal(chip.throttledCycles, 0);
  assert.ok(Math.abs(chip.micros - 1000 / 4) < 1e-6); // 0.25 µs per cycle
});

test('only 140% and up can ever overheat; 130% settles below the throttle point', () => {
  assert.ok(steadyTemperature(1.3) < THERMAL.throttleAt);
  assert.ok(steadyTemperature(1.4) > THERMAL.throttleAt);
});

test('a heavy overclock heats up, throttles back to the rated clock, cools, and speeds up again', () => {
  const chip = new Chip(4);
  chip.setDial(1.5);
  let firstThrottle = -1;
  let resumed = false;
  for (let i = 0; i < 300; i++) {
    chip.cycle(true);
    if (chip.throttled && firstThrottle < 0) {
      firstThrottle = i + 1;
      assert.equal(chip.mhz, 4); // back to rated
    }
    if (firstThrottle > 0 && !chip.throttled) resumed = true;
  }
  // Fast enough to happen within a song, slow enough to react to: about 28 busy beats at 150%.
  assert.ok(firstThrottle > 20 && firstThrottle < 40, `throttled after ${firstThrottle} cycles`);
  assert.ok(resumed);
  assert.ok(chip.micros < 300 / 4); // still faster than the rated clock overall
});

test('a worn chip overheats sooner: its top clock is as risky as 150% on a new chip, and it always recovers', () => {
  const beatsToOverheat = (maxDial: number, cooler: ThermalConfig = THERMAL) => {
    const chip = new Chip(4, maxDial, cooler);
    chip.setDial(maxDial);
    for (let i = 1; i <= 400; i++) {
      chip.cycle(true);
      if (chip.throttled) return i;
    }
    return Infinity;
  };
  const fresh = beatsToOverheat(1.5);
  for (const worn of [1.4, 1.3, 1.2, 1.1]) {
    assert.ok(Math.abs(beatsToOverheat(worn) - fresh) <= 1, `top clock ${worn}: ${beatsToOverheat(worn)} vs ${fresh} beats`);
    const chip = new Chip(4, worn);
    assert.ok(chip.throttleAt < THERMAL.throttleAt);
    assert.ok(chip.resumeAt < chip.throttleAt && chip.resumeAt > THERMAL.ambient + THERMAL.ratedRise, `resume ${chip.resumeAt}`);
  }
  assert.equal(Math.round(new Chip(4, 1.4).throttleAt), 88);
  // Throttled back to rated, a worn chip still cools enough to run again.
  const chip = new Chip(4, 1.2);
  chip.setDial(1.2);
  let resumed = false;
  for (let i = 0; i < 300; i++) {
    chip.cycle(true);
    if (chip.overheats > 0 && !chip.throttled) resumed = true;
  }
  assert.ok(resumed);
  // A chip with no overclock left is back to the normal limit: the rated clock never overheats.
  assert.equal(new Chip(4, 1).throttleAt, THERMAL.throttleAt);
  assert.equal(beatsToOverheat(1), Infinity);
  // The fan keeps even a worn chip's top clock safe.
  for (const worn of [1.5, 1.4, 1.3, 1.2, 1.1]) assert.equal(beatsToOverheat(worn, { ...THERMAL, ratedRise: 24 }), Infinity);
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
