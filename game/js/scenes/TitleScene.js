import { Conductor } from '../audio/conductor.js';
const PHOSPHOR = 0x39ff14;
const PHOSPHOR_DIM = 0x0f4a06;
const BPM = 120;
/** Placeholder title: proves tsc -> Phaser -> WebGL FX -> Web Audio all work together. */
export class TitleScene extends Phaser.Scene {
    conductor;
    led;
    prompt;
    lastBeat = -1;
    constructor() {
        super('title');
    }
    create() {
        const { width, height } = this.scale;
        const title = this.add
            .text(width / 2, height / 2 - 30, 'BIT CYCLER', {
            fontFamily: 'monospace',
            fontSize: '32px',
            color: '#39ff14',
        })
            .setOrigin(0.5);
        title.postFX?.addGlow(PHOSPHOR, 1.5, 0, false, 0.2, 8);
        this.led = this.add.rectangle(width / 2, height / 2 + 20, 10, 10, PHOSPHOR_DIM);
        this.prompt = this.add
            .text(width / 2, height / 2 + 50, 'CLICK OR PRESS ANY KEY', {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#39ff14',
        })
            .setOrigin(0.5);
        // Browsers only allow audio after a user gesture.
        this.input.once('pointerdown', () => this.startClock());
        this.input.keyboard?.once('keydown', () => this.startClock());
    }
    update() {
        if (!this.conductor)
            return;
        const beat = Math.floor(this.conductor.currentBeat());
        if (beat < 0 || beat === this.lastBeat)
            return;
        this.lastBeat = beat;
        this.led.setFillStyle(beat % 4 === 0 ? PHOSPHOR : PHOSPHOR_DIM).setAlpha(1);
        this.tweens.add({ targets: this.led, alpha: 0.3, duration: 200 });
    }
    startClock() {
        if (this.conductor)
            return;
        if (!(this.sound instanceof Phaser.Sound.WebAudioSoundManager)) {
            this.prompt.setText('WEB AUDIO NOT AVAILABLE');
            return;
        }
        const ctx = this.sound.context;
        void ctx.resume();
        this.conductor = new Conductor(ctx, BPM);
        this.conductor.start();
        this.prompt.setText(`CLOCK: ${BPM} BPM`);
    }
}
//# sourceMappingURL=TitleScene.js.map