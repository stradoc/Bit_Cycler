import { Conductor } from '../audio/conductor.ts';
import { cssColor, ERAS, TerminalLook } from '../visual/terminal.ts';

const BPM = 120;
const OFFSET_STEP_MS = 5;
const CURSOR_BLINK_MS = 530;
const ERA_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'] as const;

/** Placeholder title: proves tsc -> Phaser -> WebGL FX -> Web Audio all work together. */
export class TitleScene extends Phaser.Scene {
  private conductor: Conductor | undefined;
  private look!: TerminalLook;
  private title!: Phaser.GameObjects.Text;
  private ledBase!: Phaser.GameObjects.Rectangle;
  private ledLight!: Phaser.GameObjects.Rectangle;
  private prompt!: Phaser.GameObjects.Text;
  private readout!: Phaser.GameObjects.Text;
  private promptText = 'CLICK OR PRESS ANY KEY';
  private cursorOn = true;
  private lastBeat = -1;

  constructor() {
    super('title');
  }

  create(): void {
    const { width, height } = this.scale;
    const ledY = height / 2 + 20;
    const style = { fontFamily: 'monospace' };

    this.title = this.add.text(width / 2, height / 2 - 30, 'BIT CYCLER', { ...style, fontSize: '32px' }).setOrigin(0.5);

    // A dim LED that is always visible, with a bright light on top that flashes each beat.
    this.ledBase = this.add.rectangle(width / 2, ledY, 10, 10);
    this.ledLight = this.add.rectangle(width / 2, ledY, 10, 10).setAlpha(0);

    this.prompt = this.add.text(width / 2, height / 2 + 50, '', { ...style, fontSize: '10px' }).setOrigin(0.5);
    this.readout = this.add.text(width / 2, height - 16, '', { ...style, fontSize: '8px' }).setOrigin(0.5).setAlpha(0.6);

    // ?era=1..4 in the URL picks the starting look (handy for previews).
    const eraParam = Number(new URLSearchParams(location.search).get('era'));
    const startEra = ERAS.at(eraParam - 1) ?? ERAS[0];
    this.look = new TerminalLook(this, startEra);
    this.restyle();
    this.renderPrompt();

    this.time.addEvent({
      delay: CURSOR_BLINK_MS,
      loop: true,
      callback: () => {
        this.cursorOn = !this.cursorOn;
        this.renderPrompt();
      },
    });

    // Browsers only allow audio after a user gesture.
    this.input.once('pointerdown', () => this.startClock());
    this.input.keyboard?.once('keydown', () => this.startClock());
    this.input.keyboard?.on('keydown-LEFT', () => this.adjustOffset(-OFFSET_STEP_MS));
    this.input.keyboard?.on('keydown-RIGHT', () => this.adjustOffset(OFFSET_STEP_MS));
    // Preview eras until CPU upgrades exist to drive them.
    ERA_KEYS.forEach((key, i) => {
      this.input.keyboard?.on(`keydown-${key}`, () => {
        this.look.setEra(ERAS[i]);
        this.restyle();
      });
    });
  }

  update(): void {
    this.look.update();
    if (!this.conductor) return;
    const beat = Math.floor(this.conductor.currentBeat());
    if (beat < 0 || beat === this.lastBeat) return;
    this.lastBeat = beat;

    // Every beat flashes fully; the downbeat also pulses larger.
    const downbeat = beat % 4 === 0;
    this.tweens.killTweensOf(this.ledLight);
    this.ledLight.setAlpha(1).setScale(downbeat ? 1.6 : 1);
    this.tweens.add({ targets: this.ledLight, alpha: 0, scale: 1, duration: 180 });
  }

  private restyle(): void {
    const { fg, dim } = this.look.era;
    for (const text of [this.title, this.prompt, this.readout]) text.setColor(cssColor(fg));
    this.ledBase.setFillStyle(dim);
    this.ledLight.setFillStyle(fg);
    this.updateReadout();
  }

  private renderPrompt(): void {
    this.prompt.setText(`${this.promptText}${this.cursorOn ? '█' : ' '}`);
  }

  private startClock(): void {
    if (this.conductor) return;
    if (!(this.sound instanceof Phaser.Sound.WebAudioSoundManager)) {
      this.promptText = 'WEB AUDIO NOT AVAILABLE';
      this.renderPrompt();
      return;
    }
    const ctx = this.sound.context;
    void ctx.resume();
    this.conductor = new Conductor(ctx, BPM);
    this.conductor.start();
    this.promptText = `CLOCK: ${BPM} BPM`;
    this.renderPrompt();
    this.updateReadout();
    // Refresh the latency figure as the audio device settles.
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.updateReadout() });
  }

  private adjustOffset(deltaMs: number): void {
    if (!this.conductor) return;
    this.conductor.offset += deltaMs / 1000;
    this.updateReadout();
  }

  private updateReadout(): void {
    const era = `${this.look.era.name} TERMINAL [1-4]`;
    if (!this.conductor) {
      this.readout.setText(era);
      return;
    }
    const latencyMs = Math.round((this.conductor.ctx.currentTime - this.conductor.heardTime()) * 1000);
    const offsetMs = Math.round(this.conductor.offset * 1000);
    const sign = offsetMs > 0 ? '+' : '';
    this.readout.setText(`${era}   LATENCY ${latencyMs} MS   OFFSET ${sign}${offsetMs} MS [<-/->]`);
  }
}
