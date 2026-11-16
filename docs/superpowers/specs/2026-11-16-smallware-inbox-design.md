# Smallware and the inbox

Short design for an in-game email system (2026-11-16), agreed with the user in conversation. Read `CLAUDE.md` and `RULES.md` first.

## Why

The user: "Can we add an email system?" — "emails from the companies after you do X amount of jobs for them, an email explaining orientation, and a welcome email. It would just be another tab like calendar is." And the player works for SMALLWARE, "a stand in for microsoft", with "their logos around the game, like as if you're on one of their terminals". A basic system first, with a bunch of emails; bills and debts come next and will reuse it.

## Goals

- **Smallware**, the player's employer: a small start-up that does work for the five hardware companies (as early Microsoft did for IBM, Intel, AMD, Commodore and Motorola). Made up; it hints at Microsoft without its name or logo. Its logo is a door (a window becomes a door), no text:

  ```
  .--------.
  | .----. |
  | |    | |
  | '----' |
  | .----.o|
  | |    | |
  | '----' |
  '--------'
  ```

- **An INBOX screen**, a tab like the calendar: `E` from the board, `B` back. Mail listed newest first (sender, subject, day; unread marked `*`), the open message beside it; opening one marks it read. The board's hint line shows unread mail: `[E] INBOX (2)`.
- **About 21 emails** (Claude writes them, plain words, sentence case like letters):
  - From Smallware's founder: a welcome (a new game's first day), an orientation (the board, the workday, reputation, the shop), and one at each reputation level from LOCAL to FAMOUS (4).
  - From each of the five companies: after 1, 5 and 15 jobs done for it (15), in each company's voice. Thanks only.
- **Smallware around the game**: its logo at the top of the inbox and on the boot screen; the computer's name is `smallware` (`player@smallware`), and the BIOS lines say SMALLWARE. Bit Cycler stays the game's (the program's) name.

## Non-goals

- Rewards in emails (money, reputation, special jobs), replies, choices. Later; an email entry gains a field for them.
- Bills and debts (the next feature; it will send its mail through this system).
- Era styling of the inbox beyond the existing kit (era styling comes last).

## How it's built (Claude's calls)

- `data/emails.ts`: every email as data: id, sender, subject, body (lines), and when it arrives (`start`, a company's job count, a reputation level). A new email is an entry.
- `data/companies.ts`: `SMALLWARE` (name, logo, host name, founder's signature) beside `COMPANIES`.
- `sim/mail.ts` (pure, tested): `deliverMail(progress)` adds every email that's due and not yet received (on the current day), `readMail`, `unreadCount`. Called by `finishJob` and `endDay` (`sim/workday.ts`), by `newCampaign`, and on loading a save (`getProgress` in `save.ts`, as `fillBoard` is), so old saves get the welcome and orientation.
- `Progress.mail` (received: id, day, read) and `Progress.companyJobs` (jobs finished per company id), with new-game values and range checks in `cleanProgress`; old saves start at none.
- `scenes/InboxScene.ts`: a `Screen` with a `ListMenu` and a panel; registered in `main.ts`, `TITLES`, `PATHS`, `DOS_ITEM`; reached from the board (`E`).
- The host name lives in one place (`SMALLWARE.host`), used by the window bar, the boot's prompt and the main menu's prompt.

## Docs

`CLAUDE.md` (code map, "An email" under Adding things), `CHANGELOG.md` (Decisions row, session entry), `ROADMAP.md`, `game/README.md` (the inbox), README.TXT if it fits.
