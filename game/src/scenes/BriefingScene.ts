import { playMenuMusic, uiSound } from '../audio/menu.ts';
import { LESSONS, TIER1_LESSON, type Lesson } from '../data/lessons.ts';
import { keyOf, onKeyDown } from '../input/keys.ts';
import { updateProgress } from '../save.ts';
import { drawDiagram } from '../visual/diagrams.ts';
import { cssColor, currentEra, TerminalLook } from '../visual/terminal.ts';
import { isSmooth, textBase, WIDTH } from '../visual/display.ts';

/** Paged concept cards shown before a concept is practiced and played. */
export class BriefingScene extends Phaser.Scene {
  private look!: TerminalLook;
  private lesson: Lesson = TIER1_LESSON;
  private page = 0;
  private then: { scene: string; data: object } | undefined;
  /** Can't be skipped: the first time a concept comes up, or right after buying a part. */
  private mandatory = false;
  private layer!: Phaser.GameObjects.Container;

  constructor() {
    super('briefing');
  }

  init(data?: { lessonId?: string; then?: { scene: string; data: object }; mandatory?: boolean }): void {
    this.mandatory = data?.mandatory ?? false;
    // Where to go after the last page; by default, practice of the lesson's concept.
    this.then = data?.then;
    // ?lesson=tier2 in the URL opens a lesson directly (dev shortcut).
    const id = data?.lessonId ?? new URLSearchParams(location.search).get('lesson') ?? TIER1_LESSON.id;
    this.lesson = LESSONS[id] ?? TIER1_LESSON;
    this.page = 0;
  }

  create(): void {
    this.look = new TerminalLook(this, currentEra());
    this.layer = this.add.container(0, 0);
    this.render();
    this.slideIn(0);

    playMenuMusic(this);
    this.input.on('pointerdown', () => this.next());
    onKeyDown(this, (event) => {
      const key = keyOf(event);
      if (key === 'Enter' || key === ' ' || key === 'ArrowRight') this.next();
      else if (key === 'ArrowLeft') this.turn(-1);
      // Q too: Vimium-style extensions swallow Escape while a text field has focus.
      else if ((key === 'Escape' || key === 'Q') && !this.mandatory) this.scene.start('title');
    });
  }

  update(): void {
    this.look.update();
  }

  private next(): void {
    if (this.page < this.lesson.pages.length - 1) {
      this.turn(1);
      return;
    }
    updateProgress((p) => ({ ...p, seenLessons: [...new Set(p.seenLessons).add(this.lesson.id)] }));
    if (this.then) this.scene.start(this.then.scene, this.then.data);
    else this.scene.start(this.lesson.scene, { practice: true, ...this.lesson.options });
  }

  private finishLabel(): string {
    if (!this.then) return 'START PRACTICE';
    if (this.then.scene !== 'pipeline') return 'CONTINUE';
    return (this.then.data as { practice?: boolean }).practice ? 'START PRACTICE' : 'PLAY';
  }

  private turn(delta: number): void {
    const page = Phaser.Math.Clamp(this.page + delta, 0, this.lesson.pages.length - 1);
    if (page === this.page) return;
    uiSound(this, 'move');
    this.page = page;
    this.render();
    this.slideIn(delta);
  }

  /** The modern era fades each page in, sliding from the side it came from; the retro eras just show it. */
  private slideIn(direction: number): void {
    if (!isSmooth()) return;
    this.layer.setAlpha(0).setX(28 * direction).setY(direction === 0 ? 10 : 0);
    this.tweens.add({ targets: this.layer, alpha: 1, x: 0, y: 0, duration: 240, ease: 'Cubic.Out' });
  }

  private render(): void {
    this.tweens.killAll();
    this.layer.removeAll(true);

    const width = WIDTH;
    const cx = width / 2;
    const page = this.lesson.pages[this.page];
    const last = this.page === this.lesson.pages.length - 1;
    const text = (x: number, y: number, content: string, size: number, alpha = 1, bold = false) => {
      const t = this.add
        .text(x, y, content, {
          ...textBase(),
          fontSize: `${size}px`,
          fontStyle: bold ? 'bold' : '',
          color: cssColor(this.look.era.fg),
        })
        .setOrigin(0.5)
        .setAlpha(alpha);
      this.layer.add(t);
      return t;
    };

    text(cx, 26, this.lesson.title, 16, 0.6);
    text(width - 40, 26, `${this.page + 1}/${this.lesson.pages.length}`, 16, 0.6).setOrigin(1, 0.5);
    text(cx, 70, page.title, 30, 1, true);

    this.layer.add(drawDiagram(this, page.diagram, cx, 205, this.look.era));

    page.lines.forEach((line, i) => text(cx, 340 + i * 32, line, 20));
    text(cx, 450, page.analogy, 18, 0.75);
    text(
      cx,
      508,
      last
        ? `[<-] BACK      [ENTER] ${this.finishLabel()}`
        : `[<-] BACK      [ENTER] NEXT${this.mandatory ? '' : '      [Q] SKIP'}`,
      16,
      0.6,
    );
  }
}
