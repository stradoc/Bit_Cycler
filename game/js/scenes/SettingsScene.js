import { Conductor } from '../audio/conductor.js';
import { audioOf, setVolume, startHum, stopHum, toggleHum } from '../audio/sound.js';
import { filePath } from '../data/menuFiles.js';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../rhythm/tempo.js';
import { eraseEverything } from '../save.js';
import { getSettings, updateSettings } from '../settings.js';
import { baseEra, cssColor } from '../ui/eras.js';
import { ListMenu } from '../ui/list.js';
import { Screen } from '../ui/screen.js';
import { ALPHA, LAYOUT, TEXT } from '../ui/theme.js';
import { WIDTH } from '../visual/display.js';
const CALIBRATION_BPM = 120;
const OFFSET_STEP_MS = 5;
const ROWS = ['difficulty', 'tutorial', 'calibrate', 'volume', 'hum', 'crt', 'dark', 'restart', 'back'];
/** The tutorial choices, in the order left / right steps through them, and how each is shown. */
const TUTORIALS = ['full', 'short', 'skip'];
const TUTORIAL_NAMES = { full: 'FULL', short: 'SHORT', skip: 'OFF' };
const percent = (value) => `${Math.round(value * 100)}%`;
const ABOUT = {
    difficulty: `HOW FAST SONGS GO: ${DIFFICULTY_ORDER.map((d) => `${DIFFICULTIES[d].name} ${percent(DIFFICULTIES[d].speed)}`).join(', ')}. RELAXED ALSO WIDENS THE TIMING. THE PAY IS THE SAME.`,
    tutorial: "HOW MUCH TICK TEACHES: FULL (EVERY INSTRUCTION UP CLOSE), SHORT (EACH NEW PART) OR OFF. BRIEFS HAS EVERY LESSON EITHER WAY.",
    calibrate: 'LINE THE LIGHT UP WITH THE CLICK, SO NOTES ARE JUDGED BY WHAT YOU HEAR.',
    volume: 'EVERY SOUND IN THE GAME.',
    hum: "THE OLD COMPUTER'S HUM IN THE MENUS: FAN, MAINS HUM, HARD DRIVE.",
    crt: 'SCANLINES, GLOW, CURVE AND FLICKER ON THE CRT SCREENS. TURN THEM DOWN IF THEY TIRE YOUR EYES.',
    dark: 'DARK WINDOWS FOR THE 90s DESKTOP.',
    restart: "ERASES EVERY SAVE (ALL 3 SLOTS) AND STARTS OVER WITH TICK'S TUTORIAL. SOUND AND SCREEN SETTINGS STAY. TO KEEP A SAVE, EXPORT IT FIRST (SAVES).",
    back: 'BACK TO THE MAIN MENU.',
};
const onOff = (on) => (on ? 'ON' : 'OFF');
/** Settings: the difficulty, the tutorial, audio calibration, volume, the menu hum, CRT effects and dark mode. The era follows your CPU chip. */
export class SettingsScene extends Screen {
    menu;
    about;
    readout;
    ledBase;
    ledLight;
    calibration;
    /** START OVER was pressed once: the next Enter on it erases everything. */
    confirmRestart = false;
    lastBeat = -1;
    /** Where BACK goes: the board or the shop when opened from the pause menu, the main menu otherwise. */
    returnTo;
    constructor() {
        super('settings');
    }
    init() {
        this.calibration = undefined;
        this.confirmRestart = false;
        this.lastBeat = -1;
    }
    create(data) {
        this.returnTo = data?.returnTo;
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
    update() {
        super.update();
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
        this.showReadout();
    }
    rows() {
        const s = getSettings();
        const offsetMs = Math.round(s.offset * 1000);
        const hasDark = Boolean(baseEra().dark);
        const values = {
            difficulty: ['DIFFICULTY', DIFFICULTIES[s.difficulty].name],
            tutorial: ['TUTORIAL (TICK)', TUTORIAL_NAMES[s.tutorial] ?? 'FULL'],
            calibrate: ['CALIBRATE AUDIO', `${offsetMs > 0 ? '+' : ''}${offsetMs} MS`],
            volume: ['VOLUME', percent(s.volume)],
            hum: ['COMPUTER HUM', onOff(s.music)],
            crt: ['CRT EFFECTS', percent(s.crt)],
            dark: ['DARK MODE', hasDark ? onOff(s.dark) : '32-BIT ONLY'],
            restart: [this.confirmRestart ? 'START OVER: PRESS ENTER AGAIN' : 'START OVER (ERASE EVERYTHING)', undefined],
            back: ['BACK', undefined],
        };
        return ROWS.map((row) => ({ label: values[row][0], value: values[row][1], dim: row === 'dark' && !hasDark }));
    }
    refresh() {
        this.menu.setRows(this.rows());
        this.showAbout();
    }
    showAbout() {
        const row = ROWS[this.menu.selected];
        const back = this.returnTo === 'shop' ? 'BACK TO THE SHOP.' : this.returnTo ? 'BACK TO THE CONTRACT BOARD.' : ABOUT.back;
        this.about.setText(row === 'back' ? back : ABOUT[row]);
    }
    onKey(key) {
        if (this.menu.busy)
            return true;
        if (this.calibration) {
            // Calibrating: the arrows move the offset; Enter or Q stops.
            if (key === 'ArrowLeft' || key === 'ArrowRight')
                this.adjustOffset(key === 'ArrowLeft' ? -OFFSET_STEP_MS : OFFSET_STEP_MS);
            else if (key === 'Enter' || key === ' ' || key === 'Escape' || key === 'Q')
                this.toggleCalibration();
            return true;
        }
        if (key === 'ArrowUp' || key === 'ArrowDown') {
            this.cancelRestart();
            this.menu.move(key === 'ArrowUp' ? -1 : 1);
            this.showAbout();
        }
        else if (key === 'ArrowLeft' || key === 'ArrowRight') {
            this.change(ROWS[this.menu.selected], key === 'ArrowLeft' ? -1 : 1);
        }
        else if (key === 'Enter' || key === ' ') {
            const row = ROWS[this.menu.selected];
            if (row === 'restart') {
                this.restart();
                return true;
            }
            this.cue('confirm');
            this.menu.press(() => (row === 'back' ? this.leave() : row === 'calibrate' ? this.toggleCalibration() : this.change(row, 1)));
        }
        else if (key === 'Escape' || key === 'Q') {
            this.leave();
        }
        else
            return false;
        return true;
    }
    humToggled() {
        this.refresh();
    }
    /** Left (-1) or right (+1) on a row: on / off settings flip, the others step. */
    change(row, step) {
        const s = getSettings();
        switch (row) {
            case 'difficulty':
                updateSettings({ difficulty: DIFFICULTY_ORDER[(DIFFICULTY_ORDER.indexOf(s.difficulty) + step + DIFFICULTY_ORDER.length) % DIFFICULTY_ORDER.length] });
                break;
            case 'tutorial':
                updateSettings({ tutorial: TUTORIALS[(TUTORIALS.indexOf(s.tutorial) + step + TUTORIALS.length) % TUTORIALS.length] });
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
            case 'dark':
                if (!baseEra().dark)
                    return this.cue('error');
                updateSettings({ dark: !s.dark });
                return this.rebuild();
            default:
                return;
        }
        this.cue('move');
        this.refresh();
    }
    /** The screen's look changed: rebuilt, so every text and effect picks it up. */
    rebuild() {
        this.cue('move');
        this.scene.restart({ selected: this.menu.selected, returnTo: this.returnTo });
    }
    toggleCalibration() {
        if (this.calibration) {
            this.calibration.stop();
            this.calibration = undefined;
            this.ledBase.setVisible(false);
            this.readout.setText('');
            startHum(this);
            return;
        }
        const ctx = audioOf(this);
        if (!ctx)
            return;
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
    adjustOffset(deltaMs) {
        if (!this.calibration)
            return;
        const offset = getSettings().offset + deltaMs / 1000;
        updateSettings({ offset });
        this.calibration.offset = offset;
        this.refresh();
        this.showReadout();
    }
    showReadout() {
        if (!this.calibration)
            return;
        const latencyMs = Math.round((this.calibration.ctx.currentTime - this.calibration.heardTime()) * 1000);
        const offsetMs = Math.round(getSettings().offset * 1000);
        this.readout.setText(`LATENCY ${latencyMs} MS   OFFSET ${offsetMs > 0 ? '+' : ''}${offsetMs} MS   [LEFT/RIGHT] MATCH LIGHT TO CLICK   [ENTER] DONE`);
    }
    /** Back to where the settings were opened from. */
    leave() {
        if (this.returnTo)
            this.back(this.returnTo);
        else
            this.back('title', { selected: 'settings' });
    }
    /**
     * START OVER: the first Enter asks again, the second erases every save and
     * TICK's memory of welcoming you, and the main menu opens to his hello.
     */
    restart() {
        if (!this.confirmRestart) {
            this.confirmRestart = true;
            this.cue('error');
            this.readout.setText('THIS ERASES EVERY SAVE. PRESS ENTER AGAIN TO START OVER, OR MOVE AWAY TO KEEP THEM.').setColor(cssColor(this.colors.warn));
            this.refresh();
            return;
        }
        eraseEverything();
        updateSettings({ welcomed: false, tutorial: 'full' });
        this.back('title');
    }
    cancelRestart() {
        if (!this.confirmRestart)
            return;
        this.confirmRestart = false;
        this.readout.setText('').setColor(cssColor(this.era.fg));
        this.refresh();
    }
}
//# sourceMappingURL=SettingsScene.js.map