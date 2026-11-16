import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPANIES } from '../game/src/data/companies.ts';
import { REPUTATION } from '../game/src/data/economy.ts';
import { EMAILS } from '../game/src/data/emails.ts';
import { NEW_GAME, newCampaign, type Progress } from '../game/src/sim/progress.ts';
import { deliverMail, readMail, unreadCount } from '../game/src/sim/mail.ts';

// The inbox (sim/mail.ts): emails are data (data/emails.ts), each with a rule
// for when it arrives; delivering adds what's due, once.

/** A body word-wrapped at `width` characters, as the inbox's panel shows it. */
function wrapped(lines: readonly string[], width: number): string[] {
  return lines.flatMap((line) => {
    const out: string[] = [];
    let now = '';
    for (const word of line.split(' ')) {
      if (now && `${now} ${word}`.length > width) {
        out.push(now);
        now = word;
      } else now = now ? `${now} ${word}` : word;
    }
    out.push(now);
    return out;
  });
}

test('every email is well made', () => {
  assert.equal(new Set(EMAILS.map((email) => email.id)).size, EMAILS.length, 'ids are unique');
  for (const email of EMAILS) assert.ok(email.from && email.subject && email.body.length > 0, email.id);
  const starts = EMAILS.filter((email) => email.when.kind === 'start').map((email) => email.id);
  assert.deepEqual(starts, ['welcome', 'orientation']);
  for (const company of COMPANIES) {
    const counts = EMAILS.flatMap((email) => (email.when.kind === 'jobs' && email.when.company === company.id ? [email.when.count] : []));
    assert.deepEqual(counts, [1, 5, 15], company.id);
  }
  for (const email of EMAILS) if (email.when.kind === 'jobs') assert.ok(COMPANIES.some((company) => company.id === (email.when as { company: string }).company), email.id);
  const levels = EMAILS.flatMap((email) => (email.when.kind === 'level' ? [email.when.level] : []));
  assert.deepEqual(levels, REPUTATION.levels.slice(1).map((level) => level.name));
});

test('every email fits its panel', () => {
  for (const email of EMAILS) {
    // 16 lines leaves a margin in the tallest font (DOS's), under the three-line header.
    assert.ok(wrapped(email.body, 46).length <= 16, `${email.id}: ${wrapped(email.body, 46).length} lines`);
    assert.ok(email.subject.length <= 26, `${email.id}: "${email.subject}"`);
    for (const text of [email.from, email.subject, ...email.body]) assert.match(text, /^[\x20-\x7e]*$/, `${email.id}: "${text}"`);
  }
});

test('a new game starts with the welcome and orientation, unread', () => {
  const start = newCampaign();
  assert.deepEqual(start.mail, [
    { id: 'welcome', day: 1, read: false },
    { id: 'orientation', day: 1, read: false },
  ]);
  assert.equal(unreadCount(start), 2);
});

test('delivering is idempotent', () => {
  const p: Progress = { ...NEW_GAME, day: 4, companyJobs: { cobalt: 6, wingtip: 1 }, reputation: { good: 20, bad: 0 } };
  const once = deliverMail(p);
  assert.deepEqual(deliverMail(once), once);
});

test('a company writes after 1, 5 and 15 jobs for it', () => {
  const p = deliverMail({ ...NEW_GAME, day: 6, mail: [], companyJobs: { cobalt: 5 } });
  const cobalt = p.mail.filter((each) => each.id.startsWith('cobalt-'));
  assert.deepEqual(cobalt, [
    { id: 'cobalt-1', day: 6, read: false },
    { id: 'cobalt-5', day: 6, read: false },
  ]);
});

test("each reputation level brings Smallware's note", () => {
  const p = deliverMail({ ...NEW_GAME, mail: [], reputation: { good: 15, bad: 0 } });
  assert.deepEqual(p.mail.filter((each) => each.id.startsWith('level-')).map((each) => each.id), ['level-local', 'level-trusted']);
});

test('reading marks one email read; an unknown one changes nothing', () => {
  const start = newCampaign();
  const read = readMail(start, 'orientation');
  assert.deepEqual(read.mail.map((each) => each.read), [false, true]);
  assert.equal(unreadCount(read), 1);
  assert.equal(readMail(start, 'nothing'), start);
});

test('a save from before the inbox gets its welcome once', () => {
  const old = deliverMail({ ...NEW_GAME, day: 9, mail: [] });
  assert.deepEqual(old.mail.map((each) => each.id), ['welcome', 'orientation']);
  assert.equal(deliverMail(old), old);
});

test('no email gives away pay rates or how bad marks work', () => {
  for (const email of EMAILS) for (const text of [email.subject, ...email.body]) assert.doesNotMatch(text, /x\d|\d\.\d\dx|BAD MARK|cuts? (our |your )?pay/i, `${email.id}: "${text}"`);
});

test("a company's thanks never claims the work was on time: late jobs count toward it too", () => {
  for (const email of EMAILS.filter((each) => each.when.kind === 'jobs')) {
    for (const text of email.body) assert.doesNotMatch(text, /on time|beat the clock|right on time|tidy/i, `${email.id}: "${text}"`);
  }
});
