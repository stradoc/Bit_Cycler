import { GLOSSARY } from '../data/glossary.js';
import { tokens, UNITS, unitOf } from '../sim/isa.js';
import { cssColor } from '../ui/eras.js';
import { dropShadow, PressButton } from '../ui/widgets.js';
import { branchHint, hintColor } from '../visual/branchHint.js';
import { codeLine } from '../visual/codeLine.js';
import { motionOf } from '../visual/motion.js';
import { FLUSH_SHIFT, HIT_Y, LANE_KEYS, LANE_W, LANE_X0, laneCenter, LANES_W, LOOKAHEAD, NOTE_H, NOTE_W, noteKey, PX_PER_BEAT, ROW_GAP, STAGE_NAMES, } from './layout.js';
import { Part } from './view.js';
/**
 * The highway: lanes for the units, notes falling to the hit line (ID), and
 * once issued, stepping down the EX / MEM / WB rows; the keys under the lanes;
 * the link from a note waiting on a hazard to the note computing its value;
 * flushed notes, and a branch's callout when it sends fetch elsewhere. Where a
 * falling note is stays on the beat here; everything else moves by recipes
 * (data/motions.ts, the `song` group).
 */
export class Highway extends Part {
    /** Upcoming notes (IF and later, plus the one in ID), keyed by seq:pc. */
    notes = new Map();
    /** Notes already issued, in the EX / MEM / WB rows, keyed by seq. */
    inFlight = new Map();
    laneFlash = {};
    /** The 90s desktop's key buttons under the lanes: pressed in while their key's flash lasts. */
    keyButtons = {};
    hazardLink;
    hazardTag;
    /** "WAITING ON RAM" over the note in MEMORY while the pipeline is frozen. */
    memTag;
    /** Tier 4: "J: NOT  K: TAKEN" over a branch on the line, the hinted guess brighter. */
    guessTag;
    guessNot;
    guessTaken;
    /** The pulsing frames around a note waiting on a hazard (in ID) and one waiting for memory (in the rows). */
    hazardFrame;
    waitFrame;
    redirects = [];
    motion;
    constructor(view) {
        super(view);
        this.motion = motionOf(this.scene);
        const { fg, dim } = this.era;
        const { setup, clickable, words } = view;
        const { rows } = setup;
        const bottom = rows.WB + ROW_GAP / 2;
        const lines = this.scene.add.graphics().lineStyle(1, dim);
        for (let i = 0; i <= UNITS.length; i++)
            lines.lineBetween(LANE_X0 + i * LANE_W, 0, LANE_X0 + i * LANE_W, bottom);
        // Faint dividers between the EX / MEM / WB rows (one row on the single-cycle CPU).
        for (const y of new Set([rows.EX, rows.MEM, rows.WB]))
            lines.lineBetween(LANE_X0, y - ROW_GAP / 2, LANE_X0 + LANES_W, y - ROW_GAP / 2);
        lines.lineBetween(LANE_X0, bottom, LANE_X0 + LANES_W, bottom);
        lines.lineStyle(2, this.era.accent).lineBetween(LANE_X0, HIT_Y, LANE_X0 + LANES_W, HIT_Y);
        // Each stage's plain name, with the textbook abbreviation underneath.
        const label = (y, name, sub, alpha, entry) => {
            clickable(this.text(LANE_X0 - 10, y - 7, name, 13).setOrigin(1, 0.5).setAlpha(alpha), entry);
            clickable(this.text(LANE_X0 - 10, y + 8, sub, 11).setOrigin(1, 0.5).setAlpha(alpha * 0.6), entry);
        };
        const stage = (y, s, alpha) => label(y, STAGE_NAMES[s], s, alpha, () => words.stage(s));
        if (setup.singleCycle) {
            // One long beat does all five steps; the result shows just below.
            label(HIT_Y - PX_PER_BEAT, 'NEXT', 'UP NEXT', 0.6, () => GLOSSARY.SINGLE_CYCLE);
            label(HIT_Y, 'EXECUTE', 'ALL 5 STEPS', 1, () => GLOSSARY.SINGLE_CYCLE);
            label(rows.WB, 'DONE', 'RESULT', 0.8, () => GLOSSARY.SINGLE_CYCLE);
        }
        else {
            stage(HIT_Y - PX_PER_BEAT, 'IF', 0.6); // where the next note waits, one beat out
            stage(HIT_Y, 'ID', 1);
            stage(rows.EX, 'EX', 0.8);
            stage(rows.MEM, 'MEM', 0.8);
            stage(rows.WB, 'WB', 0.8);
        }
        for (const unit of UNITS) {
            this.laneFlash[unit] = this.scene.add.rectangle(laneCenter(unit), HIT_Y, LANE_W - 4, 30, fg).setAlpha(0);
            const branchEntry = setup.guessing ? { title: GLOSSARY.BRANCH.title, body: `${GLOSSARY.BRANCH.body} ${GLOSSARY.PREDICTION.body}` } : GLOSSARY.BRANCH;
            const entry = unit === 'ALU' ? GLOSSARY.ALU : unit === 'MEM' ? GLOSSARY.MEMORY_UNIT : branchEntry;
            const button = this.keyButton(laneCenter(unit), bottom + 18, LANE_W - 16);
            const texts = unit === 'BRANCH' && setup.guessing
                ? this.guessKeys(laneCenter(unit), bottom + 18, entry)
                : [clickable(this.text(laneCenter(unit), bottom + 18, `${unit} [${LANE_KEYS[unit]}]`, 16).setOrigin(0.5), () => entry)];
            if (button) {
                button.texts = texts;
                this.keyButtons[unit] = button;
            }
        }
        this.laneFlash.STALL = this.scene.add.rectangle(LANE_X0 + LANES_W / 2, bottom + 44, LANES_W - 4, 22, fg).setAlpha(0);
        // A single-cycle CPU never has to wait for a value, so it has no stall.
        if (!setup.singleCycle) {
            const button = this.keyButton(LANE_X0 + LANES_W / 2, bottom + 44, 200);
            const text = clickable(this.text(LANE_X0 + LANES_W / 2, bottom + 44, 'STALL [SPACE]', 16).setOrigin(0.5), () => GLOSSARY.STALL);
            if (button) {
                button.texts = [text];
                this.keyButtons.STALL = button;
            }
        }
        this.hazardLink = this.scene.add.graphics().setDepth(20);
        this.hazardTag = this.text(0, 0, '', 14).setOrigin(0.5).setDepth(21);
        this.memTag = this.text(0, 0, '', 14).setOrigin(0.5).setDepth(21).setVisible(false);
        this.guessNot = this.text(0, 0, 'J: NOT', 14).setOrigin(0, 0.5).setColor(cssColor(this.era.notTaken));
        this.guessTaken = this.text(0, 0, 'K: TAKEN', 14).setOrigin(0, 0.5).setColor(cssColor(this.era.taken));
        // Centered as a whole, so it stays inside the branch lane.
        this.guessNot.setX(-(this.guessNot.width + 10 + this.guessTaken.width) / 2);
        this.guessTaken.setX(this.guessNot.x + this.guessNot.width + 10);
        this.guessTag = this.scene.add.container(0, 0, [this.guessNot, this.guessTaken]).setDepth(21).setVisible(false);
        const frame = () => this.scene.add.rectangle(0, 0, NOTE_W, NOTE_H).setStrokeStyle(2, fg).setDepth(11).setVisible(false);
        this.hazardFrame = frame();
        this.waitFrame = frame();
    }
    /** The 90s desktop: a raised button behind a key's label, centered on (x, y) (nothing in the other eras). */
    keyButton(x, y, w) {
        const h = 22;
        return PressButton.create(this.scene, this.era, x - w / 2, y - h / 2, w, h);
    }
    /** Tier 4's branch lane label, "BRANCH J/K", with each key in the color of the guess it makes. */
    guessKeys(x, y, entry) {
        const parts = [
            this.text(0, y, 'BRANCH ', 16),
            this.text(0, y, 'J', 16).setColor(cssColor(this.era.notTaken)).setFontStyle('bold'),
            this.text(0, y, '/', 16),
            this.text(0, y, 'K', 16).setColor(cssColor(this.era.taken)).setFontStyle('bold'),
        ];
        let cursor = x - parts.reduce((width, part) => width + part.width, 0) / 2;
        for (const part of parts) {
            part.setOrigin(0, 0.5).setX(cursor);
            cursor += part.width;
        }
        this.view.clickable(parts[0], () => entry);
        return parts;
    }
    /** A key was pressed: its lane lights up (and its 90s button presses in) for a moment. */
    flash(key) {
        const button = this.keyButtons[key];
        button?.press(true);
        this.motion.play('lane-flash', this.laneFlash[key], { done: () => button?.press(false) });
    }
    /** Every frame: a branch's callouts follow the notes they link. */
    update() {
        for (const { branchSeq, toKey, tag, link, color } of this.redirects) {
            link.clear();
            const branch = this.inFlight.get(branchSeq)?.box;
            const to = toKey === undefined ? undefined : (this.notes.get(toKey)?.box ?? [...this.inFlight.values()].find((block) => block.key === toKey)?.box);
            const over = to ?? branch;
            if (!over) {
                tag.setVisible(false);
                continue;
            }
            // Over the note fetch went to, kept inside the lanes.
            const x = Phaser.Math.Clamp(over.x, LANE_X0 + tag.width / 2, LANE_X0 + LANES_W - tag.width / 2);
            tag.setPosition(x, over.y - NOTE_H / 2 - 6).setVisible(true);
            if (!branch || !to)
                continue;
            // From the branch's note up to the note it sent fetch to, an arrowhead at the end.
            const from = { x: branch.x - NOTE_W / 2 + 12, y: branch.y - NOTE_H / 2 };
            const end = { x: to.x + (to.x < branch.x ? NOTE_W / 2 - 12 : -NOTE_W / 2 + 12), y: to.y + NOTE_H / 2 };
            link.lineStyle(2, color, 1).lineBetween(from.x, from.y, end.x, end.y);
            const angle = Math.atan2(end.y - from.y, end.x - from.x);
            const head = (turn) => ({ x: end.x - 9 * Math.cos(angle + turn), y: end.y - 9 * Math.sin(angle + turn) });
            const [a, b] = [head(0.45), head(-0.45)];
            link.fillStyle(color, 1).fillTriangle(end.x, end.y, a.x, a.y, b.x, b.y);
        }
    }
    /**
     * A branch went the way fetch didn't expect, so the branch unit sent fetch
     * somewhere else: a callout says so over the new path's first note (`to`),
     * linked to the branch, for a moment.
     */
    redirect(branch, to) {
        const taken = branch.step?.taken ?? false;
        const color = hintColor(this.era, taken);
        const tag = this.text(0, 0, this.view.words.redirectTag(taken), 13).setOrigin(0.5, 1).setAlign('center').setDepth(22).setColor(cssColor(color));
        tag.setBackgroundColor(cssColor(this.era.bg)).setPadding(4, 2, 4, 2).setLineSpacing(2);
        const link = this.scene.add.graphics().setDepth(21);
        const entry = { branchSeq: branch.seq, toKey: to ? noteKey(to) : undefined, tag, link, color };
        this.redirects.push(entry);
        this.update();
        this.motion.play('callout', [tag, link], { remove: true, done: () => this.redirects.splice(this.redirects.indexOf(entry), 1) });
    }
    // ---- notes ----
    /** The falling note for `slot`, if there is one. */
    note(slot) {
        return this.notes.get(noteKey(slot));
    }
    /** The issued note for instruction `seq` in the rows, if it's still there. */
    block(seq) {
        return this.inFlight.get(seq);
    }
    /**
     * Keeps one falling note per upcoming instruction (ID, IF, then the next
     * fetches), on the notes' clock: the chart's beat minus the beats `frozen`
     * waiting for memory, so they hold still during a wait. Superscalar: the
     * first two arrive side by side (a chord) when they can start together.
     */
    syncNotes(chartBeat, elapsed, frozen) {
        const { run } = this.view;
        const { pipeline } = run;
        const { ID, IF } = pipeline.stages;
        const beat = chartBeat - frozen;
        const due = run.dueBeat - run.waitBeats;
        const wanted = [];
        // Superscalar: two that can start together arrive together, a chord, and everything behind them comes a beat sooner.
        const chord = this.view.setup.superscalar && pipeline.pairCheck().ok ? 1 : 0;
        if (ID)
            wanted.push({ slot: ID, k: 0 });
        if (IF)
            wanted.push({ slot: IF, k: 1 - chord });
        pipeline.upcoming(LOOKAHEAD).forEach((slot, i) => wanted.push({ slot, k: 2 + i - chord }));
        // A note whose instruction is still coming keeps its place when it's numbered again (fetched again after a flush).
        const gone = [...this.notes].filter(([key]) => !wanted.some(({ slot }) => noteKey(slot) === key));
        const keep = new Set();
        for (const { slot, k } of wanted) {
            const key = noteKey(slot);
            keep.add(key);
            const target = due + k;
            const same = this.notes.has(key) ? -1 : gone.findIndex(([, old]) => old.pc === slot.pc);
            if (same >= 0) {
                this.notes.set(key, { ...gone[same][1], key });
                gone.splice(same, 1);
            }
            const view = this.notes.get(key) ?? this.createNote(key, slot, target);
            view.target = target;
            view.due += (view.target - view.due) * Math.min(1, elapsed / 60);
            if (k === 0 && beat >= view.due)
                view.pinned = true;
            const y = k === 0 && view.pinned ? HIT_Y : HIT_Y - (view.due - beat) * PX_PER_BEAT;
            view.box.setY(y);
            view.label.setY(y);
            this.syncHint(view, slot);
        }
        // Notes that will never be fetched after all (a branch sent fetch elsewhere, or the guess changed) slide out of their lanes.
        for (const [key, view] of this.notes) {
            if (keep.has(key))
                continue;
            this.notes.delete(key);
            this.motion.play('note-drop', [view.box, view.label], { remove: true });
        }
    }
    /** Moves issued notes down to the row of the stage they're in; drops notes that left WB. */
    syncRows() {
        const { run, setup, words } = this.view;
        const { stages, partners } = run.pipeline;
        const present = new Set();
        // Each row's instruction, and superscalar, the second of its pair beside it in its own lane.
        for (const [stage, slot] of ['EX', 'MEM', 'WB'].flatMap((stage) => [[stage, stages[stage]], [stage, partners[stage]]])) {
            if (!slot)
                continue;
            present.add(slot.seq);
            let block = this.inFlight.get(slot.seq);
            if (!block) {
                // Just issued: hand the falling note over to the rows, starting from the hit line.
                const key = noteKey(slot);
                const note = this.notes.get(key);
                this.notes.delete(key);
                block = { ...(note ?? this.createBlock(slot, HIT_Y, key)), rowY: setup.rows[stage] };
                // Decided: the branch's hint has done its job, and a 90s button stays pressed in.
                block.hint?.view.destroy();
                block.hint = undefined;
                block.button?.press(true);
                this.motion.stop(block.label, ['alpha']);
                block.box.setY(HIT_Y);
                block.label.setY(HIT_Y).setAlpha(0.85);
                this.inFlight.set(slot.seq, block);
                block.rowY = Number.NaN;
            }
            let moved = block.rowY !== setup.rows[stage];
            block.rowY = setup.rows[stage];
            if (stage === 'WB' && !block.result) {
                // In WB the note shows what the instruction did.
                block.label.setVisible(false);
                block.result = this.text(block.box.x, block.box.y, words.result(slot), 15).setOrigin(0.5);
                moved = true;
            }
            // Down to its row (or on with it, the result just written).
            if (moved)
                this.motion.play('row-step', parts(block), { goal: { y: block.rowY } });
        }
        for (const [seq, block] of this.inFlight) {
            if (present.has(seq))
                continue;
            this.inFlight.delete(seq);
            this.motion.play('note-leave', parts(block), { remove: true });
        }
    }
    /** The song is over: the last notes fade out of the rows. */
    empty() {
        for (const [seq, block] of this.inFlight) {
            this.inFlight.delete(seq);
            this.motion.play('note-leave', parts(block), { remove: true });
        }
    }
    /**
     * A flushed instruction's note: struck through and stamped FLUSHED, it's
     * pushed out of its slot toward the middle of the highway (the right
     * instruction arrives where it was) and fades out.
     */
    strike(slot) {
        const view = this.notes.get(noteKey(slot));
        if (!view)
            return;
        this.notes.delete(noteKey(slot));
        const { x, y } = view.box;
        const strike = this.scene.add.rectangle(x, y, NOTE_W + 6, 2, this.era.fg).setDepth(10);
        const stamp = this.text(x, y, ` ${this.view.words.flushedTag()} `, 13).setOrigin(0.5).setDepth(11).setBackgroundColor(cssColor(this.era.bg));
        const toward = x < LANE_X0 + LANES_W / 2 ? 1 : -1;
        this.motion.play('strike-draw', strike);
        this.motion.play('note-flush', [view.box, view.label, strike, stamp], { goal: { x: x + toward * FLUSH_SHIFT }, remove: true });
    }
    createBlock(slot, y, key) {
        const { fg, bg, syntax, kind } = this.era;
        const x = laneCenter(unitOf(slot.instr));
        const box = this.scene.add.rectangle(x, y, NOTE_W, NOTE_H, bg).setStrokeStyle(1, fg, 0.6);
        const label = codeLine(this.scene, x, y, tokens(slot.instr, true), syntax, { maxWidth: NOTE_W - 8, center: true });
        this.view.clickable(box, () => this.view.words.note(slot));
        // DOS: a solid black shadow, moving with the note.
        if (kind === 'dos')
            label.addAt(dropShadow(this.scene.add.graphics(), -NOTE_W / 2, -NOTE_H / 2, NOTE_W, NOTE_H, 5), 0);
        // The 90s desktop: a button, raised until it's played.
        const button = PressButton.create(this.scene, this.era, -NOTE_W / 2, -NOTE_H / 2, NOTE_W, NOTE_H, null);
        if (!button)
            return { key, pc: slot.pc, box, label };
        label.addAt(button.edges, 0);
        return { key, pc: slot.pc, box, label, button };
    }
    /** A note for an instruction fetch will bring in; it fades in, in case it arrives mid-highway (fetch went somewhere new). */
    createNote(key, slot, due) {
        const view = { ...this.createBlock(slot, -40, key), due, target: due, pinned: false };
        this.notes.set(key, view);
        this.motion.play('note-arrive', [view.box, view.label]);
        return view;
    }
    /**
     * Rings a branch note in the color of its hint. Tier 4: what it did last time.
     * Tiers 5-6: the predictor's guess. Redrawn when that changes, e.g. the next
     * round's branch is on screen when this one is decided.
     */
    syncHint(view, slot) {
        const hint = this.hintFor(slot);
        if (!hint || (view.hint?.taken === hint.taken && view.hint.sure === hint.sure))
            return;
        view.hint?.view.destroy();
        const ring = branchHint(this.scene, NOTE_W, NOTE_H, hint.taken, hint.sure, this.era);
        view.label.add(ring);
        view.hint = { ...hint, view: ring };
    }
    hintFor(slot) {
        const { run, setup } = this.view;
        if (setup.predictor)
            return run.pipeline.guessFor(slot);
        if (!setup.guessing)
            return undefined;
        const hint = run.pipeline.hint(slot.pc);
        return hint && { taken: hint.taken, sure: hint.seen };
    }
    // ---- hazards and waits ----
    /**
     * Every frame: when the instruction in ID needs a value still being
     * computed, link it to the instruction below that's computing it, and pulse
     * the waiting note. Tier 4: a branch on the line asks for a guess.
     */
    drawHazard() {
        this.hazardLink.clear();
        const { fg } = this.era;
        const { run, setup } = this.view;
        for (const block of this.inFlight.values())
            block.box.setStrokeStyle(1, fg, 0.5);
        const { pipeline } = run;
        const hazard = pipeline.hazard();
        const id = pipeline.stages.ID;
        const waiting = id ? this.notes.get(noteKey(id)) : undefined;
        if (!hazard || !waiting) {
            const asking = setup.guessing && waiting && !run.decided && pipeline.branchOutcome() !== undefined;
            this.hazardTag.setVisible(false);
            this.guessTag.setVisible(Boolean(asking));
            if (asking) {
                // Above the hint's badge. The hinted guess (the predictor's, on tiers 5-6) glows; the other one (an override) is dim.
                this.guessTag.setPosition(waiting.box.x, waiting.box.y - NOTE_H / 2 - 20);
                const hinted = waiting.hint?.taken;
                styleGuess(this.guessNot, hinted === false);
                styleGuess(this.guessTaken, hinted === true);
            }
            waiting?.box.setStrokeStyle(1, fg, 0.6);
            this.pulse(this.hazardFrame, undefined);
            return;
        }
        this.guessTag.setVisible(false);
        this.pulse(this.hazardFrame, waiting.box);
        this.hazardTag
            .setText(`x${hazard.reg} NOT READY`)
            .setPosition(waiting.box.x, waiting.box.y - NOTE_H / 2 - (waiting.hint ? 20 : 12)) // clear of a hint's badge
            .setVisible(true);
        const producer = this.inFlight.get(hazard.producer.seq);
        if (producer) {
            producer.box.setStrokeStyle(2, fg, 1);
            this.hazardLink.lineStyle(2, fg, 0.9).lineBetween(waiting.box.x, waiting.box.y + NOTE_H / 2, producer.box.x, producer.box.y - NOTE_H / 2);
        }
    }
    /** The song is over: no more links. */
    hideHazard() {
        this.hazardLink.clear();
        this.hazardTag.setVisible(false);
        this.pulse(this.hazardFrame, undefined);
    }
    /** Every frame of a memory wait: the waiting note pulses under its tag, its result held back. Returns the note (none: nothing shown). */
    showWaiting(seq, tag) {
        const block = this.inFlight.get(seq);
        if (!block) {
            this.hideWaiting();
            return undefined;
        }
        this.pulse(this.waitFrame, block.box);
        // Tier 1: the finished load waits in the DONE row; its result only counts once the data arrives.
        block.result?.setVisible(false);
        this.memTag.setText(tag).setPosition(block.box.x, block.box.y - NOTE_H / 2 - 10).setVisible(true);
        return block;
    }
    /** No memory wait to show: the tag and the pulse go. */
    hideWaiting() {
        this.memTag.setVisible(false);
        this.pulse(this.waitFrame, undefined);
    }
    /** Every frame: a pulsing frame follows the note it's around (`over`), or stops and hides (none). */
    pulse(frame, over) {
        if (!over) {
            if (frame.visible)
                this.motion.stop(frame);
            frame.setVisible(false);
            return;
        }
        frame.setPosition(over.x, over.y).setVisible(true);
        if (!this.motion.moving(frame))
            this.motion.play('wait-pulse', frame);
    }
    /** The wait is over: the note shows its result again. */
    endWaiting(seq) {
        this.inFlight.get(seq)?.result?.setVisible(true);
    }
}
/** Everything drawn for a note in the rows, which moves together. */
function parts(block) {
    return [block.box, block.label, ...(block.result ? [block.result] : [])];
}
/** A guess key's label: bright and glowing when it's the hinted guess, dim when not. */
function styleGuess(text, hinted) {
    const color = String(text.style.color);
    text.setAlpha(hinted ? 1 : 0.3).setFontStyle(hinted ? 'bold' : '');
    if (hinted)
        text.setShadow(0, 0, color, 8, true, true);
    else
        text.setShadow(0, 0, color, 0, false, false);
}
//# sourceMappingURL=highway.js.map