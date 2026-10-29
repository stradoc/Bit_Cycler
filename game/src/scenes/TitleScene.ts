import { Conductor } from '../audio/conductor.ts';
import { playMenuMusic, stopMenuMusic, toggleMenuMusic, uiSound } from '../audio/menu.ts';
import { type Tier } from '../data/tiers.ts';
import { formatMhz, formatMoney } from '../format.ts';
import { keyOf, onKeyDown } from '../input/keys.ts';
import { getProgress, newGame } from '../save.ts';
import { getSettings, updateSettings } from '../settings.ts';
import { ratedMhz, tierOf } from '../sim/progress.ts';
import { cssColor, currentEra, ERAS, TerminalLook } from '../visual/terminal.ts';
import { HEIGHT, textBase, WIDTH } from '../visual/display.ts';

const CALIBRATION_BPM = 120;
const OFFSET_STEP_MS = 5;
const CURSOR_BLINK_MS = 530;

/** Title screen: go to the contract board, calibrate audio, toggle relaxed mode, preview eras, start over. */
export class TitleScene extends Phaser.Scene {
  private look!: TerminalLook;
  private calibration: Conductor | undefined;
  private texts: Phaser.GameObjects.Text[] = [];
  private ledBase!: Phaser.GameObjects.Rectangle;
  private ledLight!: Phaser.GameObjects.Rectangle;
  private prompt!: Phaser.GameObjects.Text;
  private options!: Phaser.GameObjects.Text;
  private readout!: Phaser.GameObjects.Text;
  private cursorOn = true;
  /** N was pressed once: press it again to really start a new game. */
  private confirmNewGame = false;
  private lastBeat = -1;

  constructor() {
    super('title');
  }

  init(): void {
    this.calibration = undefined;
    this.confirmNewGame = false;
    this.texts = [];
    this.lastBeat = -1;
  }

  create(): void {
    // ?era=1..4 in the URL overrides the saved era (handy for previews).
    const eraParam = Number(new URLSearchParams(location.search).get('era'));
    if (eraParam >= 1 && eraParam <= ERAS.length) updateSettings({ eraIndex: eraParam - 1 });
    // First, so the texts below get the era's font.
    this.look = new TerminalLook(this, currentEra());
    const [width, height] = [WIDTH, HEIGHT];
    const ledY = height / 2 + 24;
    const text = (y: number, size: number) => {
      const t = this.add.text(width / 2, y, '', { ...textBase(), fontSize: `${size}px` }).setOrigin(0.5);
      this.texts.push(t);
      return t;
    };

    text(height / 2 - 80, 64).setText('BIT CYCLER');
    this.ledBase = this.add.rectangle(width / 2, ledY, 20, 20).setVisible(false);
    this.ledLight = this.add.rectangle(width / 2, ledY, 20, 20).setAlpha(0);
    this.prompt = text(height / 2 + 80, 20);
    this.options = text(height / 2 + 134, 16).setAlpha(0.7).setAlign('center').setLineSpacing(8);
    this.readout = text(height - 32, 16).setAlpha(0.6);

    this.restyle();

    this.time.addEvent({
      delay: CURSOR_BLINK_MS,
      loop: true,
      callback: () => {
        this.cursorOn = !this.cursorOn;
        this.renderText();
      },
    });

    this.bindKeys();
    playMenuMusic(this);
    this.events.once('shutdown', () => this.calibration?.stop());
  }

  update(): void {
    this.look.update();
    if (!this.calibration) return;
    const beat = Math.floor(this.calibration.currentBeat());
    if (beat < 0 || beat === this.lastBeat) return;
    this.lastBeat = beat;

    // Every beat flashes fully; the downbeat also pulses larger.
    this.tweens.killTweensOf(this.ledLight);
    this.ledLight.setAlpha(1).setScale(beat % 4 === 0 ? 1.6 : 1);
    this.tweens.add({ targets: this.ledLight, alpha: 0, scale: 1, duration: 180 });
  }

  private bindKeys(): void {
    this.input.once('pointerdown', () => this.start());
    onKeyDown(this, (event) => {
      const key = keyOf(event);
      if (/^[BPNCRMD1-4]$/.test(key)) uiSound(this, 'move');
      switch (key) {
        case 'Enter':
          uiSound(this, 'confirm');
          return this.start();
        case 'M':
          toggleMenuMusic(this);
          return this.renderText();
        case 'B':
          return this.scene.start('briefing', { lessonId: this.tier().lessonId });
        case 'P':
          return this.scene.start(this.tier().scene, { practice: true, ...this.tier().options });
        case 'N':
          return this.startOver();
        case 'C':
          return this.toggleCalibration();
        case 'R':
          updateSettings({ relaxed: !getSettings().relaxed });
          return this.renderText();
        case 'D':
          // Dark mode, for an era that has a dark variant: rebuilt in its colors.
          if (!ERAS.at(getSettings().eraIndex)?.dark) return;
          updateSettings({ dark: !getSettings().dark });
          return this.scene.restart();
        case 'ArrowLeft':
          return this.adjustOffset(-OFFSET_STEP_MS);
        case 'ArrowRight':
          return this.adjustOffset(OFFSET_STEP_MS);
      }
      // 1-4 preview eras until CPU upgrades exist to drive them.
      const era = ERAS.at(Number(key) - 1);
      if (era && /^[1-9]$/.test(key)) {
        updateSettings({ eraIndex: Number(key) - 1 });
        // Rebuilt, so every text picks up the era's font and resolution.
        this.scene.restart();
      }
    });
  }

  /** The tier of the CPU the player owns: briefing (B) and practice (P) are for it. */
  private tier(): Tier {
    return tierOf(getProgress());
  }

  /** To the contract board; briefings for new parts come up when a contract is taken. */
  private start(): void {
    this.scene.start('board');
  }

  /** N twice: wipe the save (money, parts, upgrades, board) and start again. */
  private startOver(): void {
    if (!this.confirmNewGame) {
      this.confirmNewGame = true;
      return this.renderText();
    }
    newGame();
    this.confirmNewGame = false;
    this.renderText();
  }

  private restyle(): void {
    const { fg, dim, accent } = this.look.era;
    for (const t of this.texts) t.setColor(cssColor(fg));
    this.texts[0]?.setColor(cssColor(accent)); // the title
    this.ledBase.setFillStyle(dim);
    this.ledLight.setFillStyle(fg);
    this.renderText();
  }

  private renderText(): void {
    const settings = getSettings();
    const cursor = this.cursorOn ? '█' : ' ';
    this.prompt.setText(`PRESS ENTER TO START${cursor}`);
    this.options.setText(
      `${this.progressLabel()}\n[B] BRIEFING   [P] PRACTICE   [N] NEW GAME${this.confirmNewGame ? ': PRESS N AGAIN TO ERASE YOUR SAVE' : ''}\n` +
        `[C] CALIBRATE   [R] RELAXED: ${settings.relaxed ? 'ON' : 'OFF'}   [M] COMPUTER HUM: ${settings.music ? 'ON' : 'OFF'}   [1-4] ERA: ${this.look.era.name}` +
          (ERAS.at(settings.eraIndex)?.dark ? `   [D] DARK: ${settings.dark ? 'ON' : 'OFF'}` : ''),
    );

    if (!this.calibration) {
      this.readout.setText('');
      return;
    }
    const latencyMs = Math.round((this.calibration.ctx.currentTime - this.calibration.heardTime()) * 1000);
    const offsetMs = Math.round(settings.offset * 1000);
    this.readout.setText(
      `LATENCY ${latencyMs} MS   OFFSET ${offsetMs > 0 ? '+' : ''}${offsetMs} MS   [<-/->] ALIGN LIGHT TO CLICK`,
    );
  }

  private progressLabel(): string {
    const progress = getProgress();
    const tier = tierOf(progress);
    return `${formatMoney(progress.money)}   TIER ${tier.number}: ${tier.name} AT ${formatMhz(ratedMhz(progress))}`;
  }

  private toggleCalibration(): void {
    if (this.calibration) {
      this.calibration.stop();
      this.calibration = undefined;
      this.ledBase.setVisible(false);
      playMenuMusic(this);
      this.renderText();
      return;
    }
    if (!(this.sound instanceof Phaser.Sound.WebAudioSoundManager)) return;
    const ctx = this.sound.context;
    void ctx.resume();
    // Calibration needs to hear the click alone.
    stopMenuMusic();
    this.calibration = new Conductor(ctx, CALIBRATION_BPM);
    this.calibration.offset = getSettings().offset;
    this.calibration.start();
    this.lastBeat = -1;
    this.ledBase.setVisible(true);
    this.renderText();
  }

  private adjustOffset(deltaMs: number): void {
    if (!this.calibration) return;
    const offset = getSettings().offset + deltaMs / 1000;
    updateSettings({ offset });
    this.calibration.offset = offset;
    this.renderText();
  }
}
