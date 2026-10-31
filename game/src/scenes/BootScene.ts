import { bootSound, lineSound, loadMenuSounds, playMenuMusic, powerOnSound, startupChime, typeSound } from '../audio/menu.ts';
import { bootScript, type BootSound, type BootStep } from '../data/boot.ts';
import { banner } from '../data/menuFiles.ts';
import { onKeyDown } from '../input/keys.ts';
import { activeSlot, getProgress, hasSave, slotName } from '../save.ts';
import { getSettings, updateSettings } from '../settings.ts';
import { cssColor, currentEra, TerminalLook } from '../visual/terminal.ts';
import { HEIGHT, textBase, WIDTH } from '../visual/display.ts';

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
/** Extra glow on the boot's dark screen, like a bright terminal in a dark room. */
const BOOT_GLOW = 1.2;
/** Tags of a modern boot log: "[  OK  ]" in green, "[ WARN ]" in orange. */
const TAGS = { OK: '[  OK  ] ', WARN: '[ WARN ] ' } as const;

/**
 * The intro: a dark screen waits for a key (the power button; browsers only
 * play sound after one), the screen comes on (a CRT's line opening out, or an
 * LCD's backlight), the computer reports its hardware from the save
 * (data/boot.ts), and commands type themselves to start the game. Any key
 * skips to the main menu.
 */
export class BootScene extends Phaser.Scene {
  private look!: TerminalLook;
  private stage: 'off' | 'on' | 'done' = 'off';
  private steps: BootStep[] = [];
  private index = 0;
  private speed = 1;
  /** Lines on screen, each one or two texts (a log tag and its line). */
  private rows: Phaser.GameObjects.Text[][] = [];
  private cursor!: Phaser.GameObjects.Text;
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
    const era = currentEra();
    // The era's window or DOS bars only appear once the program is running.
    this.look = new TerminalLook(this, era, false);
    // DOS and the 90s desktop boot in a PC's plain gray text on black; their program's screen comes after.
    const plain = era.window?.style === 'dos' || era.window?.style === 'classic';
    this.fg = plain ? 0xaaaaaa : era.fg;
    this.cameras.main.setBackgroundColor(0x000000);
    // Every era boots on black, so all of them can glow.
    this.look.glow(BOOT_GLOW);
    this.speed = getSettings().bootSeen ? FAST : 1;
    loadMenuSounds(this);
    this.steps = bootScript(hasSave() ? getProgress() : null, { id: activeSlot(), name: slotName(activeSlot()) }, getSettings().eraIndex);

    const off = this.add
      .text(WIDTH / 2, HEIGHT / 2, 'PRESS ANY KEY TO POWER ON', { ...textBase(), fontSize: '14px', color: '#808080' })
      .setOrigin(0.5)
      .setAlpha(0.6);
    // The power prompt breathes slowly, like a standby light.
    this.tweens.add({ targets: off, alpha: 0.2, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.cursor = this.text(0, 0, '█').setVisible(false);
    this.time.addEvent({
      delay: CURSOR_BLINK_MS,
      loop: true,
      callback: () => this.cursor.setAlpha(this.cursor.alpha > 0 ? 0 : 1),
    });

    const press = () => {
      if (this.stage === 'off') {
        off.destroy();
        this.powerOn();
      } else {
        this.finish();
      }
    };
    onKeyDown(this, press);
    this.input.on('pointerdown', press);
  }

  update(): void {
    this.look.update();
  }

  private text(x: number, y: number, content: string, color = this.fg): Phaser.GameObjects.Text {
    return this.add.text(x, y, content, { ...textBase(), fontSize: '16px', color: cssColor(color) });
  }

  /** The power button: the screen comes on, then the boot starts. */
  private powerOn(): void {
    this.stage = 'on';
    if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) void this.sound.context.resume();
    const { era } = this.look;
    const lcd = era.lcd > 0;
    powerOnSound(this, !lcd);
    // The power supply's fan and the hard drive start turning with the switch, and take a few seconds to reach speed.
    this.time.delayedCall(150, () => playMenuMusic(this, true));
    if (lcd) {
      // An LCD's backlight fades up, and the terminal window is already open.
      this.look.setWindowed(true);
      this.cameras.main.setBackgroundColor(era.window?.desk ?? era.bg).fadeIn(600, 0, 0, 0);
      this.time.delayedCall(WARM_UP_MS, () => this.next());
      return;
    }
    // A CRT: a bright line across the middle, opening out to the whole screen.
    const beam = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, 3, era.window ? 0xffffff : era.fire[0]).setScale(0, 1);
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
          if (step.text) lineSound(this);
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
        typeSound(this, 'enter');
        this.wait(150, () => this.playStepSound(sound));
        this.wait(550, () => this.next());
      });
    }
    typeSound(this, text[typed] === ' ' ? 'space' : 'letter');
    line.setText(prompt + text.slice(0, typed + 1));
    this.placeCursor();
    this.wait(65 + Math.random() * 85, () => this.typeInto(line, prompt, text, typed + 1, sound));
  }

  /** A step's sound, if it has one, unless the boot was skipped. */
  private playStepSound(sound: BootSound | undefined): void {
    if (sound && this.stage === 'on') bootSound(this, sound);
  }

  /** Prints `lines` a frame or two apart, so the screen scrolls past faster than anyone can read. */
  private pour(lines: readonly string[], done: number): void {
    if (this.stage !== 'on') return;
    if (done >= lines.length) return this.wait(500, () => this.next());
    this.addLine(lines[done]).setAlpha(0.75);
    // Lines pouring out tick too, softly and only every few, or it would be a buzz.
    if (done % 3 === 0) lineSound(this, 0.5);
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
      const { era } = this.look;
      const mark = this.text(x, y, TAGS[tag], tag === 'OK' ? era.syntax.op : era.fire[1]);
      row.push(mark);
      x += mark.width;
    }
    const line = this.text(x, y, content);
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
    const { era } = this.look;
    // On the black boot screen, the title in a bright color the era owns.
    const color = era.window?.style === 'dos' ? 0x55ffff : era.window?.style === 'classic' ? 0xffffff : era.accent;
    const lines = banner('BIT CYCLER');
    const title = this.add.text(WIDTH / 2, 0, lines.join('\n'), { ...textBase(), fontSize: '30px', color: cssColor(color) }).setLineSpacing(0);
    title.setScale(Math.min(1.6, 840 / title.width)).setOrigin(0.5, 0);
    // Placed by its full size, before it starts empty and builds up.
    const height = title.displayHeight;
    title.setY(HEIGHT / 2 - 40 - height / 2).setText('');
    const tagline = this.text(WIDTH / 2, title.y + height + 28, 'A CPU TYCOON WHERE EVERY BEAT IS ONE CLOCK CYCLE').setOrigin(0.5, 0).setAlpha(0);
    const chime = startupChime(this);
    lines.forEach((_, row) => {
      this.time.delayedCall(140 * row, () => {
        title.setText(lines.slice(0, row + 1).join('\n'));
        lineSound(this);
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
