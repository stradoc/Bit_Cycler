import { playMenuMusic, uiSound } from '../audio/menu.js';
import { cheatFlags } from '../cheatFlags.js';
import { CLOCK, COOLING } from '../data/economy.js';
import { LESSONS } from '../data/lessons.js';
import { folderPath } from '../data/menuFiles.js';
import { formatMhz, formatMoney } from '../format.js';
import { getSettings } from '../settings.js';
import { keyOf, onKeyDown } from '../input/keys.js';
import { activeSlot, getProgress, newGame, slotName, switchSlot, updateProgress } from '../save.js';
import { fillBoard, ratedMhz, tierOf, withEverything, withTier } from '../sim/progress.js';
import { THERMAL } from '../sim/thermal.js';
import { ListMenu } from '../visual/listMenu.js';
import { cssColor, currentEra, TerminalLook } from '../visual/terminal.js';
import { textBase, WIDTH } from '../visual/display.js';
const ROWS = [
    'tier', 'clock', 'money', 'cooling', 'cache', 'overclock', 'wear', 'everything', 'board', 'lessons', 'autoplay', 'briefing', 'practice', 'play', 'reset', 'back',
];
const MONEY_STEPS = [0, 100, 500, 1_000, 5_000, 10_000, 100_000];
const LESSON_IDS = Object.keys(LESSONS);
/** The campaign slot to go back to when leaving the developer save (kept while the page is open). */
let returnSlot;
/**
 * The developer screen (the backquote key on the main menu): the console
 * cheats (cheats.ts) on a screen, plus any briefing, practice and the board.
 * It plays its own save, so testing never touches a campaign; BACK returns to
 * the slot you came from.
 */
export class DevScene extends Phaser.Scene {
    look;
    menu;
    lesson = 0;
    confirmReset = false;
    about;
    constructor() {
        super('dev');
    }
    init() {
        this.confirmReset = false;
    }
    create(data) {
        if (activeSlot() !== 'dev') {
            returnSlot = activeSlot();
            switchSlot('dev');
        }
        this.look = new TerminalLook(this, currentEra());
        this.text(WIDTH / 2, 28, `DEVELOPER MODE: ${folderPath(getSettings().eraIndex, ['DEV'])}`, 22).setFontStyle('bold').setColor(cssColor(this.look.era.accent));
        this.text(WIDTH / 2, 56, 'A SEPARATE SAVE FOR TESTING: NOTHING HERE TOUCHES YOUR CAMPAIGN SLOTS.', 13).setAlpha(0.6);
        this.menu = new ListMenu(this, this.look, 190, 88, 580, 25, 15);
        this.menu.setRows(this.rows(), data?.selected ?? 0);
        this.about = this.text(WIDTH / 2, 494, '', 14).setAlpha(0.8);
        this.text(WIDTH / 2, 522, '[UP/DOWN] CHOOSE    [LEFT/RIGHT] CHANGE    [ENTER] DO IT    [Q] BACK', 14).setAlpha(0.6);
        this.showAbout();
        this.bindKeys();
        playMenuMusic(this);
    }
    update() {
        this.look.update();
    }
    text(x, y, content, size) {
        return this.add.text(x, y, content, { ...textBase(), fontSize: `${size}px`, color: cssColor(this.look.era.fg) }).setOrigin(0.5);
    }
    rows() {
        const p = getProgress();
        const tier = tierOf(p);
        const onOff = (on) => (on ? 'ON' : 'OFF');
        const values = {
            tier: ['CPU TIER', `${tier.number}: ${tier.name}`],
            clock: ['CLOCK UPGRADES', `LEVEL ${p.clockLevel}: ${formatMhz(ratedMhz(p))}`],
            money: ['MONEY', formatMoney(p.money)],
            cooling: ['COOLER', COOLING[p.cooling].name],
            cache: ['L1 CACHE', onOff(p.cacheLevels > 0)],
            overclock: ['OVERCLOCKING UPGRADE', onOff(p.overclocking)],
            wear: ['CHIP WEAR', `MAX CLOCK ${Math.round(p.chipMaxDial * 100)}%`],
            everything: ['UNLOCK EVERYTHING'],
            board: ['NEW CONTRACTS'],
            lessons: ['BRIEFINGS READ', `${p.seenLessons.length} OF ${LESSON_IDS.length}`],
            autoplay: ['AUTOPLAY SONGS', onOff(cheatFlags.autoplay)],
            briefing: ['OPEN BRIEFING', LESSONS[LESSON_IDS[this.lesson]].title.slice(0, 40)],
            practice: ['PRACTICE THIS TIER'],
            play: ['PLAY: CONTRACT BOARD'],
            reset: [this.confirmReset ? 'RESET: PRESS ENTER AGAIN' : 'RESET THE DEVELOPER SAVE'],
            back: ['BACK TO YOUR CAMPAIGN'],
        };
        return ROWS.map((row) => ({ label: values[row][0], value: values[row][1] }));
    }
    showAbout() {
        const row = ROWS[this.menu.selected];
        const steps = ['tier', 'clock', 'money', 'cooling', 'wear', 'briefing'].includes(row);
        this.about.setText(steps ? '[LEFT/RIGHT] TO CHANGE' : row === 'back' ? `BACK TO THE MAIN MENU, PLAYING ${slotName(returnSlot ?? '1')} AGAIN.` : '');
    }
    refresh() {
        this.menu.setRows(this.rows());
        this.showAbout();
    }
    bindKeys() {
        onKeyDown(this, (event) => {
            if (this.menu.busy)
                return;
            const key = keyOf(event);
            if (key === 'ArrowUp' || key === 'ArrowDown') {
                this.confirmReset = false;
                this.menu.move(key === 'ArrowUp' ? -1 : 1);
                this.refresh();
            }
            else if (key === 'ArrowLeft' || key === 'ArrowRight') {
                this.step(ROWS[this.menu.selected], key === 'ArrowLeft' ? -1 : 1);
            }
            else if (key === 'Enter' || key === ' ') {
                uiSound(this, 'confirm');
                this.menu.press(() => this.choose(ROWS[this.menu.selected]));
            }
            else if (key === 'Escape' || key === 'Q') {
                this.leave();
            }
        });
    }
    edit(change) {
        updateProgress(change);
        uiSound(this, 'move');
        this.refresh();
    }
    /** Left / right: a setting one step down or up. */
    step(row, delta) {
        const clampInt = (n, max) => Math.max(0, Math.min(max, n));
        switch (row) {
            case 'tier':
                return this.edit((p) => withTier(p, Phaser.Math.Clamp(tierOf(p).number + delta, 1, 6)));
            case 'clock':
                return this.edit((p) => ({ ...p, clockLevel: clampInt(p.clockLevel + delta, CLOCK.factors.length - 1) }));
            case 'money':
                return this.edit((p) => {
                    const next = delta > 0 ? MONEY_STEPS.find((m) => m > p.money) : [...MONEY_STEPS].reverse().find((m) => m < p.money);
                    return { ...p, money: next ?? p.money };
                });
            case 'cooling':
                return this.edit((p) => ({ ...p, cooling: clampInt(p.cooling + delta, COOLING.length - 1) }));
            case 'wear':
                return this.edit((p) => ({ ...p, chipMaxDial: Phaser.Math.Clamp(Math.round((p.chipMaxDial + delta * THERMAL.damagePerOverheat) * 100) / 100, 1, THERMAL.maxDial) }));
            case 'briefing':
                this.lesson = Phaser.Math.Wrap(this.lesson + delta, 0, LESSON_IDS.length);
                uiSound(this, 'move');
                return this.refresh();
            case 'cache':
            case 'overclock':
            case 'lessons':
            case 'autoplay':
                return this.choose(row);
            default:
                return;
        }
    }
    choose(row) {
        const tier = tierOf(getProgress());
        switch (row) {
            case 'cache':
                return this.edit((p) => ({ ...p, cacheLevels: p.cacheLevels > 0 ? 0 : 1 }));
            case 'overclock':
                return this.edit((p) => ({ ...p, overclocking: !p.overclocking }));
            case 'everything':
                return this.edit(withEverything);
            case 'board':
                return this.edit((p) => fillBoard({ ...p, board: [] }, Math.random));
            case 'lessons':
                return this.edit((p) => ({ ...p, seenLessons: p.seenLessons.length < LESSON_IDS.length ? LESSON_IDS : [] }));
            case 'autoplay':
                cheatFlags.autoplay = !cheatFlags.autoplay;
                return this.refresh();
            case 'briefing':
                this.scene.start('briefing', { lessonId: LESSON_IDS[this.lesson] });
                return;
            case 'practice':
                this.scene.start(tier.scene, { practice: true, ...tier.options });
                return;
            case 'play':
                this.scene.start('board');
                return;
            case 'reset':
                if (!this.confirmReset) {
                    this.confirmReset = true;
                    uiSound(this, 'error');
                    return this.refresh();
                }
                this.confirmReset = false;
                newGame('dev');
                return this.refresh();
            case 'back':
                return this.leave();
            default:
                return this.step(row, 1);
        }
    }
    /** Back to the main menu, playing the campaign slot you came from. */
    leave() {
        uiSound(this, 'back');
        switchSlot(returnSlot ?? '1');
        returnSlot = undefined;
        this.scene.start('title');
    }
}
//# sourceMappingURL=DevScene.js.map