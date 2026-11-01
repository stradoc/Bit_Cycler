// The songs a contract can play, all in the 8-bit chiptune style for now
// (each era's own style is planned: CHANGELOG.md, 2026-11-01). A song is
// written like a tracker's pattern: a chord for each bar, and each part's
// bars as 16 steps (sixteenth notes), so four steps make one beat, and one
// beat is one clock cycle. The tempo isn't the song's: it follows the clock
// (rhythm/tempo.ts). Parts:
//   bass, arp: chord tones by number (1 the root, 2 the next tone up, 3, 4...;
//              past the chord's last tone, its tones an octave up), ' an
//              octave higher, , an octave lower
//   lead:      note names (C5, F#4, Bb5)
//   drums:     k kick, s snare, h closed hi-hat, o open hi-hat; several at once ("kh")
//   every part: . a rest, - holds the note before it (within the bar)
// A part with fewer bars than the song repeats them. audio/music.ts plays
// the compiled song (compileSong), adding parts as the pipeline fills.
/** Steps in a bar: sixteenth notes in four beats. */
export const STEPS = 16;
export const SONGS = [
    {
        // The game's own theme: the chords the song has always had (Am F C G).
        name: 'POWER ON',
        chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'],
        bass: ["1 . 1' . 1 . 1' . 1 . 1' . 1 . 3 2"],
        drums: ['kh . h . sh . h . kh . h k sh . h h'],
        fill: 'kh . h . sh . h . kh . s s s . s s',
        arp: ['1 2 3 4 3 2 1 2 3 4 3 2 1 2 3 2'],
        lead: [
            'E5 - - . E5 . D5 . C5 - - . A4 . C5 .',
            'C5 - - . A4 . F4 . A4 - - . C5 . D5 .',
            'E5 - - . G5 . E5 . D5 - - . C5 . D5 .',
            'D5 - - - - - B4 . G4 - - - . . . .',
            'E5 - - . E5 . G5 . A5 - - . G5 . E5 .',
            'F5 - - . E5 . C5 . A4 - - . C5 . F5 .',
            'E5 - - . D5 . C5 . G5 - - . E5 . C5 .',
            'D5 - - - B4 - - - G4 - - - B4 . D5 .',
        ],
        sound: { lead: 'square', arp: 'pulse25', bass: 'triangle', vibrato: 12 },
    },
    {
        name: 'SUNNY BYTES',
        chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F'],
        bass: ['1 . . 1 . . 1 . 3 . . 3 . . 2 .'],
        drums: ['kh . h . sh . h k h k h . sh . h .'],
        fill: 'kh . h . sh . h k s . s . s s s s',
        arp: ['1 3 2 3 1 3 2 3 1 3 2 3 1 3 2 3'],
        lead: [
            'C5 . E5 . G5 - - . E5 . G5 . C6 - - .',
            'B5 - - . G5 . D5 . G5 - - . . . . .',
            'A5 . G5 . E5 - - . C5 . E5 . A5 - - .',
            'G5 - - . F5 . E5 . F5 - - - . . . .',
            'C5 . E5 . G5 - - . E5 . G5 . C6 - - .',
            'D6 - - . B5 . G5 . B5 - - . A5 . G5 .',
            'A5 - - . C6 . A5 . G5 . E5 . F5 . G5 .',
            'F5 - - . E5 . D5 . C5 - - - - - . .',
        ],
        sound: { lead: 'pulse12', arp: 'pulse25', bass: 'triangle', vibrato: 8 },
    },
    {
        name: 'DEEP DUNGEON',
        chords: ['Dm', 'Bb', 'C', 'A', 'Dm', 'Bb', 'Gm', 'A'],
        bass: ['1 . 1 1 1 . 1 1 1 . 1 1 1 . 1 1'],
        drums: ['k . h . s . h . k . k h s . h .'],
        fill: 'k . h . s . h . k . s . s s s s',
        arp: ['1 2 3 2 1 2 3 2 1 2 3 2 1 2 3 2'],
        lead: [
            'D5 - - - - - F5 - E5 - D5 - A4 - - -',
            'Bb4 - - - D5 - - - F5 - - - D5 - C5 -',
            'E5 - - - - - G5 - F5 - E5 - C5 - - -',
            'C#5 - - - - - - - A4 - - - . . . .',
            'D5 - F5 - A5 - - - G5 - F5 - E5 - D5 -',
            'F5 - - - D5 - Bb4 - D5 - F5 - Bb5 - - -',
            'G5 - - - F5 - D5 - Bb4 - - - D5 - - -',
            'C#5 - - - E5 - - - A5 - - - - - - -',
        ],
        sound: { lead: 'pulse25', arp: 'pulse12', bass: 'triangle', vibrato: 18 },
    },
    {
        name: 'FUNKY FORWARD',
        chords: ['Em7', 'A7', 'Em7', 'A7', 'Cmaj7', 'D', 'Em7', 'B7'],
        bass: ["1 . . 1' . . 1 . . 1 . 1' . 4 3 ."],
        drums: ['kh . h . sh . h k . h k . sh . h h'],
        fill: 'kh . h . sh . h k . s k s s . s s',
        arp: ['1 4 3 4 2 4 3 4 1 4 3 4 2 4 3 4'],
        lead: [
            '. . E5 . G5 . . A5 . B5 . . A5 . G5 .',
            'E5 - . . . . C#5 . D5 . E5 . . . . .',
            '. . E5 . G5 . . A5 . B5 . . D6 . B5 .',
            'A5 - . G5 . E5 . . G5 - - . . . . .',
            '. . G5 . B5 . . C6 . B5 . G5 . E5 . .',
            'F#5 - . . A5 . . F#5 . D5 . . E5 . F#5 .',
            'G5 . . E5 . . B4 . D5 - E5 . G5 . A5 .',
            'B5 - - . A5 . F#5 . D#5 - - - . . . .',
        ],
        sound: { lead: 'square', arp: 'pulse12', bass: 'pulse25' },
    },
    {
        name: 'TURBO LOOP',
        chords: ['F#m', 'D', 'A', 'E', 'F#m', 'D', 'A', 'E'],
        bass: ["1 . 1 1 1' . 1 1 1 . 1 1 1' . 2 3"],
        drums: ['kh h sh h kh h sh h kh h sh h kh h sh sh'],
        fill: 'kh h sh h kh h sh h s s s s s s s s',
        arp: ["1 3 4 3 1 3 4 3 1 3 4 3 1 3 4 3"],
        lead: [
            'F#5 G#5 A5 C#6 A5 G#5 F#5 C#5 F#5 G#5 A5 C#6 E6 C#6 A5 G#5',
            'F#5 E5 D5 A4 D5 E5 F#5 A5 F#5 E5 D5 A4 F#5 - - .',
            'E5 F#5 A5 C#6 E6 C#6 A5 E5 C#5 E5 A5 C#6 A5 E5 C#5 A4',
            'B4 - - . E5 - - . G#5 - - . B5 - - .',
            'F#5 A5 C#6 F#6 C#6 A5 F#5 A5 C#6 A5 F#5 C#5 F#5 - - .',
            'D5 F#5 A5 D6 A5 F#5 D5 F#5 A5 D6 F#6 D6 A5 - - .',
            'C#6 B5 A5 E5 C#6 B5 A5 E5 A5 B5 C#6 E6 C#6 - B5 -',
            'G#5 - - - B5 - - - E6 - - - . . . .',
        ],
        sound: { lead: 'pulse25', arp: 'pulse12', bass: 'triangle' },
    },
    {
        name: 'SOFT RESET',
        chords: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7', 'Fmaj7', 'Em7', 'Dm7', 'Cmaj7'],
        bass: ['1 - - - . . 3 . 4 - - - 3 . 2 .'],
        drums: ['k . h h s . h . . h k h s . h h'],
        fill: 'k . h h s . h . k . h . s . s .',
        arp: ["1 . 3 . 4 . 2' . 1 . 3 . 4 . 2' ."],
        lead: [
            'A5 - - - G5 - E5 - C5 - - - - - . .',
            'B4 - - - D5 - E5 - G5 - - - - - . .',
            'F5 - - - E5 - D5 - A4 - - - C5 - D5 -',
            'E5 - - - - - - - . . . . . . . .',
            'C6 - - - A5 - G5 - E5 - - - F5 - G5 -',
            'G5 - - - E5 - D5 - B4 - - - D5 - E5 -',
            'F5 - E5 - D5 - C5 - A4 - - - G4 - A4 -',
            'B4 - - - C5 - - - - - - - . . . .',
        ],
        sound: { lead: 'triangle', arp: 'pulse12', bass: 'triangle', vibrato: 10, echo: true },
    },
    {
        name: 'BOSS FIGHT',
        chords: ['Cm', 'Ab', 'Bb', 'G', 'Cm', 'Ab', 'Bb', 'G'],
        bass: ["1 1 1' 1 1 1 1' 1 1 1 1' 1 1 1' 3 3"],
        drums: ['kh h kh h sh h kh h kh h kh h sh h sh sh'],
        fill: 'kh h kh h sh h kh h s s s s s s s s',
        arp: ["1 2 3 1' 1 2 3 1' 1 2 3 1' 1 2 3 1'"],
        lead: [
            'C5 - C5 - Eb5 - G5 - C6 - - - Bb5 - G5 -',
            'Ab5 - - - G5 - Eb5 - C5 - - - Eb5 - - -',
            'D5 - F5 - Bb5 - D6 - C6 - Bb5 - F5 - D5 -',
            'B4 - - - D5 - - - G5 - F5 - D5 - B4 -',
            'G5 - G5 - G5 - Ab5 - G5 - F5 - Eb5 - D5 -',
            'Eb5 - - - C5 - Ab4 - C5 - Eb5 - Ab5 - - -',
            'F5 - Bb5 - F5 - D5 - Bb4 - D5 - F5 - - -',
            'G5 - - - F5 - - - D5 - - - B4 - - -',
        ],
        sound: { lead: 'pulse25', arp: 'square', bass: 'triangle', vibrato: 15 },
    },
    {
        name: 'JAZZ CACHE',
        chords: ['Dm7', 'G7', 'Cmaj7', 'A7', 'Dm7', 'G7', 'Cmaj7', 'A7'],
        bass: ['1 - - - 2 - - - 3 - - - 4 - - -'],
        drums: ['kh . . h sh . h . kh . . h sh . h h'],
        fill: 'kh . . h sh . h . k . s . s s s .',
        arp: ['1 . . . 2 3 4 . . . . . 2 3 4 .'],
        lead: [
            'F5 - - A5 - - C6 - A5 - - F5 - . E5 .',
            'D5 - - . F5 . B5 . A5 - G5 - F5 . . .',
            'E5 - - - G5 - B5 - - - C6 - B5 . G5 .',
            'A5 - - . G5 . E5 . C#5 - - . . . . .',
            'A5 . G5 . F5 . E5 . D5 - - F5 - - A5 -',
            'B5 - - . A5 . F5 . D5 - - . B4 . D5 .',
            'C6 - B5 - G5 - E5 - D5 - E5 - G5 - - -',
            'C#6 - - - A5 - - - G5 - E5 - C#5 - - -',
        ],
        sound: { lead: 'square', arp: 'pulse25', bass: 'triangle', vibrato: 14 },
    },
    {
        name: 'HERO MARCH',
        chords: ['Bb', 'F', 'Gm', 'Eb', 'Bb', 'F', 'Eb', 'F'],
        bass: ['1 . . . 3 . . . 1 . . . 3 . 2 .'],
        drums: ['k . s s k . sh . k . s s k h sh sh'],
        fill: 'k . s s k . s s s s s s s s s s',
        arp: ['1 3 2 3 1 3 2 3 1 3 2 3 1 3 2 3'],
        lead: [
            'Bb4 - - D5 F5 - - - Bb5 - - - F5 - D5 -',
            'C5 - - F5 A5 - - - C6 - - - A5 - - -',
            'Bb5 - - A5 G5 - - - D5 - - - G5 - Bb5 -',
            'G5 - - - F5 - Eb5 - Bb4 - - - - - . .',
            'D6 - - C6 Bb5 - - - F5 - - - D5 - F5 -',
            'A5 - - G5 F5 - - - C5 - - - F5 - A5 -',
            'G5 - - F5 Eb5 - - - Bb4 - Eb5 - G5 - Bb5 -',
            'A5 - - - C6 - - - A5 - - - F5 - - -',
        ],
        sound: { lead: 'pulse25', arp: 'pulse12', bass: 'triangle', vibrato: 10 },
    },
    {
        name: 'SIGNAL LOST',
        chords: ['Em', 'F', 'Em', 'D', 'Em', 'F', 'G', 'F'],
        bass: ['1 . . 1 . . 1 . . . 1 . . 2 . .'],
        drums: ['k . . . . . h . . . k . s . . .'],
        fill: 'k . . . . . h . k . s . s . s s',
        arp: ['1 . 2 . 3 . 2 . 1 . 2 . 3 . 4 .'],
        lead: [
            'B4 - - - . . E5 - F5 - - - E5 - - -',
            'A4 - - - . . C5 - B4 - - - A4 - - -',
            'G4 - - - B4 - E5 - G5 - - - F5 - E5 -',
            'F#5 - - - - - - - D5 - - - . . . .',
            'E5 - - - G5 - - - B5 - - - A5 - G5 -',
            'F5 - - - A5 - - - C6 - - - B5 - A5 -',
            'G5 - - - F5 - - - D5 - - - B4 - - -',
            'C5 - - - A4 - - - - - - - . . . .',
        ],
        sound: { lead: 'pulse12', arp: 'triangle', bass: 'pulse25', vibrato: 20, echo: true },
    },
    {
        name: 'VICTORY LAP',
        chords: ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A'],
        bass: ["1 . 3 . 1' . 3 . 1 . 3 . 1' . 2 ."],
        drums: ['kh . h k sh . h . kh . h k sh . sh h'],
        fill: 'kh . h k sh . h . s s s . s s s s',
        arp: ["1 2 3 4 2 3 4 2' 1 2 3 4 2 3 4 2'"],
        lead: [
            'F#5 - A5 - D6 - - - A5 - F#5 - A5 - D6 -',
            'E6 - - - C#6 - A5 - E5 - - - A5 - C#6 -',
            'D6 - - - B5 - F#5 - D5 - - - F#5 - B5 -',
            'B5 - - - A5 - G5 - D5 - - - . . . .',
            'A5 . A5 . D6 - - - F#5 . F#5 . A5 - - -',
            'E5 . E5 . A5 - - - C#6 - B5 - A5 - E5 -',
            'D6 - - - B5 - G5 - E6 - - - D6 - B5 -',
            'C#6 - - - E6 - - - A5 - - - . . . .',
        ],
        sound: { lead: 'pulse25', arp: 'pulse12', bass: 'triangle', vibrato: 8 },
    },
    {
        name: 'OVERCLOCKED',
        chords: ['Em', 'C', 'G', 'D', 'Em', 'C', 'G', 'D'],
        bass: ['1 1 . 1 1 1 . 1 1 1 . 1 1 1 2 1'],
        drums: ['kh h kh h sh h h h kh h kh kh sh h sh h'],
        fill: 'kh h kh h sh h h h s s s s kh kh s s',
        arp: ["1 2 1' 2 1 2 1' 2 1 2 1' 2 1 2 1' 2"],
        lead: [
            'E5 - G5 - B5 - G5 - E5 - G5 - A5 - B5 -',
            'C6 - B5 - G5 - E5 - C5 - E5 - G5 - - -',
            'D6 - B5 - G5 - D5 - B4 - D5 - G5 - B5 -',
            'A5 - - - F#5 - - - D5 - - - F#5 - A5 -',
            'B5 - - - - - E6 - D6 - B5 - A5 - G5 -',
            'E6 - - - D6 - C6 - B5 - G5 - E5 - - -',
            'G5 - A5 - B5 - D6 - B5 - A5 - G5 - D5 -',
            'F#5 - - - A5 - - - D6 - - - - - - -',
        ],
        sound: { lead: 'square', arp: 'pulse25', bass: 'pulse25', vibrato: 16 },
    },
];
const PITCH_CLASSES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** A chord's qualities: its tones in semitones above the root. */
const QUALITIES = {
    '': [0, 4, 7],
    m: [0, 3, 7],
    '7': [0, 4, 7, 10],
    m7: [0, 3, 7, 10],
    maj7: [0, 4, 7, 11],
    sus4: [0, 5, 7],
    sus2: [0, 2, 7],
    dim: [0, 3, 6],
    aug: [0, 4, 8],
};
/** A chord's root (pitch class, 0 = C) and tones in semitones above it, or throws on a name it can't read. */
export function parseChord(name) {
    const match = /^([A-G])([#b]?)(.*)$/.exec(name);
    const tones = match ? QUALITIES[match[3]] : undefined;
    if (!match || !tones)
        throw new Error(`Not a chord: ${name}`);
    const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
    return { root: (PITCH_CLASSES[match[1]] + accidental + 12) % 12, tones };
}
/** A note name's MIDI number (C4 = 60), or throws on one it can't read. */
export function parseNote(name) {
    const match = /^([A-G])([#b]?)(-?\d)$/.exec(name);
    if (!match)
        throw new Error(`Not a note: ${name}`);
    const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
    return 12 * (Number(match[3]) + 1) + PITCH_CLASSES[match[1]] + accidental;
}
/** Where each part's chord-tone 1 sits: the bass's root between E2 and D#3, the arpeggio's between A3 and G#4. */
export const BASS_LOW = 40;
export const ARP_LOW = 57;
/** The MIDI number of `chord`'s tone `index` (0 the root; past its last tone, an octave up), with its root in the octave from `low`. */
export function toneOf(chord, index, low) {
    const base = low + ((chord.root - low) % 12 + 12) % 12;
    return base + chord.tones[index % chord.tones.length] + 12 * Math.floor(index / chord.tones.length);
}
/** Chord tone `token` ("1", "3'", "2,") of `chord`, with its root in the octave from `low`. */
function chordTone(token, chord, low) {
    const match = /^([1-9])('*)(,*)$/.exec(token);
    if (!match)
        throw new Error(`Not a chord tone: ${token}`);
    return toneOf(chord, Number(match[1]) - 1, low) + 12 * (match[2].length - match[3].length);
}
/** A bar's 16 tokens as notes: each note lasts until the next token that isn't a hold (-). */
function notes(bar, pitch) {
    const tokens = bar.trim().split(/\s+/);
    if (tokens.length !== STEPS)
        throw new Error(`A bar needs ${STEPS} steps, not ${tokens.length}: ${bar}`);
    const out = [];
    tokens.forEach((token, step) => {
        if (token === '.' || token === '-')
            return;
        let steps = 1;
        while (tokens[step + steps] === '-')
            steps++;
        out.push({ step, midi: pitch(token), steps });
    });
    return out;
}
function hits(bar) {
    const tokens = bar.trim().split(/\s+/);
    if (tokens.length !== STEPS)
        throw new Error(`A drum bar needs ${STEPS} steps, not ${tokens.length}: ${bar}`);
    return tokens.flatMap((token, step) => {
        if (token === '.')
            return [];
        return [...token].map((drum) => {
            if (drum !== 'k' && drum !== 's' && drum !== 'h' && drum !== 'o')
                throw new Error(`Not a drum: ${drum}`);
            return { step, drum };
        });
    });
}
/** A song's bars, ready to play (throws on anything it can't read, which the tests check for every song). */
export function compileSong(song) {
    const bars = song.chords.map((name, i) => {
        const chord = parseChord(name);
        const part = (lines) => lines[i % lines.length];
        const last = i === song.chords.length - 1;
        return {
            chord,
            bass: notes(part(song.bass), (t) => chordTone(t, chord, BASS_LOW)),
            lead: notes(part(song.lead), parseNote),
            arp: notes(part(song.arp), (t) => chordTone(t, chord, ARP_LOW)),
            drums: hits(last && song.fill ? song.fill : part(song.drums)),
        };
    });
    return { song, bars };
}
/** The song a program plays: picked by its name, so a job always sounds the same and different jobs differ. */
export function songFor(program) {
    // FNV-1a: a quick, even spread of names over the songs.
    let hash = 2166136261;
    for (const char of program)
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return SONGS[hash % SONGS.length];
}
//# sourceMappingURL=songs.js.map