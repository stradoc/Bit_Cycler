import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS } from '../game/src/data/lessons.ts';
import { ERAS } from '../game/src/ui/eras.ts';
import { banner, commandLine, CREDITS, fileName, filePath, folderPath, listCommand, listingLine, readCommand, README } from '../game/src/data/menuFiles.ts';

test('files and folders are named the way each era listed them', () => {
  assert.equal(fileName('CONTINUE', 'EXE', ERAS[1]), 'CONTINUE.EXE');
  assert.equal(fileName('CONTINUE', 'EXE', ERAS[3]), 'continue.exe');
  assert.equal(fileName('SAVES', '', ERAS[3]), 'saves/');
  assert.equal(folderPath(ERAS[0]), 'A:');
  assert.equal(folderPath(ERAS[1], ['BRIEFS']), 'C:\\BITCYCLR\\BRIEFS');
  assert.equal(folderPath(ERAS[3], ['BRIEFS']), '~/bit-cycler/briefs');
  assert.equal(filePath(ERAS[2], [], 'SETTINGS', 'CFG'), 'C:\\BITCYCLR\\SETTINGS.CFG');
  assert.equal(commandLine(ERAS[1], [], listCommand(ERAS[1])), 'C:\\BITCYCLR>DIR');
  assert.equal(commandLine(ERAS[3], [], listCommand(ERAS[3])), 'player@bit-cycler:~/bit-cycler$ ls');
  assert.equal(readCommand(ERAS[0], 'README', 'TXT'), 'TYPE README.TXT');
  assert.equal(readCommand(ERAS[3], 'README', 'TXT'), 'cat readme.txt');
});

test('listing lines keep their columns, and every briefing fits as a file', () => {
  for (const era of ERAS) {
    const a = listingLine('CONTINUE', 'EXE', '%', era);
    const b = listingLine('SAVES', '', '%', era);
    assert.equal(a.indexOf('%'), b.indexOf('%'), `${era.name}: notes line up`);
    for (const lesson of Object.values(LESSONS)) {
      const note = lesson.title.replace(/^LESSON \d+: /, '').slice(0, 26);
      assert.ok(listingLine(lesson.id.toUpperCase().slice(0, 8), 'TXT', note, era).length <= 42, lesson.id);
    }
  }
});

test('README and CREDITS fit the viewer, a page at a time, under a title in block letters', () => {
  for (const file of [README, CREDITS]) {
    const title = banner(file.title);
    assert.equal(title.length, 3);
    assert.ok(title.every((line) => line.length <= 44 && line.trim().length > 0), file.title);
    assert.ok(!title.join('').includes('.'), `${file.title}: every letter has a block shape`);
    for (const page of file.pages) {
      assert.ok(page.length <= 10, `${file.title}: a page has ${page.length} lines`);
      for (const line of page) assert.ok(line.length <= 52, `"${line}" is ${line.length} characters`);
    }
  }
});

test('block letters: two pixel rows to a line, with half blocks', () => {
  // T is a full top row, then its stem: top half lit across, then full blocks down the middle.
  assert.deepEqual(banner('T'), ['▀▀█▀▀', '  █  ', '  ▀  ']);
});
