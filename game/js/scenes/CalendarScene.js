import { CALENDAR_TOUR, CALENDAR_TOUR_ID } from '../data/tours.js';
import { formatClock, formatHours, formatMoney } from '../format.js';
import { getProgress, updateProgress } from '../save.js';
import { teaching } from '../settings.js';
import { hasSeen, withSeen } from '../sim/progress.js';
import { calendarDate, clockSeconds, DAY_START, eventsOn, monthWeeks, MONTHS, recordOf, shortDate, timeLeft, weekday, WEEKDAYS } from '../sim/workday.js';
import { cssColor } from '../ui/eras.js';
import { Guide } from '../ui/guide.js';
import { Screen } from '../ui/screen.js';
import { LAYOUT, TEXT } from '../ui/theme.js';
import { panel } from '../ui/widgets.js';
import { MONTH_GRID, monthGrid, timecard } from '../visual/asciiChart.js';
const GRID_X = 30;
const GRID_Y = 96;
/** The chosen day in full, beside the month. */
const DETAIL_X = 560;
const DETAIL_Y = 92;
const DETAIL_W = LAYOUT.right - DETAIL_X;
const DETAIL_H = 362;
/** A day's words in the month (two short lines), and in full beside it. */
function eventLines(event) {
    switch (event.kind) {
        case 'offers-end':
            return [`LAST DAY FOR ${event.clients.length} OFFER${event.clients.length === 1 ? '' : 'S'}:`, ...event.clients.map((client) => `  ${client}`)];
    }
}
function eventCell(event) {
    switch (event.kind) {
        case 'offers-end':
            return `${event.clients.length} OFFER${event.clients.length === 1 ? '' : 'S'}`;
    }
}
/**
 * The calendar: the month as a wall calendar in characters (from November,
 * day 1), each day's box showing what it came to (money and jobs), today
 * and its hours left, or what's marked on it (sim/workday.ts eventsOn).
 * The arrows choose a day; beside the month, that day in full: a finished
 * day's timecard, today's progress, or a coming day's events.
 */
export class CalendarScene extends Screen {
    selected = 1;
    grid;
    marks = [];
    detail;
    month;
    guide;
    /** Where today's box is, for TICK to point at. */
    todayBox;
    constructor() {
        super('calendar');
    }
    /** Opening the calendar again reuses this scene: start clean. */
    init() {
        this.marks = [];
        this.todayBox = undefined;
    }
    /** `tour`: TICK's tour of the calendar even if it's been seen (BRIEFS on the main menu). */
    create(data) {
        const replayTour = data?.tour ?? false;
        this.setUp();
        const progress = getProgress();
        this.selected = progress.day;
        const { subtitle } = this.header('CALENDAR', '');
        if (subtitle)
            this.month = subtitle;
        this.corner(formatMoney(progress.money));
        this.grid = this.textAt(GRID_X, GRID_Y, '', TEXT.small).setLineSpacing(0);
        panel(this, this.era, DETAIL_X, DETAIL_Y, DETAIL_W, DETAIL_H, 'THE DAY');
        this.detail = this.add.container(0, 0);
        this.hints('[ARROWS] CHOOSE A DAY', '[B] CONTRACT BOARD', '[Q] MENU');
        this.draw();
        // The first look: TICK shows the calendar around.
        this.guide = new Guide(this, this.era);
        if (replayTour || (teaching().tours && !hasSeen(progress, CALENDAR_TOUR_ID))) {
            this.guide.tour(CALENDAR_TOUR, (target) => this.where(target), () => updateProgress((p) => withSeen(p, CALENDAR_TOUR_ID)));
        }
    }
    update() {
        super.update();
        this.guide.update(performance.now());
    }
    /** Where the calendar's parts are, for the guide to point at. */
    where(target) {
        const month = { x: GRID_X - 8, y: GRID_Y - 6, w: this.grid.width + 16, h: this.grid.height + 12 };
        return { month, today: this.todayBox ?? month, day: { x: DETAIL_X, y: DETAIL_Y, w: DETAIL_W, h: DETAIL_H } }[target];
    }
    pauseItems() {
        return this.places();
    }
    /** The month the chosen day falls in, the chosen day and today marked, and the chosen day in full. */
    draw() {
        const progress = getProgress();
        const { year, month } = calendarDate(this.selected);
        this.month.setText(`${MONTHS[month]} ${year}   TODAY: ${weekday(progress.day)} ${shortDate(progress.day)}, ${formatClock(clockSeconds(progress))}`);
        const weeks = monthWeeks(this.selected);
        this.grid.setText(monthGrid(weeks.map((week) => week.map((day) => (day === null ? null : this.cell(day)))), WEEKDAYS).join('\n'));
        // Today, and the chosen day, marked over their boxes.
        for (const mark of this.marks)
            mark.destroy();
        this.marks = [];
        const lines = this.grid.text.split('\n');
        const charW = this.grid.width / lines[0].length;
        const lineH = this.grid.height / lines.length;
        const { cellWidth, cellLines, headerLines } = MONTH_GRID;
        weeks.forEach((week, row) => week.forEach((day, col) => {
            if (day === null || (day !== progress.day && day !== this.selected))
                return;
            const x = GRID_X + (1 + col * (cellWidth + 1)) * charW;
            const y = GRID_Y + (headerLines + row * (cellLines + 1)) * lineH;
            const box = this.add.rectangle(x - 1, y - 1, cellWidth * charW + 2, cellLines * lineH + 2).setOrigin(0);
            if (day === progress.day) {
                box.setFillStyle(this.era.accent, 0.18);
                this.todayBox = { x: x - 4, y: y - 4, w: cellWidth * charW + 8, h: cellLines * lineH + 8 };
            }
            if (day === this.selected)
                box.setStrokeStyle(2, this.era.accent, 1);
            this.marks.push(box);
        }));
        this.drawDetail();
    }
    /** A day's box: its date, then what it came to, today's hours, or what's marked on it. */
    cell(day) {
        const progress = getProgress();
        const date = String(calendarDate(day).date);
        if (day < 1)
            return [date, ''];
        if (day === progress.day)
            return [`${date} TODAY`, `${Math.floor(timeLeft(progress) / 3600)} H LEFT`];
        if (day < progress.day) {
            const record = recordOf(progress, day);
            return record ? [date, `${formatMoney(record.earned)}`] : [date, '-'];
        }
        const [event] = eventsOn(progress, day);
        return [date, event ? eventCell(event) : ''];
    }
    /** The chosen day in full. */
    drawDetail() {
        this.detail.removeAll(true);
        const progress = getProgress();
        const day = this.selected;
        const left = DETAIL_X + 16;
        const line = (y, content, size = TEXT.small, alpha = 0.95) => {
            const text = this.textAt(left, DETAIL_Y + y, content, size).setAlpha(alpha);
            this.detail.add(text);
            return text;
        };
        line(16, `${weekday(day)} ${shortDate(day)}`, TEXT.body + 2, 1).setFontStyle('bold');
        if (day < 1) {
            line(48, 'BEFORE YOUR FIRST DAY.');
            return;
        }
        if (day < progress.day) {
            const record = recordOf(progress, day);
            if (!record) {
                line(48, 'NO RECORD OF THIS DAY.');
                return;
            }
            line(48, timecard({ date: shortDate(day), in: formatClock(DAY_START), out: formatClock(record.out), jobs: record.jobs, late: record.late, earned: formatMoney(record.earned) }).join('\n')).setLineSpacing(2);
            return;
        }
        const events = eventsOn(progress, day);
        let y = 48;
        if (day === progress.day) {
            line(y, 'TODAY', TEXT.small, 1).setColor(cssColor(this.era.accent));
            line(y + 20, `${formatHours(timeLeft(progress))} OF WORK LEFT`);
            line(y + 38, `${progress.today.jobs} JOB${progress.today.jobs === 1 ? '' : 'S'} SO FAR, ${formatMoney(progress.today.earned)} EARNED`);
            y += 70;
        }
        if (events.length === 0) {
            line(y, day === progress.day ? 'NOTHING ELSE ON THE CALENDAR.' : 'NOTHING ON THE CALENDAR YET.', TEXT.small, 0.7);
            return;
        }
        line(y, events.flatMap(eventLines).join('\n')).setLineSpacing(3);
    }
    onKey(key, event) {
        // TICK's tour: Enter shows the rest of the words, then goes on.
        if (this.guide.waiting) {
            if (key === 'Enter' && !event.repeat)
                this.guide.next();
            return key !== 'M';
        }
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[key];
        if (step !== undefined) {
            this.selected += step;
            this.cue('move');
            this.draw();
        }
        else if (key === 'B') {
            this.back('board');
        }
        else
            return false;
        return true;
    }
}
//# sourceMappingURL=CalendarScene.js.map