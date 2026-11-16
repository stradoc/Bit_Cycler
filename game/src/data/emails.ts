// The inbox's emails (scenes/InboxScene.ts): every one as data, with the rule
// for when it arrives (sim/mail.ts delivers it, once). Smallware's founder
// writes the welcome and the orientation on a new game's first day, and a
// note at each reputation level; each company writes after 1, 5 and 15 jobs
// done for it, in its own voice. A new email is an entry here; a new kind of
// rule is a case in deliverMail. Later rewards or bills are a new field.

import { COMPANIES, SMALLWARE } from './companies.ts';
import { REPUTATION } from './economy.ts';

/** When an email arrives: at the start of a game, once you've done `count` jobs for a company, or on reaching a reputation level. */
export type MailRule = { readonly kind: 'start' } | { readonly kind: 'jobs'; readonly company: string; readonly count: number } | { readonly kind: 'level'; readonly level: string };

export type Email = {
  readonly id: string;
  readonly from: string;
  /** At most 26 characters, the inbox's list column. */
  readonly subject: string;
  /** Paragraphs ('' for a blank line), word-wrapped by the inbox: at most 16 lines at 46 characters. */
  readonly body: readonly string[];
  readonly when: MailRule;
};

const JO = SMALLWARE.signature;

/** What each company says after 1, 5 and 15 jobs for it: its subject and words, and who signs. */
const THANKS: Readonly<Record<string, { readonly sign: string; readonly notes: readonly (readonly [string, readonly string[]])[] }>> = {
  cobalt: {
    sign: '- Purchasing, Cobalt Systems',
    notes: [
      ['A FIRST ORDER, FILLED', ['Dear Smallware,', '', 'Thank you for completing our first order in full. Cobalt Systems values a dependable supplier, and we will keep you in mind.']],
      ['FIVE ORDERS AND COUNTING', ['Dear Smallware,', '', 'Five jobs now, every total correct. Our accountants have stopped checking your sums twice. Here, that is high praise.']],
      ['A PREFERRED SUPPLIER', ['Dear Smallware,', '', 'Fifteen jobs. Cobalt Systems has added Smallware to its list of preferred suppliers. Please continue exactly as you are.']],
    ],
  },
  innercore: {
    sign: '- The test lab, InnerCore',
    notes: [
      ['CHECKSUMS VERIFIED', ['Your first job for us passed every check. No flipped bits, no excuses. The test lab approves.']],
      ['THE LAB IS IMPRESSED', ['Five jobs, zero faulty results. Our engineers have started reading your output for fun. We are not sure that is healthy.']],
      ['ONE OF US', ['Fifteen jobs. The lab has a nickname for you now, and it is a nice one. We would tell you, but it stays inside the core.']],
    ],
  },
  redshift: {
    sign: '- Redshift Micro',
    notes: [
      ['FAST WORK!', ['Your first job for us is in. We like that! At Redshift we are always racing somebody bigger, so it is good to have new friends.']],
      ['FIVE FOR FIVE', ['Five jobs, and our pixels have never looked brighter. Do not tell Cobalt, but you are our favorite.']],
      ['FULL SPEED AHEAD', ['Fifteen jobs! Whenever a deadline looks impossible, someone here says "send it to Smallware". Keep that clock running hot.']],
    ],
  },
  flagship: {
    sign: '- The crew at Flagship Computers',
    notes: [
      ['AHOY, SMALLWARE', ['Ahoy! Your first job has reached port. Every home computer we ship needs software like yours.']],
      ['SMOOTH SAILING', ['Five jobs and not one leak. The games on our next machine will load faster thanks to you.']],
      ['WELCOME TO THE FLEET', ['Fifteen jobs. As far as Flagship is concerned, you are part of the fleet now. Hoist the colors!']],
    ],
  },
  wingtip: {
    sign: '- Signals desk, Wingtip Semiconductor',
    notes: [
      ['SIGNAL RECEIVED', ['Your first job came through loud and clear. Our radios thank you. Over.']],
      ['STRONG SIGNAL', ['Five jobs, every reading in order. Our sensors have never been so well looked after. Over.']],
      ['CLEARED FOR TAKEOFF', ['Fifteen jobs. Wingtip has you on its list of partners now: cleared for anything we send. Over and out.']],
    ],
  },
};

/** Smallware's founder, as the company's name grows (one note for each reputation level after the first). */
const LEVEL_NOTES: Readonly<Record<string, readonly [string, string]>> = {
  LOCAL: ['PEOPLE KNOW OUR NAME', 'The companies are starting to talk about us. Our status is LOCAL now, and the work pays better for it.'],
  TRUSTED: ['WE ARE TRUSTED', 'Five companies trust us with their deadlines. Our status is TRUSTED, and the pay shows it.'],
  RESPECTED: ['RESPECTED', "I keep hearing our name in other people's meetings. Our status is RESPECTED: bigger names pay more."],
  FAMOUS: ['FAMOUS!', 'I never thought I would type this: Smallware is FAMOUS. Look at the badge in your inbox!'],
};

export const EMAILS: readonly Email[] = [
  {
    id: 'welcome',
    from: SMALLWARE.name,
    subject: 'WELCOME TO SMALLWARE',
    body: [
      'Welcome aboard! Smallware is three desks, one coffee machine, and now you.',
      '',
      'Five computer companies send us programs to run. You run them on our CPU, as fast as it goes, before each job is due.',
      '',
      'Do good work and they keep coming back. Spend what we earn on better hardware in the shop, and we take on bigger jobs.',
      '',
      'TICK, our robot, will show you around. Read the orientation next.',
      '',
      JO,
    ],
    when: { kind: 'start' },
  },
  {
    id: 'orientation',
    from: SMALLWARE.name,
    subject: 'ORIENTATION',
    body: [
      'THE BOARD: each job says what it pays, how long our CPU takes, and when it is due. Late jobs pay half.',
      '',
      'THE DAY: 8 hours of CPU time, 9:00 to 5:00. Press L to log off, C for the calendar, E for mail.',
      '',
      'STATUS: jobs on time build our name, and a bigger name pays better. Late jobs hurt it.',
      '',
      'THE SHOP: press S. Faster parts mean bigger jobs.',
      '',
      JO,
    ],
    when: { kind: 'start' },
  },
  ...COMPANIES.flatMap((company) =>
    THANKS[company.id].notes.map(([subject, words], i): Email => {
      const count = [1, 5, 15][i];
      return { id: `${company.id}-${count}`, from: company.name, subject, body: [...words, '', THANKS[company.id].sign], when: { kind: 'jobs', company: company.id, count } };
    }),
  ),
  ...REPUTATION.levels.slice(1).map(
    (level): Email => ({
      id: `level-${level.name.toLowerCase()}`,
      from: SMALLWARE.name,
      subject: LEVEL_NOTES[level.name][0],
      body: [`${LEVEL_NOTES[level.name][1]} Thank you.`, '', JO],
      when: { kind: 'level', level: level.name },
    }),
  ),
];
