import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootScript, programListing, type BootStep } from '../game/src/data/boot.ts';
import { programByName } from '../game/src/data/programs.ts';
import { fillBoard, NEW_GAME, withEverything, withTier, type Progress } from '../game/src/sim/progress.ts';
import { ERAS } from '../game/src/ui/eras.ts';

const SLOT = { id: '1', name: 'SLOT 1' };

/** Each step as it ends up on screen. */
function screen(steps: BootStep[]): string[] {
  return steps.flatMap((s) =>
    s.kind === 'print' ? [s.text] : s.kind === 'type' ? [s.prompt + s.text] : s.kind === 'count' ? [`${s.text}${s.to}${s.done}`] : s.kind === 'scroll' ? s.lines : [],
  );
}

const fresh = fillBoard(NEW_GAME, () => 0.5);
const forwarding: Progress = { ...withTier(fresh, 3), clockLevel: 4 }; // 4 MHz x 16 = 64 MHz
const maxed = fillBoard(withEverything(NEW_GAME), () => 0.5);

test('the boot reports the save: CPU, clock, the trip to RAM in cycles, cache, cooler', () => {
  for (const era of ERAS) {
    const text = screen(bootScript(forwarding, SLOT, era)).join('\n');
    assert.match(text, /32-BIT, TIER 3 FORWARDING/, `era ${era.name}`); // forwarding runs on the 32-bit chip
    assert.match(text, /64 MHz, A CYCLE EVERY 16 ns/, `era ${era.name}`);
    assert.match(text, /A TRIP TAKES 60 ns = 4 CYCLES/, `era ${era.name}`); // 60 ns at 64 MHz: 3.84, so 4
    assert.match(text, /NONE/, `era ${era.name}`); // no cache yet
    assert.match(text, /SLOT 1: \$0, 6 CONTRACTS WAITING/, `era ${era.name}`);
  }
});

test('upgrades change the boot', () => {
  for (const era of ERAS) {
    const text = screen(bootScript(maxed, SLOT, era)).join('\n');
    assert.match(text, /64-BIT, TIER 6 2-BIT PREDICTOR, DEEP PIPELINE/, `era ${era.name}`);
    assert.match(text, /4 GHz, A CYCLE EVERY 0.25 ns/, `era ${era.name}`);
    assert.match(text, /61 ns = 244 CYCLES/, `era ${era.name}`); // checking L1 on the way: 61 ns
    assert.match(text, /16 BYTES, DIRECT-MAPPED/, `era ${era.name}`);
    assert.match(text, /FAN/, `era ${era.name}`);
    assert.doesNotMatch(text, /WORN/i, `era ${era.name}`);
  }
});

test('a worn chip is reported; no save says so', () => {
  for (const era of ERAS) {
    assert.match(screen(bootScript({ ...maxed, chipMaxDial: 1.2 }, SLOT, era)).join('\n'), /WORN.*MAX CLOCK 120%/i, `era ${era.name}`);
    assert.match(screen(bootScript(null, SLOT, era)).join('\n'), /NO SAVE YET/, `era ${era.name}`);
  }
});

test('every era ends by typing the command that starts the game, and every line fits the screen', () => {
  for (const era of ERAS) {
    for (const progress of [null, fresh, forwarding, { ...maxed, chipMaxDial: 1 }]) {
      const steps = bootScript(progress, { id: 'dev', name: 'DEVELOPER SAVE' }, era);
      const commands = steps.filter((s) => s.kind === 'type');
      assert.match(commands.at(-1)?.text ?? '', /CYCLER|bit-cycler/, `era ${era.name}`);
      for (const line of screen(steps)) assert.ok(line.length <= 72, `era ${era}: "${line}" is ${line.length} characters`);
    }
  }
});

test('the boot loads every contract\'s program, without comments, in every era', () => {
  const listing = programListing(fresh);
  for (const contract of fresh.board.slice(0, 2)) {
    const spec = programByName(contract.program);
    assert.ok(listing.includes(`LOADING ${spec.client}: ${spec.name}`), spec.name);
  }
  assert.ok(listing.length > 20 && listing.length <= 48);
  assert.ok(listing.every((line) => !line.includes('#') || line.startsWith('LOADING')));
  // No save: the first lesson's program.
  assert.equal(programListing(null)[0], 'LOADING SUM ARRAY');
  for (const era of ERAS) assert.ok(bootScript(fresh, SLOT, era).some((step) => step.kind === 'scroll'), `era ${era.name}`);
});
