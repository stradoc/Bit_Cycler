import { LESSONS, TIER1_LESSON } from '../data/lessons.js';
import { updateProgress } from '../save.js';
import { Screen } from '../ui/screen.js';
import { ALPHA } from '../ui/theme.js';
import { drawDiagram } from '../visual/diagrams.js';
import { isSmooth, WIDTH } from '../visual/display.js';
/** Paged concept cards shown before a concept is practiced and played. */
export class BriefingScene extends Screen {
    lesson = TIER1_LESSON;
    page = 0;
    then;
    /** Can't be skipped: the first time a concept comes up, or right after buying a part. */
    mandatory = false;
    layer;
    constructor() {
        super('briefing');
    }
    init(data) {
        this.mandatory = data?.mandatory ?? false;
        // Where to go after the last page; by default, practice of the lesson's concept.
        this.then = data?.then;
        // ?lesson=tier2 in the URL opens a lesson directly (dev shortcut).
        const id = data?.lessonId ?? new URLSearchParams(location.search).get('lesson') ?? TIER1_LESSON.id;
        this.lesson = LESSONS[id] ?? TIER1_LESSON;
        this.page = 0;
    }
    create() {
        this.setUp();
        this.layer = this.add.container(0, 0);
        this.render();
        this.slideIn(0);
        // A click turns the page (unless it was on the pause menu).
        this.input.on('pointerdown', (_pointer, over) => {
            if (over.length === 0 && !this.pausing)
                this.next();
        });
    }
    onKey(key) {
        if (key === 'Enter' || key === ' ' || key === 'ArrowRight')
            this.next();
        else if (key === 'ArrowLeft')
            this.turn(-1);
        else
            return false;
        return true;
    }
    /** A briefing you must read (after buying a part) offers only the main menu; the others, the usual places. */
    pauseItems() {
        return this.mandatory ? [this.go('MAIN MENU', 'title', 'YOUR PROGRESS IS SAVED. EVERY BRIEFING CAN BE READ AGAIN FROM THE MAIN MENU.')] : this.places();
    }
    next() {
        if (this.page < this.lesson.pages.length - 1) {
            this.turn(1);
            return;
        }
        updateProgress((p) => ({ ...p, seenLessons: [...new Set(p.seenLessons).add(this.lesson.id)] }));
        if (this.then)
            this.scene.start(this.then.scene, this.then.data);
        else
            this.scene.start(this.lesson.scene, { practice: true, ...this.lesson.options });
    }
    finishLabel() {
        if (!this.then)
            return 'START PRACTICE';
        if (this.then.scene !== 'pipeline')
            return 'CONTINUE';
        return this.then.data.practice ? 'START PRACTICE' : 'PLAY';
    }
    turn(delta) {
        const page = Phaser.Math.Clamp(this.page + delta, 0, this.lesson.pages.length - 1);
        if (page === this.page)
            return;
        this.cue('move');
        this.page = page;
        this.render();
        this.slideIn(delta);
    }
    /** The modern era fades each page in, sliding from the side it came from; the retro eras just show it. */
    slideIn(direction) {
        if (!isSmooth())
            return;
        this.layer.setAlpha(0).setX(28 * direction).setY(direction === 0 ? 10 : 0);
        this.tweens.add({ targets: this.layer, alpha: 1, x: 0, y: 0, duration: 240, ease: 'Cubic.Out' });
    }
    render() {
        this.tweens.killAll();
        this.layer.removeAll(true);
        const width = WIDTH;
        const cx = width / 2;
        const page = this.lesson.pages[this.page];
        const last = this.page === this.lesson.pages.length - 1;
        const text = (x, y, content, size, alpha = 1, bold = false) => {
            const t = this.text(x, y, content, size).setAlpha(alpha).setFontStyle(bold ? 'bold' : '');
            this.layer.add(t);
            return t;
        };
        text(cx, 26, this.lesson.title, 16, 0.6);
        text(width - 40, 26, `${this.page + 1}/${this.lesson.pages.length}`, 16, 0.6).setOrigin(1, 0.5);
        text(cx, 70, page.title, 30, 1, true);
        this.layer.add(drawDiagram(this, page.diagram, cx, 205, this.era));
        page.lines.forEach((line, i) => text(cx, 340 + i * 32, line, 20));
        text(cx, 450, page.analogy, 18, 0.75);
        const keys = last ? ['[<-] BACK', `[ENTER] ${this.finishLabel()}`] : ['[<-] BACK', '[ENTER] NEXT', '[ESC] MENU'];
        this.layer.add(this.hints(...keys).setAlpha(ALPHA.subtitle));
    }
}
//# sourceMappingURL=BriefingScene.js.map