import { LESSONS, TIER1_LESSON, type Lesson } from '../data/lessons.ts';
import { keyOf, onKeyDown } from '../input/keys.ts';
import { getSettings, updateSettings } from '../settings.ts';
import { drawDiagram } from '../visual/diagrams.ts';
import { cssColor, ERAS, TerminalLook } from '../visual/terminal.ts';

/** Paged concept cards shown before a concept is practiced and played. */
export class BriefingScene extends Phaser.Scene {
  private look!: TerminalLook;
  private lesson: Lesson = TIER1_LESSON;
  private page = 0;
  private layer!: Phaser.GameObjects.Container;

  constructor() {
    super('briefing');
  }

  init(data?: { lessonId?: string }): void {
    this.lesson = LESSONS[data?.lessonId ?? TIER1_LESSON.id] ?? TIER1_LESSON;
    this.page = 0;
  }

  create(): void {
    this.look = new TerminalLook(this, ERAS.at(getSettings().eraIndex) ?? ERAS[0]);
    this.layer = this.add.container(0, 0);
    this.render();

    this.input.on('pointerdown', () => this.next());
    onKeyDown(this, (event) => {
      const key = keyOf(event);
      if (key === 'Enter' || key === ' ' || key === 'ArrowRight') this.next();
      else if (key === 'ArrowLeft') this.turn(-1);
      else if (key === 'Escape') this.scene.start('title');
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
    const seen = new Set(getSettings().seenLessons).add(this.lesson.id);
    updateSettings({ seenLessons: [...seen] });
    this.scene.start('play', { practice: true });
  }

  private turn(delta: number): void {
    const page = Phaser.Math.Clamp(this.page + delta, 0, this.lesson.pages.length - 1);
    if (page === this.page) return;
    this.page = page;
    this.render();
  }

  private render(): void {
    this.tweens.killAll();
    this.layer.removeAll(true);

    const { width } = this.scale;
    const cx = width / 2;
    const page = this.lesson.pages[this.page];
    const last = this.page === this.lesson.pages.length - 1;
    const text = (x: number, y: number, content: string, size: number, alpha = 1, bold = false) => {
      const t = this.add
        .text(x, y, content, {
          fontFamily: 'monospace',
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
      last ? '[<-] BACK      [ENTER] START PRACTICE' : '[<-] BACK      [ENTER] NEXT      [ESC] SKIP',
      16,
      0.6,
    );
  }
}
