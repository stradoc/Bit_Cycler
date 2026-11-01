import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CycleReport, Outcome } from '../game/src/rhythm/pipelineRun.ts';
import type { Slot } from '../game/src/sim/pipeline.ts';
import { groove } from '../game/src/song/groove.ts';

// How the song's music follows the run (song/groove.ts): it moves on only on
// cycles that do work, and a lost cycle's sound says why it was lost.

const slot = {} as Slot;
/** A cycle: an instruction issued, a stall, nothing in ID (filling), or a choice that turned out `outcome`; `flushed` throws work away. */
function cycle(kind: 'issued' | 'stalled' | 'idle', outcome?: Outcome, flushed = false): CycleReport {
  const event = kind === 'issued' ? { kind, slot } : kind === 'stalled' ? { kind, needed: outcome === 'stalled' } : { kind };
  const decision = outcome ? { slot, action: null, outcome, judgment: 'PERFECT' as const, hazard: null, waited: false } : null;
  return { event, flushed: flushed ? [slot] : [], decision, dial: 1 } as CycleReport;
}

test('the song moves on for each cycle that does work: an issue, or the pipeline filling and emptying', () => {
  assert.deepEqual(groove([cycle('issued', 'issued')]), { advance: 1, mode: 'play' });
  assert.deepEqual(groove([cycle('idle')]), { advance: 1, mode: 'play' });
  assert.deepEqual(groove([cycle('issued', 'issued'), cycle('issued', 'issued')]), { advance: 2, mode: 'play' });
});

test('a needed stall holds the song; a mistake skips it; thrown-away work stops it like tape', () => {
  assert.deepEqual(groove([cycle('stalled', 'stalled')]), { advance: 0, mode: 'hold' });
  for (const mistake of ['missed', 'wrong-unit', 'off-beat', 'wasted-stall'] as const) {
    assert.deepEqual(groove([cycle('stalled', mistake)]), { advance: 0, mode: 'skip' }, mistake);
  }
  assert.deepEqual(groove([cycle('issued', 'violation', true)]), { advance: 0, mode: 'flush' });
  // A wrong branch guess (tier 4 on): whatever issued that cycle, the flush is what's heard.
  assert.deepEqual(groove([cycle('issued', 'issued', true)], true, true), { advance: 0, mode: 'flush' });
  // Before guessing, a taken branch always flushes: the hardware's cost, so the song only holds.
  assert.deepEqual(groove([cycle('issued', 'issued', true)], true, false), { advance: 0, mode: 'hold' });
  // ...but a beat missed as it happens is still the player's mistake.
  assert.deepEqual(groove([cycle('stalled', 'missed', true)], true, false), { advance: 0, mode: 'skip' });
});

test('several cycles in a beat: the song moves on for the ones that worked, and the worst one is heard', () => {
  assert.deepEqual(groove([cycle('issued', 'issued'), cycle('stalled', 'missed')]), { advance: 1, mode: 'skip' });
  assert.deepEqual(groove([cycle('stalled', 'stalled'), cycle('issued', 'issued', true)], true, true), { advance: 0, mode: 'flush' });
});

test('no cycles: practice waiting for the player holds; before anything has played, the song starts', () => {
  assert.deepEqual(groove([]), { advance: 0, mode: 'hold' });
  assert.deepEqual(groove([], false), { advance: 1, mode: 'play' });
});
