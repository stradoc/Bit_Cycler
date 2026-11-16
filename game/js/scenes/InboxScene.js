import { COMPANIES, SMALLWARE } from '../data/companies.js';
import { formatMoney } from '../format.js';
import { getProgress, updateProgress } from '../save.js';
import { emailById, readMail } from '../sim/mail.js';
import { levelOf, statusLine } from '../sim/reputation.js';
import { shortDate } from '../sim/workday.js';
import { cssColor } from '../ui/eras.js';
import { ListMenu } from '../ui/list.js';
import { Screen } from '../ui/screen.js';
import { ALPHA, LAYOUT, TEXT } from '../ui/theme.js';
import { panel } from '../ui/widgets.js';
import { RankBadge } from '../visual/badge3d.js';
/** Smallware's profile above the list: its door, its status badge turning beside it, and its status in words. */
const LOGO = { x: 40, y: 96 };
const BADGE = { x: 210, y: 150 };
const STATUS = { x: 290, y: 150 };
const LIST_X = 48;
const LIST_W = 470;
const LIST_TOP = 226;
const ROW_H = 26;
/** The chosen email in full, beside the list. */
const READ_X = 540;
const READ_Y = 92;
const READ_W = LAYOUT.right - READ_X;
const READ_H = 362;
/**
 * The inbox, a tab like the calendar (`E` from the board): the mail that has
 * arrived (sim/mail.ts), newest first, unread marked with `*`; the chosen
 * email in full beside it. Looking at an email marks it read. The computer is
 * one of Smallware's, so its profile heads the list: its door, and its status
 * (reputation's level, by name only) with a 3D badge that grows with it.
 */
export class InboxScene extends Screen {
    menu;
    mail = [];
    reader;
    badge;
    constructor() {
        super('inbox');
    }
    create() {
        this.setUp();
        const progress = getProgress();
        this.header('INBOX', `${SMALLWARE.name} MAIL`);
        this.corner(formatMoney(progress.money));
        // The door, drawn a character at a time (any letter spacing does) so no font joins its strokes.
        this.textAt(LOGO.x, LOGO.y, SMALLWARE.logo.join('\n'), TEXT.small).setLineSpacing(0).setLetterSpacing(0.01).setPadding({ bottom: 4 }).setColor(cssColor(this.era.accent));
        // The company's status: a badge that gains a part at each rank, and its name (the rates stay hidden).
        this.badge = new RankBadge(this, this.era, BADGE.x, BADGE.y, levelOf(progress.reputation).index);
        this.textAt(STATUS.x, STATUS.y, statusLine(progress.reputation), TEXT.body).setOrigin(0, 0.5).setFontStyle('bold');
        this.mail = [...progress.mail].reverse();
        this.menu = new ListMenu(this, this.era, { x: LIST_X, top: LIST_TOP, width: LIST_W, rowHeight: ROW_H, size: 14, bottom: LAYOUT.about - 30 });
        // The oldest unread email first (the welcome before the orientation), else the newest.
        const oldestUnread = this.mail.map((each) => each.read).lastIndexOf(false);
        this.menu.setRows(this.rows(), Math.max(0, oldestUnread));
        panel(this, this.era, READ_X, READ_Y, READ_W, READ_H, 'MESSAGE');
        this.reader = this.add.container(0, 0);
        this.hints('[UP/DOWN] CHOOSE', '[B] CONTRACT BOARD', '[Q] MENU');
        this.open();
    }
    update(time, delta) {
        super.update(time, delta);
        this.badge.update(performance.now());
    }
    pauseItems() {
        return this.places();
    }
    /** Each email a row: unread mark, who it's from (a company's short name), the subject, the day it came. */
    rows() {
        return this.mail.map((each) => {
            const email = emailById(each.id);
            const from = COMPANIES.find((company) => company.name === email?.from)?.short ?? email?.from ?? '';
            return { label: `${each.read ? ' ' : '*'} ${from.padEnd(9)} ${email?.subject ?? ''}`, value: shortDate(each.day), alpha: each.read ? 0.75 : 1 };
        });
    }
    /** Shows the chosen email in full, and marks it read. */
    open() {
        this.reader.removeAll(true);
        const chosen = this.mail[this.menu.selected];
        const email = chosen && emailById(chosen.id);
        const x = READ_X + 16;
        const width = READ_W - 32;
        if (!email) {
            this.reader.add(this.textAt(x, READ_Y + 20, 'NO MAIL YET.', TEXT.small).setAlpha(ALPHA.subtitle));
            return;
        }
        const head = this.textAt(x, READ_Y + 18, `FROM:    ${email.from}\nSUBJECT: ${email.subject}\nDATE:    ${shortDate(chosen.day)}`, TEXT.small).setLineSpacing(2);
        head.setColor(cssColor(this.era.accent));
        const body = this.textAt(x, head.y + head.height + 14, email.body.join('\n'), TEXT.small).setWordWrapWidth(width).setLineSpacing(2);
        this.reader.add([head, body]);
        if (!chosen.read) {
            const progress = updateProgress((p) => readMail(p, chosen.id));
            this.mail = [...progress.mail].reverse();
            this.menu.setRows(this.rows());
        }
    }
    onKey(key) {
        if (this.menu.busy)
            return true;
        if (key === 'ArrowUp' || key === 'ArrowDown') {
            this.menu.move(key === 'ArrowUp' ? -1 : 1);
            this.open();
        }
        else if (key === 'B') {
            this.back('board');
        }
        else
            return false;
        return true;
    }
}
//# sourceMappingURL=InboxScene.js.map