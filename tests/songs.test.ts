import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileSong, parseChord, parseNote, SONGS, songFor, STEPS } from '../game/src/data/songs.ts';
import { generateProgram } from '../game/src/sim/generator.ts';
import { NEW_GAME } from '../game/src/sim/progress.ts';
import { songSetup } from '../game/src/song/setup.ts';

// The songs are data (data/songs.ts), so they're checked here without a browser:
// every one reads, keeps its parts in range, and gets played.

test('there are 12 songs, each with its own name, and every one compiles', () => {
  assert.equal(SONGS.length, 12);
  assert.equal(new Set(SONGS.map((song) => song.name)).size, SONGS.length);
  for (const song of SONGS) assert.doesNotThrow(() => compileSong(song), song.name);
});

test("every song's melody covers every bar, and each part stays in its range", () => {
  for (const song of SONGS) {
    assert.equal(song.lead.length, song.chords.length, `${song.name}: one melody bar for each chord`);
    for (const part of [song.bass, song.drums, song.arp]) assert.equal(song.chords.length % part.length, 0, `${song.name}: a part's bars must divide the song's`);
    const { bars } = compileSong(song);
    const range = (part: 'bass' | 'lead' | 'arp', low: number, high: number) => {
      for (const note of bars.flatMap((bar) => bar[part])) {
        assert.ok(note.midi >= low && note.midi <= high, `${song.name}: ${part} note ${note.midi} outside ${low}-${high}`);
        assert.ok(note.step + note.steps <= STEPS, `${song.name}: a ${part} note runs past its bar`);
      }
    };
    range('bass', parseNote('E2'), parseNote('E4'));
    range('lead', parseNote('E4'), parseNote('G6'));
    range('arp', parseNote('A3'), parseNote('C6'));
    // Something plays in every bar: the melody can rest, but the bass and the drums keep going.
    for (const bar of bars) assert.ok(bar.bass.length > 0 && bar.drums.length > 0, `${song.name}: a bar with no bass or drums`);
  }
});

test('chords and notes read the usual way', () => {
  assert.deepEqual(parseChord('Am'), { root: 9, tones: [0, 3, 7] });
  assert.deepEqual(parseChord('Bb'), { root: 10, tones: [0, 4, 7] });
  assert.deepEqual(parseChord('F#m7'), { root: 6, tones: [0, 3, 7, 10] });
  assert.equal(parseNote('C4'), 60);
  assert.equal(parseNote('A4'), 69);
  assert.equal(parseNote('Bb3'), 58);
  assert.throws(() => parseChord('H7'));
  assert.throws(() => compileSong({ ...SONGS[0], lead: ['C5 . .'] }));
});

test('each program always plays the same song, and contracts spread over all of them', () => {
  assert.equal(songFor('SUM ARRAY'), songFor('SUM ARRAY'));
  const played = new Set(Array.from({ length: 400 }, (_, seed) => songFor(generateProgram(seed * 7919).name)));
  assert.equal(played.size, SONGS.length);
  const setup = songSetup({ program: 'SUM ARRAY' }, NEW_GAME, new URLSearchParams());
  assert.equal(setup.song, songFor('SUM ARRAY'));
});
