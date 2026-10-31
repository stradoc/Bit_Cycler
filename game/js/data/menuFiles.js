// The main menu is the game's own disk: programs to run, folders to open and
// text files to read, listed the way each era's computer listed files: DOS's
// short capital names with a <DIR> column on the retro screens, a shell's
// lowercase names on the modern terminal. The idea comes from games whose
// menus are a computer's file system; every name and line here is our own.
/** Era 3 (64-bit) is a modern shell; the others list files like DOS. */
const isModern = (eraIndex) => eraIndex >= 3;
/** A file as the era names it: "CONTINUE.EXE" / "continue.exe"; a folder (no extension) "SAVES" / "saves/". */
export function fileName(name, ext, eraIndex) {
    if (isModern(eraIndex))
        return (ext ? `${name}.${ext}` : `${name}/`).toLowerCase();
    return ext ? `${name}.${ext}` : name;
}
/** One line of a folder's listing: the name, its type (or <DIR>) and a note, in columns. */
export function listingLine(name, ext, note, eraIndex) {
    if (isModern(eraIndex))
        return `${fileName(name, ext, eraIndex).padEnd(14)}${note}`;
    return `${name.padEnd(9)}${(ext || '<DIR>').padEnd(6)}${note}`;
}
/** Where a folder is: "A:", "C:\BITCYCLR\BRIEFS", "~/bit-cycler/briefs". */
export function folderPath(eraIndex, folders = []) {
    if (isModern(eraIndex))
        return ['~/bit-cycler', ...folders.map((f) => f.toLowerCase())].join('/');
    const root = eraIndex === 0 ? 'A:' : 'C:\\BITCYCLR';
    return [root, ...folders].join('\\');
}
/** A file's full path, for a screen's title: "C:\BITCYCLR\SETTINGS.CFG". */
export function filePath(eraIndex, folders, name, ext) {
    return `${folderPath(eraIndex, folders)}${isModern(eraIndex) ? '/' : '\\'}${fileName(name, ext, eraIndex)}`;
}
/** A command typed at the folder's prompt: "C:\BITCYCLR>DIR", "player@bit-cycler:~/bit-cycler$ ls". */
export function commandLine(eraIndex, folders, command) {
    const path = folderPath(eraIndex, folders);
    return isModern(eraIndex) ? `player@bit-cycler:${path}$ ${command}` : `${path}>${command}`;
}
/** The era's command for listing a folder. */
export function listCommand(eraIndex) {
    return isModern(eraIndex) ? 'ls' : 'DIR';
}
/** The era's command for printing a text file. */
export function readCommand(eraIndex, name, ext) {
    return `${isModern(eraIndex) ? 'cat' : 'TYPE'} ${fileName(name, ext, eraIndex)}`;
}
/** The count under a listing: "9 FILE(S)" / "total 9". */
export function listingFooter(eraIndex, files) {
    return isModern(eraIndex) ? `total ${files}` : `${String(files).padStart(8)} FILE(S)`;
}
/** Letters for the big titles, 5 x 5 pixels each ('#' lit). */
const BLOCK_LETTERS = {
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
export function banner(word) {
    const rows = [0, 1, 2, 3, 4].map((row) => [...word].map((letter) => BLOCK_LETTERS[letter]?.[row] ?? '.....').join('.'));
    const lines = [];
    for (let row = 0; row < rows.length; row += 2) {
        const top = rows[row];
        const bottom = rows[row + 1] ?? '';
        lines.push([...top].map((pixel, i) => (pixel === '#' ? (bottom[i] === '#' ? '█' : '▀') : bottom[i] === '#' ? '▄' : ' ')).join(''));
    }
    return lines;
}
/** README.TXT: how to play, a page at a time. */
export const README = {
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
            '  [Q]      QUIT THE SONG',
        ],
        [
            'THE SCORE',
            '  CPU TIME = INSTRUCTIONS x CPI x CLOCK PERIOD.',
            '  FEWER STALLS: LOWER CPI, A FASTER JOB.',
            "  BEAT THE CONTRACT'S DEADLINE FOR FULL PAY",
            '  (LATE PAYS HALF).',
            '',
            'TIPS',
            '  EACH NEW CPU PART COMES WITH A BRIEFING',
            '  AND A PRACTICE.',
            '  TOO FAST? TURN ON RELAXED MODE IN SETTINGS.CFG.',
        ],
    ],
};
/** CREDITS.TXT: who made what, and the licenses of what we didn't make. */
export const CREDITS = {
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
//# sourceMappingURL=menuFiles.js.map