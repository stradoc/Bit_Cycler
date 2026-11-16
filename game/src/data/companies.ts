// The five companies the board's jobs come from: computer companies of the
// period, made up, each only hinting at a real one (COBALT at "Big Blue",
// INNERCORE at the chip inside, REDSHIFT at the red rival, FLAGSHIP at a
// naval rank, WINGTIP at the batwing), never copying a name or a logo. Each
// has its name, a short name for tight spots (the board's list, the song's
// title), its logo as lines of plain ASCII (drawn in the era's font), and the
// kinds of job it sends, in its own words. Every kind in sim/generator.ts
// KERNELS belongs to exactly one (tests/companies.test.ts). A later company,
// or something about one (its own reputation, a trophy), is an entry or a
// field here. Kinds are written as plain strings: the generator imports this.

/** A job in a company's words: what it's called and what its items are ("TOTAL 48 CHIP ORDERS"). `verb` replaces the kernel's own (a function keeps its numbers). */
export type Wording = { readonly unit: string; readonly verb?: string | ((verb: string) => string) };

export type Company = {
  readonly id: string;
  readonly name: string;
  /** For the board's list and the song's title, where the whole name doesn't fit. */
  readonly short: string;
  /** Its logo, line by line: plain ASCII, at most 21 characters wide and 7 lines tall. */
  readonly logo: readonly string[];
  /** The kinds of job it sends (sim/generator.ts kinds), each in one or more ways of putting it. */
  readonly jobs: Readonly<Record<string, readonly Wording[]>>;
};

export const COMPANIES: readonly Company[] = [
  {
    id: 'cobalt',
    name: 'COBALT SYSTEMS',
    short: 'COBALT',
    logo: ['   /\\', '  /==\\', ' /====\\', '<= CS =>', ' \\====/', '  \\==/', '   \\/'],
    jobs: {
      SUM: [
        { verb: 'TOTAL', unit: 'CHIP ORDERS' },
        { verb: 'ADD UP', unit: 'INVOICES' },
      ],
      'RUNNING TOTAL': [{ verb: 'RUNNING BALANCES FOR', unit: 'PAYMENTS' }],
      OTHERS: [{ verb: 'ALL-BUT-ONE TOTALS OF', unit: 'BRANCH SALES' }],
    },
  },
  {
    id: 'innercore',
    name: 'INNERCORE',
    short: 'INNERCORE',
    logo: ['  .~~~~~~~~~~~~~~.', '(    innercore    `', " `~~~~~~~~~~~~~~'"],
    jobs: {
      CHECKSUM: [
        { verb: 'VERIFY', unit: 'FIRMWARE BYTES' },
        { verb: 'CHECKSUM', unit: 'MICROCODE BYTES' },
      ],
      COUNT: [{ unit: 'CHIP TEST RESULTS' }],
      'CHECKED COPY': [{ verb: 'COPY AND VERIFY', unit: 'MICROCODE BYTES' }],
    },
  },
  {
    id: 'redshift',
    name: 'REDSHIFT MICRO',
    short: 'REDSHIFT',
    logo: ['      .  *  .', '- - -=( RS )=', "      '  *  '"],
    jobs: {
      DOUBLE: [{ verb: 'BRIGHTEN (x2)', unit: 'PIXELS' }],
      REVERSE: [{ verb: 'MIRROR', unit: 'FRAME PIXELS' }],
      REPLACE: [{ unit: 'TEXTURE BYTES' }],
    },
  },
  {
    id: 'flagship',
    name: 'FLAGSHIP COMPUTERS',
    short: 'FLAGSHIP',
    logo: ['   (_)', ' ---+---', '    |', '\\   |   /', ' \\__|__/'],
    jobs: {
      COPY: [{ verb: 'COPY', unit: 'GAME DISK BYTES' }],
      FILL: [{ unit: 'SCREEN BYTES' }],
      'ADD ARRAYS': [{ verb: 'MIX PAIRS OF', unit: 'SOUND SAMPLES' }],
    },
  },
  {
    id: 'wingtip',
    name: 'WINGTIP SEMICONDUCTOR',
    short: 'WINGTIP',
    logo: ['__    .-------.    __', '\\ \\___| [:::] |___/ /', ' \\____|_______|____/'],
    jobs: {
      CHANGES: [{ verb: 'CHANGES BETWEEN', unit: 'SIGNAL READINGS' }],
      'GRID SUM': [{ verb: (verb) => verb.replace('GRIDS', 'SENSOR BOARDS'), unit: 'CELLS' }],
      FIND: [{ unit: 'RADIO CHANNELS' }],
    },
  },
];

/** The company a program's client is, by name; none for a job of its own (the tutorial's bakery). */
export function companyOf(client: string | undefined): Company | undefined {
  return COMPANIES.find((company) => company.name === client);
}

/** A client's name where space is tight: a company's short name, or the client's own (the tutorial's bakery). */
export function shortClient(client: string | undefined): string | undefined {
  return companyOf(client)?.short ?? client;
}

/**
 * SMALLWARE: the player's employer, a small start-up running jobs for the
 * five companies, as early Microsoft did for the hardware makers. Made up;
 * its logo is a door (a window becomes a door), with no text. The player's
 * computer is one of its terminals, so `host` names it (the window bar, the
 * boot's and the main menu's prompts). `signature` signs its founder's emails.
 */
export const SMALLWARE = {
  name: 'SMALLWARE',
  host: 'smallware',
  signature: '- Jo Kessler, founder',
  logo: ['.--------.', '| .----. |', '| |    | |', "| '----' |", '| .----.o|', '| |    | |', "| '----' |", "'--------'"],
} as const;
