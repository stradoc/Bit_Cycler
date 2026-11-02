import { GLOSSARY, type Entry } from '../data/glossary.ts';
import { tokens, UNITS, unitOf, type Unit } from '../sim/isa.ts';
import type { Slot, Stage } from '../sim/pipeline.ts';
import { cssColor } from '../ui/eras.ts';
import { dropShadow, PressButton } from '../ui/widgets.ts';
import { branchHint } from '../visual/branchHint.ts';
import { codeLine } from '../visual/codeLine.ts';
import {
  FLASH_MS,
  HIT_Y,
  LANE_KEYS,
  LANE_W,
  LANE_X0,
  laneCenter,
  LANES_W,
  LOOKAHEAD,
  NOTE_H,
  NOTE_W,
  noteKey,
  PX_PER_BEAT,
  ROW_GAP,
  STAGE_NAMES,
  type NoteBlock,
  type NoteView,
  type RowBlock,
} from './layout.ts';
import { Part, type SongView } from './view.ts';

type Key = Unit | 'STALL';

/**
 * The highway: lanes for the units, notes falling to the hit line (ID), and
 * once issued, stepping down the EX / MEM / WB rows; the keys under the lanes;
 * the link from a note waiting on a hazard to the note computing its value.
 */
export class Highway extends Part {
  /** Upcoming notes (IF and later, plus the one in ID), keyed by seq:pc. */
  private readonly notes = new Map<string, NoteView>();
  /** Notes already issued, in the EX / MEM / WB rows, keyed by seq. */
  private readonly inFlight = new Map<number, RowBlock>();
  private readonly laneFlash = {} as Record<Key, Phaser.GameObjects.Rectangle>;
  private readonly flashAt: Record<Key, number> = { ALU: -Infinity, MEM: -Infinity, BRANCH: -Infinity, STALL: -Infinity };
  /** The 90s desktop's key buttons under the lanes: pressed in while their key's flash lasts. */
  private readonly keyButtons: Partial<Record<Key, PressButton>> = {};
  private readonly hazardLink: Phaser.GameObjects.Graphics;
  private readonly hazardTag: Phaser.GameObjects.Text;
  /** "WAITING ON RAM" over the note in MEMORY while the pipeline is frozen. */
  private readonly memTag: Phaser.GameObjects.Text;
  /** Tier 4: "J: NOT  K: TAKEN" over a branch on the line, the hinted guess brighter. */
  private readonly guessTag: Phaser.GameObjects.Container;
  private readonly guessNot: Phaser.GameObjects.Text;
  private readonly guessTaken: Phaser.GameObjects.Text;

  constructor(view: SongView) {
    super(view);
    const { fg, dim } = this.era;
    const { setup, clickable, words } = view;
    const { rows } = setup;
    const bottom = rows.WB + ROW_GAP / 2;
    const lines = this.scene.add.graphics().lineStyle(1, dim);
    for (let i = 0; i <= UNITS.length; i++) lines.lineBetween(LANE_X0 + i * LANE_W, 0, LANE_X0 + i * LANE_W, bottom);
    // Faint dividers between the EX / MEM / WB rows (one row on the single-cycle CPU).
    for (const y of new Set([rows.EX, rows.MEM, rows.WB])) lines.lineBetween(LANE_X0, y - ROW_GAP / 2, LANE_X0 + LANES_W, y - ROW_GAP / 2);
    lines.lineBetween(LANE_X0, bottom, LANE_X0 + LANES_W, bottom);
    lines.lineStyle(2, this.era.accent).lineBetween(LANE_X0, HIT_Y, LANE_X0 + LANES_W, HIT_Y);

    // Each stage's plain name, with the textbook abbreviation underneath.
    const label = (y: number, name: string, sub: string, alpha: number, entry: () => Entry) => {
      clickable(this.text(LANE_X0 - 10, y - 7, name, 13).setOrigin(1, 0.5).setAlpha(alpha), entry);
      clickable(this.text(LANE_X0 - 10, y + 8, sub, 11).setOrigin(1, 0.5).setAlpha(alpha * 0.6), entry);
    };
    const stage = (y: number, s: Stage, alpha: number) => label(y, STAGE_NAMES[s], s, alpha, () => words.stage(s));
    if (setup.singleCycle) {
      // One long beat does all five steps; the result shows just below.
      label(HIT_Y - PX_PER_BEAT, 'NEXT', 'UP NEXT', 0.6, () => GLOSSARY.SINGLE_CYCLE);
      label(HIT_Y, 'EXECUTE', 'ALL 5 STEPS', 1, () => GLOSSARY.SINGLE_CYCLE);
      label(rows.WB, 'DONE', 'RESULT', 0.8, () => GLOSSARY.SINGLE_CYCLE);
    } else {
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
      const texts =
        unit === 'BRANCH' && setup.guessing
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
  }

  /** The 90s desktop: a raised button behind a key's label, centered on (x, y) (nothing in the other eras). */
  private keyButton(x: number, y: number, w: number): PressButton | undefined {
    const h = 22;
    return PressButton.create(this.scene, this.era, x - w / 2, y - h / 2, w, h);
  }

  /** Tier 4's branch lane label, "BRANCH J/K", with each key in the color of the guess it makes. */
  private guessKeys(x: number, y: number, entry: Entry): Phaser.GameObjects.Text[] {
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
  flash(key: Key, now: number): void {
    this.flashAt[key] = now;
  }

  /** Every frame: the lanes' flashes fade, and the key buttons come back up. */
  update(now: number): void {
    for (const key of [...UNITS, 'STALL'] as const) {
      const fade = 1 - (now - this.flashAt[key]) / FLASH_MS;
      this.laneFlash[key]?.setAlpha(0.35 * Math.max(0, fade));
      this.keyButtons[key]?.press(now - this.flashAt[key] < FLASH_MS);
    }
  }

  // ---- notes ----

  /** The falling note for `slot`, if there is one. */
  note(slot: Slot): NoteView | undefined {
    return this.notes.get(noteKey(slot));
  }

  /** The issued note for instruction `seq` in the rows, if it's still there. */
  block(seq: number): RowBlock | undefined {
    return this.inFlight.get(seq);
  }

  /**
   * Keeps one falling note per upcoming instruction (ID, IF, then the next
   * fetches), on the notes' clock: the chart's beat minus the beats `frozen`
   * waiting for memory, so they hold still during a wait. Superscalar: the
   * first two arrive side by side (a chord) when they can start together.
   */
  syncNotes(chartBeat: number, elapsed: number, frozen: number): void {
    const { run } = this.view;
    const { pipeline } = run;
    const { ID, IF } = pipeline.stages;
    const beat = chartBeat - frozen;
    const due = run.dueBeat - run.waitBeats;
    const wanted: { slot: Slot; k: number }[] = [];
    // Superscalar: two that can start together arrive together, a chord, and everything behind them comes a beat sooner.
    const chord = this.view.setup.superscalar && pipeline.pairCheck().ok ? 1 : 0;
    if (ID) wanted.push({ slot: ID, k: 0 });
    if (IF) wanted.push({ slot: IF, k: 1 - chord });
    pipeline.upcoming(LOOKAHEAD).forEach((slot, i) => wanted.push({ slot, k: 2 + i - chord }));

    const keep = new Set<string>();
    for (const { slot, k } of wanted) {
      const key = noteKey(slot);
      keep.add(key);
      const target = due + k;
      const view = this.notes.get(key) ?? this.createNote(key, slot, target);
      view.target = target;
      view.due += (view.target - view.due) * Math.min(1, elapsed / 60);
      if (k === 0 && beat >= view.due) view.pinned = true;
      const y = k === 0 && view.pinned ? HIT_Y : HIT_Y - (view.due - beat) * PX_PER_BEAT;
      view.box.setY(y);
      view.label.setY(y);
      this.syncHint(view, slot);
    }
    // Predictions that will never be fetched (a branch redirected fetch) disappear quietly.
    for (const [key, view] of this.notes) {
      if (keep.has(key)) continue;
      this.notes.delete(key);
      view.box.destroy();
      view.label.destroy();
    }
  }

  /** Moves issued notes down to the row of the stage they're in; drops notes that left WB. */
  syncRows(): void {
    const { run, setup, words } = this.view;
    const { stages, partners } = run.pipeline;
    const present = new Set<number>();
    // Each row's instruction, and superscalar, the second of its pair beside it in its own lane.
    for (const [stage, slot] of (['EX', 'MEM', 'WB'] as const).flatMap((stage) => [[stage, stages[stage]], [stage, partners[stage]]] as const)) {
      if (!slot) continue;
      present.add(slot.seq);
      let block = this.inFlight.get(slot.seq);
      if (!block) {
        // Just issued: hand the falling note over to the rows, starting from the hit line.
        const key = noteKey(slot);
        const note = this.notes.get(key);
        this.notes.delete(key);
        block = { ...(note ?? this.createBlock(slot, HIT_Y)), rowY: setup.rows[stage] };
        // Decided: the branch's hint has done its job, and a 90s button stays pressed in.
        block.hint?.view.destroy();
        block.hint = undefined;
        block.button?.press(true);
        block.box.setY(HIT_Y);
        block.label.setY(HIT_Y).setAlpha(0.85);
        this.inFlight.set(slot.seq, block);
      }
      block.rowY = setup.rows[stage];
      if (stage === 'WB' && !block.result) {
        // In WB the note shows what the instruction did.
        block.label.setVisible(false);
        block.result = this.text(block.box.x, block.box.y, words.result(slot), 15).setOrigin(0.5);
      }
    }
    for (const [seq, block] of this.inFlight) {
      if (present.has(seq)) continue;
      this.inFlight.delete(seq);
      this.view.fades.add([block.box, block.label, ...(block.result ? [block.result] : [])], 200);
    }
  }

  /**
   * Every frame: slides issued notes toward their rows. Driven by real elapsed
   * time rather than tweens, so a slow frame snaps them into place instead of leaving them behind.
   */
  easeRows(elapsed: number): void {
    const t = Math.min(1, elapsed / 50);
    for (const block of this.inFlight.values()) {
      const y = block.box.y + (block.rowY - block.box.y) * t;
      block.box.setY(y);
      block.label.setY(y);
      block.result?.setY(y);
    }
  }

  /** The song is over: the last notes fade out of the rows. */
  empty(): void {
    for (const [seq, block] of this.inFlight) {
      this.inFlight.delete(seq);
      this.view.fades.add([block.box, block.label, ...(block.result ? [block.result] : [])], 200);
    }
  }

  /** A flushed instruction's note: struck through, then faded out. */
  strike(slot: Slot): void {
    const view = this.notes.get(noteKey(slot));
    if (!view) return;
    this.notes.delete(noteKey(slot));
    const strike = this.scene.add.rectangle(view.box.x, view.box.y, NOTE_W + 6, 2, this.era.fg).setDepth(10);
    this.view.fades.add([view.box, view.label, strike], 600);
  }

  private createBlock(slot: Slot, y: number): NoteBlock {
    const { fg, bg, syntax, kind } = this.era;
    const x = laneCenter(unitOf(slot.instr));
    const box = this.scene.add.rectangle(x, y, NOTE_W, NOTE_H, bg).setStrokeStyle(1, fg, 0.6);
    const label = codeLine(this.scene, x, y, tokens(slot.instr, true), syntax, { maxWidth: NOTE_W - 8, center: true });
    this.view.clickable(box, () => this.view.words.note(slot));
    // DOS: a solid black shadow, moving with the note.
    if (kind === 'dos') label.addAt(dropShadow(this.scene.add.graphics(), -NOTE_W / 2, -NOTE_H / 2, NOTE_W, NOTE_H, 5), 0);
    // The 90s desktop: a button, raised until it's played.
    const button = PressButton.create(this.scene, this.era, -NOTE_W / 2, -NOTE_H / 2, NOTE_W, NOTE_H, null);
    if (!button) return { box, label };
    label.addAt(button.edges, 0);
    return { box, label, button };
  }

  private createNote(key: string, slot: Slot, due: number): NoteView {
    const view: NoteView = { ...this.createBlock(slot, -40), due, target: due, pinned: false };
    this.notes.set(key, view);
    return view;
  }

  /**
   * Rings a branch note in the color of its hint. Tier 4: what it did last time.
   * Tiers 5-6: the predictor's guess. Redrawn when that changes, e.g. the next
   * round's branch is on screen when this one is decided.
   */
  private syncHint(view: NoteBlock, slot: Slot): void {
    const hint = this.hintFor(slot);
    if (!hint || (view.hint?.taken === hint.taken && view.hint.sure === hint.sure)) return;
    view.hint?.view.destroy();
    const ring = branchHint(this.scene, NOTE_W, NOTE_H, hint.taken, hint.sure, this.era);
    view.label.add(ring);
    view.hint = { ...hint, view: ring };
  }

  private hintFor(slot: Slot): { taken: boolean; sure: boolean } | undefined {
    const { run, setup } = this.view;
    if (setup.predictor) return run.pipeline.guessFor(slot);
    if (!setup.guessing) return undefined;
    const hint = run.pipeline.hint(slot.pc);
    return hint && { taken: hint.taken, sure: hint.seen };
  }

  // ---- hazards and waits ----

  /**
   * Every frame: when the instruction in ID needs a value still being
   * computed, link it to the instruction below that's computing it, and pulse
   * the waiting note. Tier 4: a branch on the line asks for a guess.
   */
  drawHazard(now: number): void {
    this.hazardLink.clear();
    const { fg } = this.era;
    const { run, setup } = this.view;
    for (const block of this.inFlight.values()) block.box.setStrokeStyle(1, fg, 0.5);
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
      return;
    }
    this.guessTag.setVisible(false);
    waiting.box.setStrokeStyle(2, fg, 0.55 + 0.45 * Math.sin(now / 90));
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
  hideHazard(): void {
    this.hazardLink.clear();
    this.hazardTag.setVisible(false);
  }

  /** Every frame of a memory wait: the waiting note pulses under its tag, its result held back. Returns the note. */
  showWaiting(seq: number, tag: string, now: number): RowBlock | undefined {
    const block = this.inFlight.get(seq);
    if (!block) return undefined;
    block.box.setStrokeStyle(2, this.era.fg, 0.55 + 0.45 * Math.sin(now / 90));
    // Tier 1: the finished load waits in the DONE row; its result only counts once the data arrives.
    block.result?.setVisible(false);
    this.memTag.setText(tag).setPosition(block.box.x, block.box.y - NOTE_H / 2 - 10).setVisible(true);
    return block;
  }

  /** The tag over a waiting note goes (every frame, before it's shown again if the wait goes on). */
  hideWaiting(): void {
    this.memTag.setVisible(false);
  }

  /** The wait is over: the note shows its result again. */
  endWaiting(seq: number): void {
    this.inFlight.get(seq)?.result?.setVisible(true);
  }
}

/** A guess key's label: bright and glowing when it's the hinted guess, dim when not. */
function styleGuess(text: Phaser.GameObjects.Text, hinted: boolean): void {
  const color = String(text.style.color);
  text.setAlpha(hinted ? 1 : 0.3).setFontStyle(hinted ? 'bold' : '');
  if (hinted) text.setShadow(0, 0, color, 8, true, true);
  else text.setShadow(0, 0, color, 0, false, false);
}
