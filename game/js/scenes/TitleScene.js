import { Conductor } from '../audio/conductor.js';
import { keyOf, onKeyDown } from '../input/keys.js';
import { getSettings, updateSettings } from '../settings.js';
import { cssColor, ERAS, TerminalLook } from '../visual/terminal.js';
const CALIBRATION_BPM = 120;
const OFFSET_STEP_MS = 5;
const CURSOR_BLINK_MS = 530;
/** Title screen: start the game, calibrate audio, toggle relaxed mode, preview eras. */
export class TitleScene extends Phaser.Scene {
    look;
    calibration;
    texts = [];
    ledBase;
    ledLight;
    prompt;
    options;
    readout;
    cursorOn = true;
    lastBeat = -1;
    constructor() {
        super('title');
    }
    init() {
        this.calibration = undefined;
        this.texts = [];
        this.lastBeat = -1;
    }
    create() {
        const { width, height } = this.scale;
        const ledY = height / 2 + 24;
        const text = (y, size) => {
            const t = this.add.text(width / 2, y, '', { fontFamily: 'monospace', fontSize: `${size}px` }).setOrigin(0.5);
            this.texts.push(t);
            return t;
        };
        text(height / 2 - 80, 64).setText('BIT CYCLER');
        this.ledBase = this.add.rectangle(width / 2, ledY, 20, 20).setVisible(false);
        this.ledLight = this.add.rectangle(width / 2, ledY, 20, 20).setAlpha(0);
        this.prompt = text(height / 2 + 80, 20);
        this.options = text(height / 2 + 134, 16).setAlpha(0.7).setAlign('center').setLineSpacing(8);
        this.readout = text(height - 32, 16).setAlpha(0.6);
        // ?era=1..4 in the URL overrides the saved era (handy for previews).
        const eraParam = Number(new URLSearchParams(location.search).get('era'));
        if (eraParam >= 1 && eraParam <= ERAS.length)
            updateSettings({ eraIndex: eraParam - 1 });
        this.look = new TerminalLook(this, ERAS.at(getSettings().eraIndex) ?? ERAS[0]);
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
        this.events.once('shutdown', () => this.calibration?.stop());
    }
    update() {
        this.look.update();
        if (!this.calibration)
            return;
        const beat = Math.floor(this.calibration.currentBeat());
        if (beat < 0 || beat === this.lastBeat)
            return;
        this.lastBeat = beat;
        // Every beat flashes fully; the downbeat also pulses larger.
        this.tweens.killTweensOf(this.ledLight);
        this.ledLight.setAlpha(1).setScale(beat % 4 === 0 ? 1.6 : 1);
        this.tweens.add({ targets: this.ledLight, alpha: 0, scale: 1, duration: 180 });
    }
    bindKeys() {
        this.input.once('pointerdown', () => this.start());
        onKeyDown(this, (event) => {
            const key = keyOf(event);
            switch (key) {
                case 'Enter':
                    return this.start();
                case 'B':
                    return this.scene.start('briefing', { lessonId: 'tier1' });
                case 'P':
                    return this.scene.start('play', { practice: true });
                case 'C':
                    return this.toggleCalibration();
                case 'R':
                    updateSettings({ relaxed: !getSettings().relaxed });
                    return this.renderText();
                case 'ArrowLeft':
                    return this.adjustOffset(-OFFSET_STEP_MS);
                case 'ArrowRight':
                    return this.adjustOffset(OFFSET_STEP_MS);
            }
            // 1-4 preview eras until CPU upgrades exist to drive them.
            const era = ERAS.at(Number(key) - 1);
            if (era && /^[1-9]$/.test(key)) {
                updateSettings({ eraIndex: Number(key) - 1 });
                this.look.setEra(era);
                this.restyle();
            }
        });
    }
    /** First time: the briefing teaches the concept before anything is played. */
    start() {
        if (getSettings().seenLessons.includes('tier1'))
            this.scene.start('play');
        else
            this.scene.start('briefing', { lessonId: 'tier1' });
    }
    restyle() {
        const { fg, dim } = this.look.era;
        for (const t of this.texts)
            t.setColor(cssColor(fg));
        this.ledBase.setFillStyle(dim);
        this.ledLight.setFillStyle(fg);
        this.renderText();
    }
    renderText() {
        const settings = getSettings();
        const cursor = this.cursorOn ? '█' : ' ';
        this.prompt.setText(`PRESS ENTER TO START${cursor}`);
        this.options.setText(`[B] BRIEFING   [P] PRACTICE   [C] CALIBRATE\n[R] RELAXED: ${settings.relaxed ? 'ON' : 'OFF'}   [1-4] ERA: ${this.look.era.name}`);
        if (!this.calibration) {
            this.readout.setText('');
            return;
        }
        const latencyMs = Math.round((this.calibration.ctx.currentTime - this.calibration.heardTime()) * 1000);
        const offsetMs = Math.round(settings.offset * 1000);
        this.readout.setText(`LATENCY ${latencyMs} MS   OFFSET ${offsetMs > 0 ? '+' : ''}${offsetMs} MS   [<-/->] ALIGN LIGHT TO CLICK`);
    }
    toggleCalibration() {
        if (this.calibration) {
            this.calibration.stop();
            this.calibration = undefined;
            this.ledBase.setVisible(false);
            this.renderText();
            return;
        }
        if (!(this.sound instanceof Phaser.Sound.WebAudioSoundManager))
            return;
        const ctx = this.sound.context;
        void ctx.resume();
        this.calibration = new Conductor(ctx, CALIBRATION_BPM);
        this.calibration.offset = getSettings().offset;
        this.calibration.start();
        this.lastBeat = -1;
        this.ledBase.setVisible(true);
        this.renderText();
    }
    adjustOffset(deltaMs) {
        if (!this.calibration)
            return;
        const offset = getSettings().offset + deltaMs / 1000;
        updateSettings({ offset });
        this.calibration.offset = offset;
        this.renderText();
    }
}
//# sourceMappingURL=TitleScene.js.map