import { audioOf, powerOn, startHum, startupChime } from '../audio/sound.ts';
import { bootScript, type BootSound, type BootStep } from '../data/boot.ts';
import { banner } from '../data/menuFiles.ts';
import { activeSlot, getProgress, hasSave, slotName } from '../save.ts';
import { getSettings, updateSettings } from '../settings.ts';
import { cssColor } from '../ui/eras.ts';
import { Screen } from '../ui/screen.ts';
import { HEIGHT, WIDTH } from '../visual/display.ts';

const LEFT = 36;
const TOP = 34;
const LINE_H = 22;
const MAX_LINES = 21;
const CURSOR_BLINK_MS = 530;
/** After the first time, the boot runs this much faster (waits multiplied by it). */
const FAST = 0.5;
/** The dark moment between the screen coming on and the first line (ms): a real CRT took a while to warm up. */
const WARM_UP_MS = 1100;
/** How fast the loading scroll pours out, per line (ms). */
const SCROLL_MS = 24;
/** Tags of a modern boot log: "[  OK  ]" in green, "[ WARN ]" in orange. */
const TAGS = { OK: '[  OK  ] ', WARN: '[ WARN ] ' } as const;

/**
 * The intro: a dark screen waits for a key (the power button; browsers only
 * play sound after one), the screen comes on (a CRT's line opening out, or an
 * LCD's backlight), the computer reports its hardware from the save
 * (data/boot.ts), and commands type themselves to start the game. Any key
 * skips to the main menu.
 */
export class BootScene extends Screen {
  private stage: 'off' | 'on' | 'done' = 'off';
  private steps: BootStep[] = [];
  private index = 0;
  private speed = 1;
  /** Lines on screen, each one or two texts (a log tag and its line). */
  private rows: Phaser.GameObjects.Text[][] = [];
  private cursor!: Phaser.GameObjects.Text;
  /** "Press any key to power on". */
  private standby: Phaser.GameObjects.Text | undefined;
  private fg = 0;

  constructor() {
    super('boot');
  }

  init(): void {
    this.stage = 'off';
    this.index = 0;
    this.rows = [];
  }

  create(): void {
    // Every era boots on black, so all of them can glow; the era's window or DOS bars only appear once the
    // program is running, and the hum starts with the power button.
    this.setUp({ hum: false, glow: 'boot', windowed: false });
    const { era } = this;
    // DOS and the 90s desktop boot in a PC's plain gray text on black; their program's screen comes after.
    this.fg = era.computer.bootText;
    this.cameras.main.setBackgroundColor(0x000000);
    this.speed = getSettings().bootSeen ? FAST : 1;
    this.steps = bootScript(hasSave() ? getProgress() : null, { id: activeSlot(), name: slotName(activeSlot()) }, era);

    const off = this.text(WIDTH / 2, HEIGHT / 2, 'PRESS ANY KEY TO POWER ON', 14).setColor('#808080').setAlpha(0.6);
    this.standby = off;
    // The power prompt breathes slowly, like a standby light.
    this.tweens.add({ targets: off, alpha: 0.2, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.cursor = this.line(0, 0, '█').setVisible(false);
    this.time.addEvent({
      delay: CURSOR_BLINK_MS,
      loop: true,
      callback: () => this.cursor.setAlpha(this.cursor.alpha > 0 ? 0 : 1),
    });

    this.input.on('pointerdown', () => this.press());
  }

  /** Any key or click: the power button, then (while it boots) skip to the menu. */
  protected onKey(): boolean {
    this.press();
    return true;
  }

  private press(): void {
    if (this.stage !== 'off') return this.finish();
    this.standby?.destroy();
    this.powerOn();
  }

  /** A line of the boot's text (top-left at x, y). */
  private line(x: number, y: number, content: string, color = this.fg): Phaser.GameObjects.Text {
    return this.textAt(x, y, content, 16).setColor(cssColor(color));
  }

  /** The power button: the screen comes on, then the boot starts. */
  private powerOn(): void {
    this.stage = 'on';
    void audioOf(this)?.resume();
    const { era } = this;
    powerOn(this, era);
    // The power supply's fan and the hard drive start turning with the switch, and take a few seconds to reach speed.
    this.time.delayedCall(150, () => startHum(this, true));
    if (era.computer.display === 'lcd') {
      // An LCD's backlight fades up, and the terminal window is already open.
      this.look.setWindowed(true);
      this.cameras.main.setBackgroundColor(era.screen.frame?.desk ?? era.bg).fadeIn(600, 0, 0, 0);
      this.time.delayedCall(WARM_UP_MS, () => this.next());
      return;
    }
    // A CRT: a bright line across the middle, opening out to the whole screen.
    const beam = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, 3, era.computer.beam).setScale(0, 1);
    this.tweens.chain({
      targets: beam,
      tweens: [
        { scaleX: 1, duration: 140, ease: 'Cubic.Out' },
        { scaleY: HEIGHT / 3, alpha: 0, duration: 260, ease: 'Cubic.In' },
      ],
      onComplete: () => {
        beam.destroy();
        this.time.delayedCall(WARM_UP_MS, () => this.next());
      },
    });
  }

  /** Waits `ms` (shorter after the first boot), then runs `then`. */
  private wait(ms: number, then: () => void): void {
    this.time.delayedCall(ms * this.speed, then);
  }

  /** Runs the next step of the boot script. */
  private next(): void {
    if (this.stage !== 'on') return;
    const step = this.steps[this.index++];
    if (!step) return this.wait(600, () => this.splash());
    switch (step.kind) {
      case 'print':
        return this.wait(step.pause ?? 130, () => {
          this.addLine(step.text, step.tag);
          if (step.text) this.cue('line');
          this.playStepSound(step.sound);
          this.next();
        });
      case 'count': {
        const line = this.addLine(`${step.text}0`);
        let n = 0;
        let counted = false;
        const timer = this.time.addEvent({
          delay: 60 * this.speed,
          loop: true,
          callback: () => {
            // Once only: on slow frames Phaser runs a looping timer's callback several times in one update,
            // and one removed partway through that can still fire once more (which started a second boot).
            if (counted) return;
            n = Math.min(step.to, n + 2);
            line.setText(`${step.text}${n}${n === step.to ? step.done : ''}`);
            this.placeCursor();
            if (n < step.to) return;
            counted = true;
            timer.remove();
            this.playStepSound(step.sound);
            this.next();
          },
        });
        return;
      }
      case 'type': {
        const line = this.addLine(step.prompt);
        return this.wait(650, () => this.typeInto(line, step.prompt, step.text, 0, step.sound));
      }
      case 'scroll':
        return this.wait(300, () => {
          this.playStepSound(step.sound);
          this.pour(step.lines, 0);
        });
      case 'clear':
        return this.wait(500, () => {
          for (const row of this.rows) for (const part of row) part.destroy();
          this.rows = [];
          this.cursor.setVisible(false);
          this.next();
        });
    }
  }

  /** Types `text` after `prompt` a key at a time, at a person's uneven pace, then Enter (and the command's `sound`). */
  private typeInto(line: Phaser.GameObjects.Text, prompt: string, text: string, typed: number, sound?: BootSound): void {
    if (this.stage !== 'on') return;
    if (typed >= text.length) {
      return this.wait(250, () => {
        this.cue('enter');
        this.wait(150, () => this.playStepSound(sound));
        this.wait(550, () => this.next());
      });
    }
    this.cue(text[typed] === ' ' ? 'space' : 'letter');
    line.setText(prompt + text.slice(0, typed + 1));
    this.placeCursor();
    this.wait(65 + Math.random() * 85, () => this.typeInto(line, prompt, text, typed + 1, sound));
  }

  /** A step's sound, if it has one, unless the boot was skipped. */
  private playStepSound(sound: BootSound | undefined): void {
    if (sound && this.stage === 'on') this.cue(sound);
  }

  /** Prints `lines` a frame or two apart, so the screen scrolls past faster than anyone can read. */
  private pour(lines: readonly string[], done: number): void {
    if (this.stage !== 'on') return;
    if (done >= lines.length) return this.wait(500, () => this.next());
    this.addLine(lines[done]).setAlpha(0.75);
    // Lines pouring out tick too, softly and only every few, or it would be a buzz.
    if (done % 3 === 0) this.cue('line', { volume: 0.5 });
    this.wait(SCROLL_MS, () => this.pour(lines, done + 1));
  }

  /** A new line at the bottom (scrolling up once the screen is full); returns its text. */
  private addLine(content: string, tag?: keyof typeof TAGS): Phaser.GameObjects.Text {
    if (this.rows.length >= MAX_LINES) {
      for (const part of this.rows.shift() ?? []) part.destroy();
      for (const row of this.rows) for (const part of row) part.y -= LINE_H;
    }
    const y = TOP + this.rows.length * LINE_H;
    const row: Phaser.GameObjects.Text[] = [];
    let x = LEFT;
    if (tag) {
      const { era } = this;
      const mark = this.line(x, y, TAGS[tag], tag === 'OK' ? era.syntax.op : this.colors.warn);
      row.push(mark);
      x += mark.width;
    }
    const line = this.line(x, y, content);
    row.push(line);
    this.rows.push(row);
    this.placeCursor();
    return line;
  }

  /** The block cursor sits after the last line. */
  private placeCursor(): void {
    const line = this.rows.at(-1)?.at(-1);
    if (!line) return;
    this.cursor.setPosition(line.x + line.width, line.y).setVisible(true);
  }

  /**
   * The title, as the program starts: the screen clears and BIT CYCLER
   * builds up in big block letters a row at a time, with the start-up chime
   * and the tagline under it; then on to the menu.
   */
  private splash(): void {
    if (this.stage !== 'on') return;
    for (const row of this.rows) for (const part of row) part.destroy();
    this.rows = [];
    this.cursor.setVisible(false);
    // On the black boot screen, the title in a bright color the era owns.
    const lines = banner('BIT CYCLER');
    const title = this.textAt(WIDTH / 2, 0, lines.join('\n'), 30).setColor(cssColor(this.era.computer.splash)).setLineSpacing(0);
    title.setScale(Math.min(1.6, 840 / title.width)).setOrigin(0.5, 0);
    // Placed by its full size, before it starts empty and builds up.
    const height = title.displayHeight;
    title.setY(HEIGHT / 2 - 40 - height / 2).setText('');
    const tagline = this.line(WIDTH / 2, title.y + height + 28, 'A CPU TYCOON WHERE EVERY BEAT IS ONE CLOCK CYCLE').setOrigin(0.5, 0).setAlpha(0);
    const chime = startupChime(this);
    lines.forEach((_, row) => {
      this.time.delayedCall(140 * row, () => {
        title.setText(lines.slice(0, row + 1).join('\n'));
        this.cue('line');
      });
    });
    this.tweens.add({ targets: tagline, alpha: 0.8, delay: 600, duration: 700 });
    // Hold for most of the chime (less after the first boot), then the menu.
    this.time.delayedCall(Math.max(2400, chime * 750) * (this.speed < 1 ? 0.7 : 1), () => this.finish());
  }

  /** On to the main menu (any key skips there). */
  private finish(): void {
    if (this.stage === 'done') return;
    this.stage = 'done';
    updateSettings({ bootSeen: true });
    this.scene.start('title', { fromBoot: true });
  }
}
