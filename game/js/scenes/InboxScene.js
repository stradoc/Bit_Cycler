import { shortClient, SMALLWARE } from '../data/companies.js';
import { formatMoney } from '../format.js';
import { getProgress, updateProgress } from '../save.js';
import { emailById, markUnread, readMail, unreadCount } from '../sim/mail.js';
import { levelOf, statusLine } from '../sim/reputation.js';
import { shortDate, weekday } from '../sim/workday.js';
import { cssColor } from '../ui/eras.js';
import { ListMenu } from '../ui/list.js';
import { Screen } from '../ui/screen.js';
import { ALPHA, LAYOUT, TEXT } from '../ui/theme.js';
import { RankBadge } from '../visual/badge3d.js';
/** The mail program's width: a column of text from the left edge to the right. */
const LEFT = 60;
const RIGHT = 900;
/** The inbox: Smallware's profile at the top (its door, the mail's count, its status and badge), then the list under its column headings. */
const TOP = 92;
const BADGE = { x: 850, y: 138 };
const RULE_Y = 198;
const HEADINGS_Y = 212;
const LIST_TOP = 240;
const ROW_H = 26;
/** How wide the sender's column is (characters): the longest short name, and a space. */
const FROM_CHARS = 10;
/** What a row starts with while unread or read: an unopened envelope, or an empty box. */
const UNREAD_MARK = '[*]';
const READ_MARK = '[ ]';
/**
 * Smallware's mail program, a tab like the calendar (`E` from the board).
 * The inbox lists the mail that has arrived (sim/mail.ts), newest first, in
 * columns: an envelope for unread mail ([*], bright) or read ([ ], dim), who
 * it's from, the subject and the day. Enter opens one full-screen, which
 * marks it read; U marks it unread again. The top of the inbox is the
 * company's profile: its door, how much mail is unread, and its status (by
 * name only) with a 3D badge that grows with it. Each view is the scene
 * started again with its data (InboxData).
 */
export class InboxScene extends Screen {
    menu;
    /** The mail, newest first, as the list shows it. */
    mail = [];
    badge;
    /** The email open now, and its row in the list. */
    open;
    selected = 0;
    constructor() {
        super('inbox');
    }
    /** Opening the inbox again reuses this scene: start clean. */
    init() {
        this.menu = undefined;
        this.badge = undefined;
        this.open = undefined;
        this.selected = 0;
    }
    create(data) {
        this.setUp();
        const progress = getProgress();
        this.mail = [...progress.mail].reverse();
        this.header(`${SMALLWARE.name} MAIL`);
        this.corner(formatMoney(progress.money));
        if (data?.open && emailById(data.open))
            this.showEmail(data.open, data.selected ?? 0);
        else
            this.showList(data?.selected);
    }
    update(time, delta) {
        super.update(time, delta);
        this.badge?.update(performance.now());
    }
    pauseItems() {
        return this.places();
    }
    /** A rule across the mail program, from its left edge to its right in any era's font. */
    rule(y) {
        const line = this.textAt(LEFT, y, '-'.repeat(84), TEXT.small).setAlpha(0.35);
        line.setScale((RIGHT - LEFT) / line.width, 1);
    }
    // ---- the inbox ----
    showList(selected) {
        const progress = getProgress();
        // The profile: the door, the count, and the status with its badge.
        this.textAt(LEFT, TOP, SMALLWARE.logo.join('\n'), TEXT.small).setLineSpacing(0).setLetterSpacing(0.01).setPadding({ bottom: 4 }).setColor(cssColor(this.era.accent));
        const unread = unreadCount(progress);
        this.textAt(LEFT + 120, TOP + 20, 'INBOX', TEXT.title - 4).setFontStyle('bold');
        this.textAt(LEFT + 120, TOP + 56, `${unread} UNREAD, ${this.mail.length} MESSAGE${this.mail.length === 1 ? '' : 'S'}`, TEXT.body).setAlpha(unread > 0 ? 1 : ALPHA.subtitle);
        this.textAt(BADGE.x - 70, BADGE.y, statusLine(progress.reputation), TEXT.body).setOrigin(1, 0.5).setFontStyle('bold');
        this.badge = new RankBadge(this, this.era, BADGE.x, BADGE.y, levelOf(progress.reputation).index);
        this.rule(RULE_Y);
        // The column headings, lined up with the rows' text (after the list's two-character cursor and the envelope).
        const lead = ' '.repeat(2 + UNREAD_MARK.length + 1);
        this.textAt(LEFT, HEADINGS_Y, `${lead}${'FROM'.padEnd(FROM_CHARS + 1)}SUBJECT`, 14).setAlpha(ALPHA.subtitle);
        this.textAt(RIGHT, HEADINGS_Y, 'DATE', 14).setOrigin(1, 0).setAlpha(ALPHA.subtitle);
        if (this.mail.length === 0) {
            this.textAt(LEFT, LIST_TOP, '  NO MAIL YET.', 14).setAlpha(ALPHA.subtitle);
        }
        else {
            this.menu = new ListMenu(this, this.era, { x: LEFT, top: LIST_TOP, width: RIGHT - LEFT, rowHeight: ROW_H, size: 14, bottom: LAYOUT.about - 6 });
            // Back where the list was, else on the oldest unread email (the welcome before the orientation), else the newest.
            const oldestUnread = this.mail.map((each) => each.read).lastIndexOf(false);
            this.menu.setRows(this.rows(), Math.min(this.mail.length - 1, selected ?? Math.max(0, oldestUnread)));
        }
        this.hints('[UP/DOWN] CHOOSE', '[ENTER] OPEN', '[U] READ / UNREAD', '[B] CONTRACT BOARD', '[Q] MENU');
    }
    /** Each email a row: its envelope, who it's from, the subject, the day it came. Unread mail bright, read mail dim. */
    rows() {
        return this.mail.map((each) => {
            const email = emailById(each.id);
            const from = (shortClient(email?.from) ?? '').padEnd(FROM_CHARS);
            return { label: `${each.read ? READ_MARK : UNREAD_MARK} ${from} ${email?.subject ?? ''}`, value: shortDate(each.day), alpha: each.read ? 0.6 : 1 };
        });
    }
    // ---- an email, opened ----
    /** One email full-screen: its header, then its words; opening it marks it read. */
    showEmail(id, selected) {
        const email = emailById(id);
        const received = this.mail.find((each) => each.id === id);
        if (!email || !received)
            return;
        this.open = id;
        this.selected = selected;
        updateProgress((p) => readMail(p, id));
        this.rule(TOP);
        const field = (name, value) => `${name.padEnd(9)} ${value}`;
        const head = [field('FROM:', email.from), field('TO:', `you@${SMALLWARE.host}`), field('DATE:', `${weekday(received.day)}, ${shortDate(received.day)}`), field('SUBJECT:', email.subject)];
        const header = this.textAt(LEFT, TOP + 18, head.join('\n'), TEXT.body).setLineSpacing(4).setColor(cssColor(this.era.accent));
        this.rule(header.y + header.height + 8);
        this.textAt(LEFT, header.y + header.height + 30, email.body.join('\n'), TEXT.body).setWordWrapWidth(RIGHT - LEFT).setLineSpacing(4);
        this.rule(LAYOUT.about - 4);
        this.hints('[B] BACK TO INBOX', '[UP/DOWN] PREVIOUS / NEXT', '[U] MARK UNREAD', '[Q] MENU');
    }
    onKey(key) {
        if (this.menu?.busy)
            return true;
        if (this.open !== undefined)
            return this.emailKey(key);
        const chosen = this.menu ? this.mail[this.menu.selected] : undefined;
        if (key === 'ArrowUp' || key === 'ArrowDown') {
            this.menu?.move(key === 'ArrowUp' ? -1 : 1);
        }
        else if (key === 'Enter' && chosen && this.menu) {
            this.cue('confirm');
            this.scene.restart({ open: chosen.id, selected: this.menu.selected });
        }
        else if (key === 'U' && chosen && this.menu) {
            this.cue('move');
            updateProgress((p) => (chosen.read ? markUnread(p, chosen.id) : readMail(p, chosen.id)));
            // The count at the top changes too: draw the inbox again where it was.
            this.scene.restart({ selected: this.menu.selected });
        }
        else if (key === 'B') {
            this.back('board');
        }
        else
            return false;
        return true;
    }
    /** The keys while an email is open: back to the inbox, the one before or after it, or mark it unread and go back. */
    emailKey(key) {
        const id = this.open;
        if (key === 'B') {
            this.cue('back');
            this.scene.restart({ selected: this.selected });
        }
        else if (key === 'ArrowUp' || key === 'ArrowDown') {
            const next = this.selected + (key === 'ArrowUp' ? -1 : 1);
            const email = this.mail[next];
            if (!email)
                return true;
            this.cue('move');
            this.scene.restart({ open: email.id, selected: next });
        }
        else if (key === 'U' && id) {
            this.cue('move');
            updateProgress((p) => markUnread(p, id));
            this.scene.restart({ selected: this.selected });
        }
        else
            return false;
        return true;
    }
}
//# sourceMappingURL=InboxScene.js.map