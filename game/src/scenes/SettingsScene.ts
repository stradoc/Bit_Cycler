import { Conductor } from '../audio/conductor.ts';
import { audioOf, setVolume, startHum, stopHum, toggleHum } from '../audio/sound.ts';
import { filePath } from '../data/menuFiles.ts';
import { getSettings, updateSettings } from '../settings.ts';
import { ERAS } from '../ui/eras.ts';
import { ListMenu } from '../ui/list.ts';
import { Screen } from '../ui/screen.ts';
import { ALPHA, LAYOUT, TEXT } from '../ui/theme.ts';
import { WIDTH } from '../visual/display.ts';

const CALIBRATION_BPM = 120;
const OFFSET_STEP_MS = 5;

type Row = 'relaxed' | 'calibrate' | 'volume' | 'hum' | 'crt' | 'era' | 'dark' | 'back';
const ROWS: readonly Row[] = ['relaxed', 'calibrate', 'volume', 'hum', 'crt', 'era', 'dark', 'back'];

const ABOUT: Readonly<Record<Row, string>> = {
  relaxed: 'WIDER TIMING WINDOWS AND THE BEAT AT 80%: FOR LEARNING, OR WHEN THE BEAT IS TOO FAST.',
  calibrate: 'LINE THE LIGHT UP WITH THE CLICK, SO NOTES ARE JUDGED BY WHAT YOU HEAR.',
  volume: 'EVERY SOUND IN THE GAME.',
  hum: "THE OLD COMPUTER'S HUM IN THE MENUS: FAN, MAINS HUM, HARD DRIVE.",
  crt: 'SCANLINES, GLOW, CURVE AND FLICKER ON THE CRT SCREENS. TURN THEM DOWN IF THEY TIRE YOUR EYES.',
  era: "THE SCREEN'S LOOK: GREEN CRT, DOS, 90s DESKTOP, MODERN TERMINAL. A PREVIEW FOR NOW.",
  dark: 'DARK WINDOWS FOR THE 90s DESKTOP.',
  back: 'BACK TO THE MAIN MENU.',
};

const onOff = (on: boolean) => (on ? 'ON' : 'OFF');
const percent = (value: number) => `${Math.round(value * 100)}%`;

/** Settings: relaxed mode, audio calibration, volume, the menu hum, CRT effects, the era and dark mode. */
export class SettingsScene extends Screen {
  private menu!: ListMenu;
  private about!: Phaser.GameObjects.Text;
  private readout!: Phaser.GameObjects.Text;
  private ledBase!: Phaser.GameObjects.Rectangle;
  private ledLight!: Phaser.GameObjects.Rectangle;
  private calibration: Conductor | undefined;
  private lastBeat = -1;

  constructor() {
    super('settings');
  }

  init(): void {
    this.calibration = undefined;
    this.lastBeat = -1;
  }

  create(data?: { selected?: number }): void {
    this.setUp();
    const { era } = this;
    this.header(filePath(era, [], 'SETTINGS', 'CFG'), 'HOW THE GAME PLAYS, SOUNDS AND LOOKS.');
    this.menu = new ListMenu(this, era, { x: 250, top: 112, width: 460, rowHeight: 34, size: 18 });
    this.menu.setRows(this.rows(), data?.selected ?? 0);
    this.ledBase = this.add.rectangle(WIDTH / 2, 410, 20, 20, era.dim).setVisible(false);
    this.ledLight = this.add.rectangle(WIDTH / 2, 410, 20, 20, era.fg).setAlpha(0);
    this.about = this.aboutLine();
    // The calibration's readout, where the other screens put their messages.
    this.readout = this.text(WIDTH / 2, LAYOUT.message, '', TEXT.small + 1).setAlpha(ALPHA.about);
    this.hints('[UP/DOWN] CHOOSE', '[LEFT/RIGHT] CHANGE', '[ENTER] SELECT', '[Q] BACK');
    this.showAbout();
    this.events.once('shutdown', () => this.calibration?.stop());
  }

  update(): void {
    super.update();
    if (!this.calibration) return;
    const beat = Math.floor(this.calibration.currentBeat());
    if (beat < 0 || beat === this.lastBeat) return;
    this.lastBeat = beat;
    // Every beat flashes fully; the downbeat also pulses larger.
    this.tweens.killTweensOf(this.ledLight);
    this.ledLight.setAlpha(1).setScale(beat % 4 === 0 ? 1.6 : 1);
    this.tweens.add({ targets: this.ledLight, alpha: 0, scale: 1, duration: 180 });
    this.showReadout();
  }

  private rows(): { label: string; value?: string; dim?: boolean }[] {
    const s = getSettings();
    const offsetMs = Math.round(s.offset * 1000);
    const hasDark = Boolean(ERAS.at(s.eraIndex)?.dark);
    const values: Record<Row, [string, string | undefined]> = {
      relaxed: ['RELAXED MODE', onOff(s.relaxed)],
      calibrate: ['CALIBRATE AUDIO', `${offsetMs > 0 ? '+' : ''}${offsetMs} MS`],
      volume: ['VOLUME', percent(s.volume)],
      hum: ['COMPUTER HUM', onOff(s.music)],
      crt: ['CRT EFFECTS', percent(s.crt)],
      era: ['ERA', ERAS.at(s.eraIndex)?.name ?? ''],
      dark: ['DARK MODE', hasDark ? onOff(s.dark) : '32-BIT ONLY'],
      back: ['BACK', undefined],
    };
    return ROWS.map((row) => ({ label: values[row][0], value: values[row][1], dim: row === 'dark' && !hasDark }));
  }

  private refresh(): void {
    this.menu.setRows(this.rows());
    this.showAbout();
  }

  private showAbout(): void {
    this.about.setText(ABOUT[ROWS[this.menu.selected]]);
  }

  protected onKey(key: string): boolean | void {
    if (this.menu.busy) return true;
    if (this.calibration) {
      // Calibrating: the arrows move the offset; Enter or Q stops.
      if (key === 'ArrowLeft' || key === 'ArrowRight') this.adjustOffset(key === 'ArrowLeft' ? -OFFSET_STEP_MS : OFFSET_STEP_MS);
      else if (key === 'Enter' || key === ' ' || key === 'Escape' || key === 'Q') this.toggleCalibration();
      return true;
    }
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      this.menu.move(key === 'ArrowUp' ? -1 : 1);
      this.showAbout();
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      this.change(ROWS[this.menu.selected], key === 'ArrowLeft' ? -1 : 1);
    } else if (key === 'Enter' || key === ' ') {
      const row = ROWS[this.menu.selected];
      this.cue('confirm');
      this.menu.press(() => (row === 'back' ? this.scene.start('title', { selected: 'settings' }) : row === 'calibrate' ? this.toggleCalibration() : this.change(row, 1)));
    } else if (key === 'Escape' || key === 'Q') {
      this.back('title', { selected: 'settings' });
    } else return false;
    return true;
  }

  protected humToggled(): void {
    this.refresh();
  }

  /** Left (-1) or right (+1) on a row: on / off settings flip, the others step. */
  private change(row: Row, step: number): void {
    const s = getSettings();
    switch (row) {
      case 'relaxed':
        updateSettings({ relaxed: !s.relaxed });
        break;
      case 'volume':
        setVolume(audioOf(this), Phaser.Math.Clamp(Math.round(s.volume * 10 + step) / 10, 0, 1));
        break;
      case 'hum':
        toggleHum(this);
        break;
      case 'crt':
        updateSettings({ crt: Phaser.Math.Clamp(Math.round(s.crt * 4 + step) / 4, 0, 1) });
        return this.rebuild();
      case 'era':
        updateSettings({ eraIndex: Phaser.Math.Wrap(s.eraIndex + step, 0, ERAS.length) });
        return this.rebuild();
      case 'dark':
        if (!ERAS.at(s.eraIndex)?.dark) return this.cue('error');
        updateSettings({ dark: !s.dark });
        return this.rebuild();
      default:
        return;
    }
    this.cue('move');
    this.refresh();
  }

  /** The screen's look changed: rebuilt, so every text and effect picks it up. */
  private rebuild(): void {
    this.cue('move');
    this.scene.restart({ selected: this.menu.selected });
  }

  private toggleCalibration(): void {
    if (this.calibration) {
      this.calibration.stop();
      this.calibration = undefined;
      this.ledBase.setVisible(false);
      this.readout.setText('');
      startHum(this);
      return;
    }
    const ctx = audioOf(this);
    if (!ctx) return;
    void ctx.resume();
    // Calibration needs to hear the click alone.
    stopHum();
    this.calibration = new Conductor(ctx, CALIBRATION_BPM);
    this.calibration.offset = getSettings().offset;
    this.calibration.start();
    this.lastBeat = -1;
    this.ledBase.setVisible(true);
    this.showReadout();
  }

  private adjustOffset(deltaMs: number): void {
    if (!this.calibration) return;
    const offset = getSettings().offset + deltaMs / 1000;
    updateSettings({ offset });
    this.calibration.offset = offset;
    this.refresh();
    this.showReadout();
  }

  private showReadout(): void {
    if (!this.calibration) return;
    const latencyMs = Math.round((this.calibration.ctx.currentTime - this.calibration.heardTime()) * 1000);
    const offsetMs = Math.round(getSettings().offset * 1000);
    this.readout.setText(`LATENCY ${latencyMs} MS   OFFSET ${offsetMs > 0 ? '+' : ''}${offsetMs} MS   [LEFT/RIGHT] MATCH LIGHT TO CLICK   [ENTER] DONE`);
  }
}
