import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS } from '../game/src/data/lessons.ts';
import { BOARD_TOUR, BOARD_TOUR_ID, SONG_TOURS, TAUGHT_IDS } from '../game/src/data/tours.ts';

// The guide's tours: they fit its bubble, and each song tour belongs to a lesson.
// (Which parts of a screen a step may point at is checked by the compiler.)

/** About what the bubble holds at its width before it gets taller than the robot's screen space. */
const LONGEST_LINE = 150;

test('every line the guide says is short enough for its bubble', () => {
  for (const step of [...BOARD_TOUR, ...Object.values(SONG_TOURS).flat()]) {
    assert.ok(step.say.length <= LONGEST_LINE, `${step.say.length} characters: ${step.say}`);
    assert.ok(!(step.point && step.picture), 'a step points at something or holds up a picture, not both');
  }
});

test('each song tour is a lesson, played before its practice; everything taught can be marked seen', () => {
  for (const id of Object.keys(SONG_TOURS)) assert.ok(LESSONS[id], `${id} is not a lesson`);
  assert.ok(TAUGHT_IDS.includes(BOARD_TOUR_ID));
  for (const id of Object.keys(LESSONS)) assert.ok(TAUGHT_IDS.includes(id));
});
