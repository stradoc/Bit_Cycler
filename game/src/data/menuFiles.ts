// The main menu is the game's own disk: programs to run, folders to open and
// text files to read, listed the way each era's computer listed files: DOS's
// short capital names with a <DIR> column on the retro screens, a shell's
// lowercase names on the modern terminal. The idea comes from games whose
// menus are a computer's file system; every name and line here is our own.
// How names and paths look comes from the era's computer (ui/eras.ts).

import type { Era } from '../ui/eras.ts';

/** A file as the era names it: "CONTINUE.EXE" / "continue.exe"; a folder (no extension) "SAVES" / "saves/". */
export function fileName(name: string, ext: string, era: Era): string {
  if (era.computer.shell) return (ext ? `${name}.${ext}` : `${name}/`).toLowerCase();
  return ext ? `${name}.${ext}` : name;
}

/** One line of a folder's listing: the name, its type (or <DIR>) and a note, in columns. */
export function listingLine(name: string, ext: string, note: string, era: Era): string {
  if (era.computer.shell) return `${fileName(name, ext, era).padEnd(14)}${note}`;
  return `${name.padEnd(9)}${(ext || '<DIR>').padEnd(6)}${note}`;
}

/** Where a folder is: "A:", "C:\BITCYCLR\BRIEFS", "~/bit-cycler/briefs". */
export function folderPath(era: Era, folders: readonly string[] = []): string {
  if (era.computer.shell) return [era.computer.root, ...folders.map((f) => f.toLowerCase())].join('/');
  return [era.computer.root, ...folders].join('\\');
}

/** A file's full path, for a screen's title: "C:\BITCYCLR\SETTINGS.CFG". */
export function filePath(era: Era, folders: readonly string[], name: string, ext: string): string {
  return `${folderPath(era, folders)}${era.computer.shell ? '/' : '\\'}${fileName(name, ext, era)}`;
}

/** A command typed at the folder's prompt: "C:\BITCYCLR>DIR", "player@bit-cycler:~/bit-cycler$ ls". */
export function commandLine(era: Era, folders: readonly string[], command: string): string {
  const path = folderPath(era, folders);
  return era.computer.shell ? `player@bit-cycler:${path}$ ${command}` : `${path}>${command}`;
}

/** The era's command for listing a folder. */
export function listCommand(era: Era): string {
  return era.computer.shell ? 'ls' : 'DIR';
}

/** The era's command for printing a text file. */
export function readCommand(era: Era, name: string, ext: string): string {
  return `${era.computer.shell ? 'cat' : 'TYPE'} ${fileName(name, ext, era)}`;
}

/** The count under a listing: "9 FILE(S)" / "total 9". */
export function listingFooter(era: Era, files: number): string {
  return era.computer.shell ? `total ${files}` : `${String(files).padStart(8)} FILE(S)`;
}

/** A text file in the menu: its name for the big title, and its pages. */
export type TextFile = { readonly title: string; readonly pages: readonly (readonly string[])[] };

/** Letters for the big titles, 5 x 5 pixels each ('#' lit). */
const BLOCK_LETTERS: Readonly<Record<string, readonly string[]>> = {
  A: ['.###.', '#...#', '#####', '#...#', '#...#'],
  B: ['####.', '#...#', '####.', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '####.', '#....', '#####'],
  I: ['#####', '..#..', '..#..', '..#..', '#####'],
  L: ['#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  R: ['####.', '#...#', '####.', '#..#.', '#...#'],
  S: ['.####', '#....', '.###.', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
};

/**
 * A word in big block letters, two pixel rows to a line of text with the
 * half-block characters (▀ top, ▄ bottom, █ both), as old PC screens drew
 * big titles. Three lines tall.
 */
export function banner(word: string): string[] {
  const rows = [0, 1, 2, 3, 4].map((row) => [...word].map((letter) => BLOCK_LETTERS[letter]?.[row] ?? '.....').join('.'));
  const lines: string[] = [];
  for (let row = 0; row < rows.length; row += 2) {
    const top = rows[row];
    const bottom = rows[row + 1] ?? '';
    lines.push([...top].map((pixel, i) => (pixel === '#' ? (bottom[i] === '#' ? '█' : '▀') : bottom[i] === '#' ? '▄' : ' ')).join(''));
  }
  return lines;
}

/** README.TXT: how to play, a page at a time. */
export const README: TextFile = {
  title: 'README',
  pages: [
    [
      'WELCOME TO BIT CYCLER!',
      'EVERY BEAT OF THE MUSIC IS ONE CLOCK CYCLE.',
      '',
      'YOU RUN A CHIP COMPANY:',
      '  1. TAKE A CONTRACT FROM THE BOARD.',
      '  2. PLAY ITS PROGRAM AS A SONG.',
      '  3. GET PAID, AND UPGRADE YOUR CPU IN THE SHOP.',
      '',
      'A MISS NEVER ENDS THE SONG: THE CPU JUST',
      'LOSES A CYCLE.',
    ],
    [
      'THE KEYS',
      '  [D]      ALU: ADD, SUB, AND, OR, XOR, ADDI',
      '  [F]      MEMORY: LB, SB',
      '  [J]      BRANCH: BEQ, BNE (GUESSING: NOT TAKEN)',
      '  [K]      BRANCH, GUESS TAKEN',
      '  [SPACE]  STALL: WAIT FOR A VALUE',
      "           THAT ISN'T READY YET",
      '  [G] [H]  CLOCK DOWN / UP',
      '  [ESC]    PAUSE MENU (OR [Q])',
    ],
    [
      'THE SCORE',
      '  CPU TIME = INSTRUCTIONS x CPI x CLOCK PERIOD.',
      '  FEWER STALLS: LOWER CPI, A FASTER JOB.',
      "  BEAT THE CONTRACT'S DEADLINE FOR FULL PAY",
      '  (LATE PAYS HALF).',
      '',
      'TIPS',
      '  TICK TEACHES EACH NEW CPU PART, THEN A',
      '  PRACTICE. EVERY LESSON IS IN BRIEFS.',
      '  TOO FAST? TURN ON RELAXED MODE IN SETTINGS.CFG.',
    ],
  ],
};

/** CREDITS.TXT: who made what, and the licenses of what we didn't make. */
export const CREDITS: TextFile = {
  title: 'CREDITS',
  pages: [
    [
      'BIT CYCLER',
      'MADE FOR CSC 3501, COMPUTER ORGANIZATION,',
      'FALL 2026.',
      '',
      'SOUND AND MUSIC',
      '  MADE IN CODE WITH THE WEB AUDIO API, BUT THE',
      '  KEYS: A CHERRY MX BLUE KEYBOARD RECORDED BY',
      '  SAMSTERBIRDIES (FREESOUND 489424), CC0.',
    ],
    [
      'ENGINE',
      '  PHASER 3.90 (MIT LICENSE).',
      '',
      'FONTS',
      '  JETBRAINS MONO (64-BIT ERA)',
      '    THE JETBRAINS MONO PROJECT AUTHORS,',
      '    SIL OPEN FONT LICENSE 1.1.',
    ],
    [
      'FONTS',
      '  IBM BIOS, IBM VGA 9x16, IBM XGA',
      '  (8, 16 AND 32-BIT ERAS)',
      '    THE ULTIMATE OLDSCHOOL PC FONT PACK BY VILER',
      '    (INT10H.ORG), CC BY-SA 4.0, USED UNMODIFIED.',
    ],
  ],
};
