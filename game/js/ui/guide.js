import { cue } from '../audio/cues.js';
import { poseAt, TICK } from '../data/tick.js';
import { GUIDE_NAME } from '../data/tours.js';
import { drawDiagram } from '../visual/diagrams.js';
import { HEIGHT, WIDTH } from '../visual/display.js';
import { motionOf } from '../visual/motion.js';
import { tickFigure } from '../visual/tickFigure.js';
import { cssColor } from './eras.js';
import { ALPHA, TEXT } from './theme.js';
import { Box, eraText } from './widgets.js';
/** Once all the words are showing, Enter waits this long (ms) before it closes them, so a double press can't skip a line unread. */
const READ_MS = 300;
const BUBBLE_W = 330;
const MAX_BUBBLE_W = 440;
/** A question's bubble, wide enough for its answers on one line each. */
const ASK_BUBBLE_W = 520;
const CHOICE_H = 22;
const PAD = 12;
const GAP = 8;
const MARGIN = 8;
/** Above everything on the screen. */
const DEPTH = 900;
/** Where a picture is held up, and how big its card is. */
const CARD = { x: WIDTH / 2, y: 196, w: 880, h: 280 };
/** The notes its voice uses: a major pentatonic from 520 Hz, so any run of words sounds friendly. */
const VOICE = [0, 2, 4, 7, 9].map((step) => 520 * 2 ** (step / 12));
/** The pitch a word is said at: the same word always sounds the same, and one ending in ? or ! is said higher. */
function pitchOf(word) {
    let hash = 0;
    for (const ch of word)
        hash = (hash * 31 + ch.charCodeAt(0)) % 997;
    const pitch = VOICE[hash % VOICE.length];
    return word.endsWith('?') ? pitch * 1.5 : word.endsWith('!') ? pitch * 1.33 : pitch;
}
/** Where the robot and its bubble stand: beside `point` without covering it, inside the screen. */
function placeBeside(w, h, point) {
    const clampX = (x) => Math.min(WIDTH - MARGIN - w, Math.max(MARGIN, x));
    const clampY = (y) => Math.min(HEIGHT - MARGIN - h, Math.max(MARGIN, y));
    if (!point)
        return { x: clampX(WIDTH / 2 - w / 2), y: clampY(HEIGHT / 2 - h / 2) };
    const cx = point.x + point.w / 2;
    const cy = point.y + point.h / 2;
    const candidates = [
        { x: clampX(cx - w / 2), y: point.y + point.h + GAP },
        { x: clampX(cx - w / 2), y: point.y - h - GAP },
        { x: point.x + point.w + GAP, y: clampY(cy - h / 2) },
        { x: point.x - w - GAP, y: clampY(cy - h / 2) },
    ];
    const fits = (c) => c.x >= MARGIN && c.y >= MARGIN && c.x + w <= WIDTH - MARGIN && c.y + h <= HEIGHT - MARGIN;
    // Nothing fits beside a big part: stand over its bottom-right corner, inside the screen.
    return candidates.find(fits) ?? { x: clampX(point.x + point.w - w), y: clampY(point.y + point.h - h) };
}
export class Guide {
    scene;
    era;
    /** The robot and its bubble, moved together (his walk); the robot bobs inside it. */
    unit;
    figure;
    shade;
    frame;
    /** Catches clicks during a tour (a click goes on, like Enter), so nothing underneath gets them. */
    catcher;
    bubble = [];
    card = [];
    words;
    /** The words, wrapped to the bubble, and when they started typing out (performance.now()). */
    full = '';
    started = 0;
    point;
    /** Where he's going (the unit's corner; he's walking until he's there). */
    goal = { x: 0, y: 0 };
    /** How he feels about what he's saying. */
    mood = 'calm';
    /** Which bob is playing: slow while he waits, faster while he talks. */
    bobbing;
    /** Where the robot waits while it has nothing to say; undefined: it leaves. */
    home;
    playing;
    /** A held line is up (GuideLine.hold): it waits for Enter. */
    held = false;
    /** A question is up: its answers, the one chosen so far, and what to do with it. */
    asking;
    /** When Enter showed the rest of the words at once (performance.now()). */
    skippedAt = 0;
    /** The words being said, each with where it starts and the pitch it's said at; and how many have been voiced. */
    syllables = [];
    voiced = 0;
    /** `home`: where the robot waits (its top-left corner) between lines; without one it only shows while talking. */
    constructor(scene, era, home) {
        this.scene = scene;
        this.era = era;
        this.home = home;
        this.shade = scene.add.graphics().setDepth(DEPTH);
        this.frame = scene.add.rectangle(0, 0, 10, 10).setOrigin(0).setStrokeStyle(2, era.accent, 1).setDepth(DEPTH + 1).setVisible(false);
        this.figure = tickFigure(scene, era);
        this.unit = scene.add.container(0, 0, [this.figure.view]).setDepth(DEPTH + 10);
        this.catcher = scene.add.zone(0, 0, WIDTH, HEIGHT).setOrigin(0).setDepth(DEPTH - 1);
        this.catcher.on('pointerdown', () => this.next());
        const start = home ?? { x: WIDTH - 120, y: HEIGHT };
        this.goal = { ...start };
        this.unit.setPosition(start.x, start.y).setVisible(home !== undefined);
    }
    /** A tour is playing: the screen waits for it. */
    get touring() {
        return this.playing !== undefined;
    }
    /** It is saying something. */
    get talking() {
        return this.words !== undefined;
    }
    /** A tour or a held line is up: the screen waits, and sends it Enter (next()). */
    get waiting() {
        return this.playing !== undefined || this.held;
    }
    /** Plays a tour: each step on Enter (or a click), then `done`. `where` finds the part a step points at. */
    tour(steps, where, done) {
        const keys = (i) => (i === steps.length - 1 ? '[ENTER] OK!' : `[ENTER] NEXT   ${i + 1}/${steps.length}`);
        const lines = steps.map((step, i) => ({ say: step.say, point: step.point && where(step.point), picture: step.picture, mood: step.mood, keys: keys(i) }));
        if (lines.length === 0) {
            done();
            return;
        }
        this.playing = { lines, index: 0, done };
        this.catcher.setInteractive();
        cue(this.scene, 'guide-hello');
        this.say(lines[0]);
    }
    /**
     * Enter (or a click) while it's waiting: the first shows the rest of the
     * words, the next closes them (going on to a tour's next line). Nothing
     * is skipped unread. Returns whether the guide took the key.
     */
    next() {
        if (!this.waiting)
            return false;
        if (this.words && this.typedChars() < this.full.length) {
            this.started = 0;
            this.skippedAt = performance.now();
            this.voiced = this.syllables.length;
            return true;
        }
        if (performance.now() - this.shownAt() < READ_MS)
            return true;
        const asking = this.asking;
        if (asking) {
            cue(this.scene, 'confirm');
            this.quiet();
            asking.question.done(asking.selected);
            return true;
        }
        const playing = this.playing;
        if (!playing) {
            cue(this.scene, 'move');
            this.quiet();
            return true;
        }
        playing.index++;
        if (playing.index < playing.lines.length) {
            cue(this.scene, 'move');
            this.say(playing.lines[playing.index]);
            return true;
        }
        this.playing = undefined;
        this.quiet();
        cue(this.scene, 'guide-bye');
        playing.done();
        return true;
    }
    /**
     * Asks a question: the words, then its answers in the bubble, chosen with
     * Up / Down (move) or a click, and Enter (next).
     */
    ask(question) {
        this.say({ say: question.say, hold: true, keys: '[UP/DOWN] CHOOSE   [ENTER] OK', choices: question.choices, mood: question.mood });
        const texts = this.bubble.filter((part) => part.getData('choice') !== undefined);
        this.asking = { question, selected: 0, texts };
        texts.forEach((text, i) => text.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.choose(i);
            this.next();
        }));
        this.showChoice();
    }
    /** Up / Down while a question is up: the next answer. Returns whether the guide took the key. */
    move(delta) {
        const asking = this.asking;
        if (!asking)
            return false;
        this.choose((asking.selected + delta + asking.texts.length) % asking.texts.length);
        cue(this.scene, 'move');
        return true;
    }
    choose(index) {
        if (!this.asking)
            return;
        this.asking.selected = index;
        this.showChoice();
    }
    /** The chosen answer stands out: a pointer, the accent color. */
    showChoice() {
        const asking = this.asking;
        if (!asking)
            return;
        asking.texts.forEach((text, i) => {
            const chosen = i === asking.selected;
            text.setText(`${chosen ? '>' : ' '} ${asking.question.choices[i]}`).setColor(cssColor(chosen ? this.era.accent : this.era.fg)).setAlpha(chosen ? 1 : 0.75);
        });
    }
    /** When all the words were showing: typed out, or shown at once by Enter. */
    shownAt() {
        return this.started === 0 ? this.skippedAt : this.started + (this.full.length / TICK.charsPerSecond) * 1000;
    }
    /** Says a line: the robot walks over beside what it points at, and the words type out. */
    say(line) {
        this.clear();
        this.point = line.point;
        this.mood = line.mood ?? 'calm';
        this.held = line.hold ?? false;
        if (this.held)
            this.catcher.setInteractive();
        const { era, scene } = this;
        // The rest of the screen dims: all of it behind a picture, around the part pointed at.
        const dim = line.dim ?? 0.7;
        this.shade.fillStyle(era.bg, dim);
        const p = line.picture ? undefined : line.point;
        if (p) {
            this.shade.fillRect(0, 0, WIDTH, p.y).fillRect(0, p.y + p.h, WIDTH, HEIGHT - p.y - p.h);
            this.shade.fillRect(0, p.y, p.x, p.h).fillRect(p.x + p.w, p.y, WIDTH - p.x - p.w, p.h);
            this.frame.setPosition(p.x - 2, p.y - 2).setSize(p.w + 4, p.h + 4).setVisible(true);
            this.frame.setStrokeStyle(2, era.accent, 1);
            motionOf(scene).play('tick-spotlight', this.frame);
        }
        else if (line.picture || dim > 0) {
            this.shade.fillRect(0, 0, WIDTH, HEIGHT);
        }
        if (line.picture) {
            const card = new Box(scene, era, CARD.x, CARD.y, CARD.w, CARD.h, { strokeWidth: 2 }).setDepth(DEPTH + 2);
            const picture = drawDiagram(scene, line.picture, CARD.x, CARD.y, era);
            for (const part of picture)
                part.setDepth(DEPTH + 3);
            this.card = [...card.parts, ...picture];
        }
        // The bubble: the guide's name, the words (wrapped now, so they don't jump lines as they type), and the keys.
        const name = eraText(scene, era, PAD, PAD, `${GUIDE_NAME}:`, TEXT.small).setColor(cssColor(era.accent)).setAlpha(0.9);
        const words = eraText(scene, era, PAD, PAD + 20, line.say, TEXT.body).setLineSpacing(4);
        // Words already broken into lines (practice's tips) keep them, in a bubble as wide as they need; a question is wider.
        const bubbleW = line.choices ? ASK_BUBBLE_W : line.say.includes('\n') ? Math.min(MAX_BUBBLE_W, Math.max(BUBBLE_W * 0.7, words.width + 2 * PAD)) : BUBBLE_W;
        words.setWordWrapWidth(bubbleW - 2 * PAD);
        this.full = words.getWrappedText(line.say).join('\n');
        const hint = line.keys ? eraText(scene, era, bubbleW - PAD, 0, line.keys, TEXT.hint - 1).setOrigin(1, 0).setAlpha(ALPHA.hint) : undefined;
        const textH = words.height;
        // A question's answers, under the words (showChoice writes them).
        const choices = (line.choices ?? []).map((_, i) => eraText(scene, era, PAD, PAD + 20 + textH + 10 + i * CHOICE_H, '', TEXT.small).setData('choice', i));
        const choicesH = choices.length > 0 ? choices.length * CHOICE_H + 10 : 0;
        const bubbleH = PAD + 20 + textH + choicesH + (hint ? 26 : 8) + PAD / 2;
        hint?.setY(bubbleH - PAD - 14);
        words.setText('');
        this.syllables = [...this.full.matchAll(/\S+/g)].map((word) => ({ at: word.index, pitch: pitchOf(word[0]) }));
        this.voiced = 0;
        const box = new Box(scene, era, bubbleW / 2, bubbleH / 2, bubbleW, bubbleH, { strokeWidth: 2 });
        // The robot stands left of its bubble, its head level with the bubble's top; a tail joins them.
        const left = this.figure.width + GAP;
        const w = left + bubbleW;
        const h = Math.max(this.figure.height, bubbleH);
        const parts = [...box.parts, name, words, ...choices, ...(hint ? [hint] : [])];
        for (const part of parts)
            part.x += left;
        const tail = scene.add.triangle(0, 0, left + 1, 18, left + 1, 34, left - GAP, 26, era.bg).setOrigin(0).setStrokeStyle(1, era.fg, 1);
        this.unit.add([...parts, tail]);
        this.bubble = [...parts, tail];
        this.words = words;
        const goal = line.picture ? { x: WIDTH / 2 - w / 2, y: CARD.y + CARD.h / 2 + GAP } : line.aside ? { x: WIDTH - MARGIN - w, y: HEIGHT - MARGIN - h } : placeBeside(w, h, p);
        if (this.unit.visible) {
            this.walkTo(goal);
        }
        else {
            // Not on the screen yet: he appears where he'll stand.
            motionOf(scene).stop(this.unit);
            this.goal = { x: Math.round(goal.x), y: Math.round(goal.y) };
            this.unit.setPosition(this.goal.x, this.goal.y).setVisible(true);
        }
        this.started = performance.now();
    }
    /** Stops talking: the bubble, the dimming and any picture go, and the robot goes home (or leaves). */
    quiet() {
        this.clear();
        this.held = false;
        this.mood = 'calm';
        if (!this.playing)
            this.catcher.disableInteractive();
        if (this.home) {
            this.walkTo(this.home);
        }
        else {
            motionOf(this.scene).stop(this.unit);
            this.unit.setVisible(false);
        }
    }
    /** He walks to `goal` (whole pixels, so his words land sharp), the era's way (a motion). */
    walkTo(goal) {
        const to = { x: Math.round(goal.x), y: Math.round(goal.y) };
        if (to.x === this.goal.x && to.y === this.goal.y)
            return;
        this.goal = to;
        motionOf(this.scene).play('tick-walk', this.unit, { goal: to });
    }
    /** Every frame: he bobs, types his words out, and takes his pose (talking, walking, looking, how he feels). */
    update(now) {
        if (!this.unit.visible)
            return;
        const typed = this.typedChars();
        const talking = this.words !== undefined && typed < this.full.length;
        const bob = talking ? 'tick-bob-talk' : 'tick-bob';
        if (bob !== this.bobbing) {
            // From level, so switching never leaves him a little high or low.
            this.bobbing = bob;
            this.figure.view.y = 0;
            motionOf(this.scene).play(bob, this.figure.view);
        }
        if (this.words && this.words.text.length !== Math.min(typed, this.full.length))
            this.words.setText(this.full.slice(0, typed));
        // A blip for each word as it starts to appear (one a frame at most, so a slow frame doesn't blurt several).
        let word;
        while (this.voiced < this.syllables.length && this.syllables[this.voiced].at < typed)
            word = this.syllables[this.voiced++];
        if (word)
            cue(this.scene, 'guide-talk', { pitch: word.pitch });
        const walking = Math.abs(this.unit.x - this.goal.x) >= 1 || Math.abs(this.unit.y - this.goal.y) >= 1;
        this.figure.show(poseAt({ talking, walking, look: this.lookToward(), mood: this.mood }, now), now);
    }
    /** Characters typed so far: all of them once Enter skips ahead (started = 0). */
    typedChars() {
        if (this.started === 0)
            return this.full.length;
        return Math.floor(((performance.now() - this.started) / 1000) * TICK.charsPerSecond);
    }
    /** Which way his eyes look: toward what he points at. */
    lookToward() {
        const p = this.point;
        if (!p)
            return 0;
        const cx = p.x + p.w / 2;
        if (cx < this.unit.x)
            return -1;
        if (cx > this.unit.x + this.figure.width)
            return 1;
        return 0;
    }
    clear() {
        for (const part of [...this.bubble, ...this.card]) {
            // Some pictures pulse.
            this.scene.tweens.killTweensOf(part);
            part.destroy();
        }
        this.bubble = [];
        this.card = [];
        this.words = undefined;
        this.asking = undefined;
        this.point = undefined;
        this.shade.clear();
        motionOf(this.scene).stop(this.frame);
        this.frame.setAlpha(1).setVisible(false);
    }
}
//# sourceMappingURL=guide.js.map