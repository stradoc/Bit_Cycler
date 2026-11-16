// The inbox's rules: which emails (data/emails.ts) have arrived, delivering
// the ones now due, and reading them. Pure, so it's tested in Node. Delivery
// runs wherever the game moves on (a finished job, a new day, a new game,
// loading a save) and never draws a random number or touches the board.

import { COMPANIES } from '../data/companies.ts';
import { EMAILS, type Email, type MailRule } from '../data/emails.ts';
import type { Progress } from './progress.ts';
import { levelOf } from './reputation.ts';
import { REPUTATION } from '../data/economy.ts';

/** An email that has arrived: which one, on what day, and whether it's been opened. */
export type Received = { readonly id: string; readonly day: number; readonly read: boolean };

/** An email by its id. */
export function emailById(id: string): Email | undefined {
  return EMAILS.find((email) => email.id === id);
}

/** Whether an email's rule is met on `progress`. */
function due(rule: MailRule, progress: Progress): boolean {
  switch (rule.kind) {
    case 'start':
      return true;
    case 'jobs':
      return (progress.companyJobs[rule.company] ?? 0) >= rule.count;
    case 'level':
      return levelOf(progress.reputation).index >= REPUTATION.levels.findIndex((level) => level.name === rule.level);
  }
}

/** Every email now due and not yet received arrives, dated today, in the table's order. Nothing due: the same progress. */
export function deliverMail(progress: Progress): Progress {
  const have = new Set(progress.mail.map((each) => each.id));
  const arriving = EMAILS.filter((email) => !have.has(email.id) && due(email.when, progress)).map((email): Received => ({ id: email.id, day: progress.day, read: false }));
  return arriving.length === 0 ? progress : { ...progress, mail: [...progress.mail, ...arriving] };
}

/** Opening an email marks it read; an id not in the inbox changes nothing. */
export function readMail(progress: Progress, id: string): Progress {
  if (!progress.mail.some((each) => each.id === id && !each.read)) return progress;
  return { ...progress, mail: progress.mail.map((each) => (each.id === id ? { ...each, read: true } : each)) };
}

/** Marks an opened email unread again (the inbox's U); one not in the inbox, or already unread, changes nothing. */
export function markUnread(progress: Progress, id: string): Progress {
  if (!progress.mail.some((each) => each.id === id && each.read)) return progress;
  return { ...progress, mail: progress.mail.map((each) => (each.id === id ? { ...each, read: false } : each)) };
}

/** How many emails are still unopened. */
export function unreadCount(progress: Progress): number {
  return progress.mail.filter((each) => !each.read).length;
}

/** A saved inbox, in range (saveFile.ts): known emails, each once, on a real day. */
export function cleanMail(raw: unknown): Received[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Received[] = [];
  for (const each of raw) {
    if (typeof each !== 'object' || each === null) continue;
    const { id, day, read } = each as Record<string, unknown>;
    if (typeof id !== 'string' || !emailById(id) || seen.has(id) || typeof day !== 'number' || !Number.isInteger(day) || day < 1) continue;
    seen.add(id);
    out.push({ id, day, read: read === true });
  }
  return out;
}

/** Saved jobs done per company, in range: known companies, whole counts from 0. */
export function cleanCompanyJobs(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const counts = raw as Record<string, unknown>;
  return Object.fromEntries(
    COMPANIES.flatMap((company) => {
      const count = counts[company.id];
      return typeof count === 'number' && Number.isInteger(count) && count >= 0 && count <= 1e6 ? [[company.id, count]] : [];
    }),
  );
}
