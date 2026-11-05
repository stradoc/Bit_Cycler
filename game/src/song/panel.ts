import { GLOSSARY } from '../data/glossary.ts';
import { tokens, type Instruction, type Program } from '../sim/isa.ts';
import { itemAt, writeItem } from '../sim/cpu.ts';
import { addressSplit, setsOf, SHOWN_BYTES, type Access } from '../sim/memory.ts';
import { STAGES, type Stage } from '../sim/pipeline.ts';
import { cssColor } from '../ui/eras.ts';
import type { Rect } from '../ui/guide.ts';
import { panel } from '../ui/widgets.ts';
import { hintColor } from '../visual/branchHint.ts';
import { codeLine } from '../visual/codeLine.ts';
import { PACE } from '../data/motions.ts';
import { motionOf } from '../visual/motion.ts';
import { bin, BOX_W, BOX_X, hex, LINE, LISTING_LINE, LISTING_ROWS, LISTING_TOP, MEMORY_ROWS, MEMORY_W_CACHED, PANEL_X, REGISTER_COUNT } from './layout.ts';
import { Part, type SongView } from './view.ts';

/** A line of the program listing: a label, or an instruction at a pc. */
type ListingLine = { label: string } | { pc: number; instr: Instruction };

/** A row of the memory box: its text, and where each byte or number in it is (its bytes, and its characters). */
type MemoryRow = { readonly text: string; readonly cells: readonly { readonly from: number; readonly to: number; readonly at: number; readonly len: number }[] };

/** How wide each number is drawn in the memory box, by the data's width: a row is always 8 bytes. */
const CELL_CHARS: Readonly<Record<16 | 32 | 64, number>> = { 16: 5, 32: 9, 64: 13 };

/**
 * The panel on the right: the program listing (scrolling with the
 * instruction in ID), the registers, memory and the L1 cache as values arrive
 * over the bus, the last trip to memory, the stats, and the feedback line.
 */
export class Panel extends Part {
  private readonly regTexts: Phaser.GameObjects.Text[] = [];
  private readonly memTexts: Phaser.GameObjects.Text[] = [];
  private readonly cacheTexts: Phaser.GameObjects.Text[] = [];
  private readonly listing: ListingLine[];
  private listingParts: Phaser.GameObjects.GameObject[] = [];
  /** The listing's lines live in a layer that the modern era slides when it scrolls (clipped to its box). */
  private readonly listingLayer: Phaser.GameObjects.Container;
  private listingStart = 0;
  /** The memory box is a window of MEMORY_ROWS rows of 8 bytes, from this row: wider data needs more rows than fit (byte jobs: all of them). */
  private memStart = 0;
  private readonly memRowCount: number;
  private readonly lookupText: Phaser.GameObjects.Text;
  private readonly statsText: Phaser.GameObjects.Text;
  private readonly throughputText: Phaser.GameObjects.Text;
  private readonly feedback: Phaser.GameObjects.Text;
  /** The count-in's text (key registers and beats left); gone once the song starts. */
  private countIn: Phaser.GameObjects.Text | undefined;
  /** Where its boxes are, for the guide to point at (the cache's only once it's bought). */
  readonly areas: Record<'listing' | 'registers' | 'memory' | 'cache' | 'lookup' | 'stats', Rect>;

  /** `countInBeatMs`: the song opens with a count-in, the key registers pulsing with its beats (ms each); undefined: no count-in. */
  constructor(view: SongView, program: Program, countInBeatMs: number | undefined) {
    super(view);
    const { setup, clickable, words } = view;
    // A job's data fits in 32 items: 32 bytes for bytes, up to 256 for 64-bit numbers.
    this.memRowCount = (SHOWN_BYTES * (setup.dataBits / 8)) / 8;
    const { spec } = setup;
    this.listing = listingOf(program);
    const mode = setup.watching ? '   REPLAY' : '';
    // A contract's client goes on top; the program's own name labels its listing.
    this.text(PANEL_X, 4, `${words.tierTitle()}   ${spec.client ?? spec.name}${mode}`, 14).setAlpha(0.7);
    const listingTitle = spec.client ? `PROGRAM: ${spec.name}` : 'PROGRAM';
    clickable(panel(this.scene, this.era, BOX_X, LISTING_TOP - 10, BOX_W, LISTING_ROWS * LISTING_LINE + 16, listingTitle), () => GLOSSARY.PROGRAM);
    this.listingLayer = this.scene.add.container(0, 0);
    // Lines slide to their new place, so only the listing's window shows them.
    const window = this.scene.make.graphics({}, false).fillRect(BOX_X, LISTING_TOP - 1, BOX_W, LISTING_ROWS * LISTING_LINE);
    this.listingLayer.setMask(window.createGeometryMask());
    let y = LISTING_TOP + LISTING_ROWS * LISTING_LINE + 16;
    const listingArea = { x: BOX_X, y: LISTING_TOP - 10, w: BOX_W, h: LISTING_ROWS * LISTING_LINE + 16 };
    const registersArea = { x: BOX_X, y, w: BOX_W, h: 4 * LINE + 20 };
    const wide = setup.dataBits === 8 ? '' : ` ${setup.dataBits}-BIT`;
    clickable(panel(this.scene, this.era, BOX_X, y, BOX_W, 4 * LINE + 20, `REGISTERS${wide}  (<- STILL COMPUTING)`), () => GLOSSARY.REGISTERS);
    y += 12;
    // A size smaller than the rest of the panel, so a key register's tag fits beside "<-MEM".
    const keyRegs = new Set((spec.keys ?? []).map((key) => key.reg));
    for (let r = 0; r < REGISTER_COUNT; r++) {
      const column = Math.floor(r / 4);
      const row = this.text(PANEL_X + column * 210, y + (r % 4) * LINE, '', 14).setAlpha(0.8);
      if (keyRegs.has(r)) row.setFontStyle('bold');
      this.regTexts.push(clickable(row, () => words.register(r)));
    }
    y += 4 * LINE + 18;
    // Memory, 8 bytes (two cache blocks) per row; the L1 cache sits beside it once it's bought.
    const memoryW = setup.l1 ? MEMORY_W_CACHED : BOX_W;
    const memoryArea = { x: BOX_X, y, w: memoryW, h: MEMORY_ROWS * LINE + 20 };
    const cacheArea = { x: BOX_X + memoryW + 6, y, w: BOX_W - memoryW - 6, h: MEMORY_ROWS * LINE + 20 };
    clickable(panel(this.scene, this.era, BOX_X, y, memoryW, MEMORY_ROWS * LINE + 20, 'MEMORY'), () => words.memory());
    if (setup.l1) {
      const cache = setup.l1;
      const cacheX = BOX_X + memoryW + 6;
      const cacheW = BOX_W - memoryW - 6;
      clickable(panel(this.scene, this.era, cacheX, y, cacheW, MEMORY_ROWS * LINE + 20, words.cacheTitle()), () => words.cache());
      // A line a row while they fit; 8 lines take two columns (a set a row, if they're 2-way).
      const columns = Math.ceil(cache.lines / MEMORY_ROWS);
      // A 2-way set's longer tag makes its rows a character longer than the first L1's: a size smaller keeps them in the box.
      const size = addressSplit(cache).tag > 4 ? 12 : 13;
      for (let line = 0; line < cache.lines; line++) {
        const [row, column] = cachePlace(line, cache.ways, columns);
        const text = this.text(cacheX + 8 + (column * (cacheW - 16)) / columns, y + 12 + row * LINE, '', size).setAlpha(0.8);
        this.cacheTexts.push(clickable(text, () => words.cacheLine(line)));
      }
    }
    y += 12;
    for (let row = 0; row < MEMORY_ROWS; row++) {
      this.memTexts.push(clickable(this.text(PANEL_X, y + row * LINE, '', 14).setAlpha(0.8), () => words.memory()));
    }
    y += MEMORY_ROWS * LINE + 12;
    this.lookupText = clickable(this.text(PANEL_X, y, words.lookupStart(), 13).setAlpha(0.8), () => (setup.l1 ? words.lookupInfo() : GLOSSARY.RAM));
    const lookupArea = { x: BOX_X, y: y - 4, w: BOX_W, h: 22 };
    y += 22;
    this.areas = { listing: listingArea, registers: registersArea, memory: memoryArea, cache: setup.l1 ? cacheArea : memoryArea, lookup: lookupArea, stats: { x: BOX_X, y: y - 6, w: BOX_W, h: 64 } };
    this.statsText = clickable(this.text(PANEL_X, y, '', 14).setLineSpacing(3), () => GLOSSARY.STATS);
    y += 36;
    this.throughputText = clickable(this.text(PANEL_X, y, '', 14), () => GLOSSARY.THROUGHPUT);
    y += 22;
    const intro = setup.watching ? 'WATCHING YOUR RUN' : setup.practice ? 'PRACTICE:\nNOTES WAIT FOR YOU' : 'GET READY...';
    this.feedback = this.text(PANEL_X, y, intro, 18).setLineSpacing(4);
    if (countInBeatMs !== undefined) {
      // The count-in: the key registers pulse in the panel while the text says what they do.
      this.feedback.setVisible(false);
      this.countIn = this.text(PANEL_X, y, this.countInText(view.run.firstBeat), 14).setLineSpacing(4);
      motionOf(this.scene).play('count-in-pulse', (spec.keys ?? []).map(({ reg }) => this.regTexts[reg]), { beatMs: countInBeatMs });
    }
    if (setup.watching) {
      // The program listing as one click target; the replay's controls go where the menu's hint is.
      clickable(this.scene.add.zone(PANEL_X, LISTING_TOP, 400, LISTING_ROWS * LISTING_LINE).setOrigin(0), () => GLOSSARY.PROGRAM);
      return;
    }
    this.text(PANEL_X, 512, '[Q] MENU', 16)
      .setAlpha(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => view.openMenu());
  }

  /** The feedback line: how the last press went, the clock, a memory wait. */
  say(message: string): void {
    this.feedback.setText(message);
  }

  /** Where register `r`'s row is, for the guide to point at. */
  registerArea(r: number): Rect {
    const row = this.regTexts[r];
    return { x: row.x - 6, y: row.y - 3, w: 200, h: row.height + 6 };
  }

  /** The middles of the rows the bus wires plug into: the first column of registers, then memory. */
  wireRows(): number[] {
    return [...this.regTexts.slice(0, 4), ...this.memTexts].map((text) => text.y + 9);
  }

  /** Where the bus delivers a register's value, and a stored byte. */
  registerY(r: number): number {
    return this.regTexts[r].y + 9;
  }

  storeY(address: number): number {
    return this.memRow(address).y + 9;
  }

  /** The middle of the memory row holding `address` (the window moves to show it). */
  memoryY(address: number): number | undefined {
    const row = this.memRow(address);
    return row.y + row.height / 2;
  }

  /** The memory box's row holding `address`, moving the window to show it (byte jobs never move: all their rows fit). */
  private memRow(address: number): Phaser.GameObjects.Text {
    const row = Math.floor(address / 8);
    if (row < this.memStart || row >= this.memStart + MEMORY_ROWS) {
      this.memStart = Math.max(0, Math.min(this.memRowCount - MEMORY_ROWS, row - 1));
      this.refresh();
    }
    return this.memTexts[row - this.memStart];
  }

  /**
   * Row `row` of memory (8 bytes) as the memory box shows it: bytes in hex,
   * a gap between its two cache blocks; wider data as its numbers, in decimal.
   */
  private memoryRow(row: number): MemoryRow {
    const { shown, setup } = this.view;
    const base = row * 8;
    const head = `${hex(base)}: `;
    const cells: { from: number; to: number; at: number; len: number }[] = [];
    if (setup.dataBits === 8) {
      // Two groups of 4, the first L1's blocks.
      for (let i = 0; i < 8; i++) cells.push({ from: base + i, to: base + i + 1, at: head.length + i * 3 + (i >= 4 ? 1 : 0), len: 2 });
      const bytes = (from: number) => Array.from(shown.memory.subarray(from, from + 4), hex).join(' ');
      return { text: `${head}${bytes(base)}  ${bytes(base + 4)}`, cells };
    }
    const size = setup.dataBits / 8;
    const width = CELL_CHARS[setup.dataBits];
    const gap = setup.dataBits === 16 ? 1 : 2;
    const numbers: string[] = [];
    for (let i = 0; i < 8 / size; i++) {
      const from = base + i * size;
      cells.push({ from, to: from + size, at: head.length + i * (width + gap), len: width });
      numbers.push(String(itemAt(shown.memory, from, setup.dataBits)).padStart(width));
    }
    return { text: head + numbers.join(' '.repeat(gap)), cells };
  }

  /**
   * A cache line as its box shows it: its set (or line) number, its tag, and
   * while a line a row fits, its block: the bytes, or for 8-byte blocks which
   * bytes they are. Write-through keeps a cached block the same as memory, so
   * its bytes are memory's.
   */
  private cacheEntry(line: number): string {
    const cache = this.view.setup.l1;
    if (!cache) return '';
    const { valid, tag } = this.view.shown.lines[line];
    const sets = setsOf(cache);
    const set = Math.floor(line / cache.ways);
    const tagBits = addressSplit(cache).tag;
    const tagText = valid ? bin(tag, tagBits) : '-'.repeat(tagBits);
    const from = (tag * sets + set) * cache.blockBytes;
    if (cache.lines > MEMORY_ROWS) {
      // Two columns: a set's lines side by side under one number, or lines 0-3 then 4-7.
      if (cache.ways > 1) return line % cache.ways === 0 ? `${set} ${tagText}` : tagText;
      return `${line} ${tagText}`;
    }
    const block =
      cache.blockBytes > 4
        ? valid ? `${from}-${from + cache.blockBytes - 1}` : '--'
        : valid ? Array.from(this.view.shown.memory.subarray(from, from + cache.blockBytes), hex).join(' ') : '-- -- -- --';
    return `${cache.ways > 1 ? set : line} ${tagText} ${block}`;
  }

  // ---- the count-in ----

  get countingIn(): boolean {
    return this.countIn !== undefined;
  }

  private countInText(beatsLeft: number): string {
    const keys = (this.view.setup.spec.keys ?? []).map((key) => `x${key.reg} = ${key.tag}: ${key.about}`);
    return [`GET READY: ${beatsLeft}   ${this.view.words.music()}`, ...keys].join('\n');
  }

  /** Counts the beats down, then hands the panel over to the song. */
  updateCountIn(beat: number): void {
    const { countIn } = this;
    if (!countIn) return;
    const left = Math.ceil(this.view.run.firstBeat - beat);
    if (left > 0) {
      countIn.setText(this.countInText(left));
      return;
    }
    countIn.destroy();
    this.countIn = undefined;
    for (const { reg } of this.view.setup.spec.keys ?? []) {
      motionOf(this.scene).stop(this.regTexts[reg]);
      this.regTexts[reg].setAlpha(1);
    }
    if (!this.view.setup.practice) this.feedback.setText('GO!');
    this.feedback.setVisible(true);
  }

  // ---- values arriving ----

  /** A register's new value has arrived over the bus. */
  landRegister(r: number, value: number): void {
    this.view.shown.regs[r] = value;
    this.refresh();
    this.highlight(this.regTexts[r]);
  }

  /** A stored item has arrived in memory: its row lights up and the item is outlined. */
  landStore(address: number, value: number): void {
    writeItem(this.view.shown.memory, address, this.view.setup.dataBits / 8, value);
    const row = this.memRow(address);
    this.refresh();
    this.highlight(row);
    this.markBytes(address, address + this.view.setup.dataBits / 8, PACE.linger);
  }

  /** A load or store reached memory: the lookup line says what it did; a hit lights its cache line. */
  showAccess(lookup: string, access: Access): void {
    this.lookupText.setText(lookup);
    this.highlight(this.lookupText);
    for (const line of access.used ?? []) this.flashCacheLine(line);
  }

  /** A load that missed brings its blocks into their lines (what the panel shows once they've arrived). */
  fillLine(access: Access): void {
    const cache = this.view.setup.l1;
    if (!cache || access.kind !== 'load' || access.hit) return;
    for (const { block, line } of access.fills ?? []) {
      this.view.shown.lines[line] = { valid: true, tag: Math.floor(block / setsOf(cache)) };
      this.flashCacheLine(line);
    }
  }

  /** Redraws the listing, registers, memory and cache as they've arrived, plus throughput and stats. */
  refresh(): void {
    this.refreshListing();
    const { run, shown, setup } = this.view;
    const { pipeline } = run;
    const pending = new Map<number, string>();
    for (const stage of ['MEM', 'EX'] as const) {
      for (const slot of pipeline.inStage(stage)) {
        const wrote = slot.step?.wrote;
        if (wrote !== undefined) pending.set(wrote, stage); // EX overrides MEM, and a pair's second its first: they're newer
      }
    }
    const tags = new Map((setup.spec.keys ?? []).map((key) => [key.reg, key.tag]));
    shown.regs.forEach((value, r) => {
      const where = pending.get(r);
      const tag = tags.get(r);
      this.regTexts[r]
        .setText(`x${r}`.padEnd(4) + registerValue(value, setup.dataBits) + (tag ? ` ${tag}` : '') + (where ? ` <-${where}` : ''))
        .setAlpha(where || tag ? 1 : 0.8);
    });
    this.memTexts.forEach((row, i) => row.setText(this.memoryRow(this.memStart + i).text));
    this.cacheTexts.forEach((text, line) => text.setText(this.cacheEntry(line)));

    // A superscalar CPU can finish two a cycle, so its bar is full at 2.
    const filled = Math.min(8, Math.round((run.throughput / (this.view.setup.superscalar ? 2 : 1)) * 8));
    this.throughputText.setText(`THROUGHPUT [${'#'.repeat(filled)}${'.'.repeat(8 - filled)}] ${run.throughput.toFixed(2)}`);
    const waited = (pipeline.memoryCycles > 0 ? `  ${this.view.words.waitedWord()} ${pipeline.memoryCycles}` : '') + (pipeline.refillCycles > 0 ? `  REFILLS ${pipeline.refillCycles}` : '');
    this.statsText.setText(
      `CYCLE ${pipeline.cycle}  DONE ${pipeline.instructions}  CPI ${pipeline.cpi.toFixed(2)}  STREAK ${run.streak}\n` +
        `STALLS ${pipeline.stalls}  FLUSHED ${pipeline.flushed}${waited}`,
    );
  }

  /**
   * Redraws the listing window: it scrolls to keep the instruction in ID near
   * the top, marks it with '>', and tags every line that's in a pipeline stage.
   */
  private refreshListing(): void {
    for (const part of this.listingParts) part.destroy();
    this.listingParts = [];
    const { run, setup, words } = this.view;
    const { pipeline } = run;
    const stagesAt = new Map<number, Stage[]>();
    for (const stage of STAGES) {
      for (const slot of pipeline.inStage(stage)) stagesAt.set(slot.pc, [...(stagesAt.get(slot.pc) ?? []), stage]);
    }
    const focusPc = pipeline.stages.ID?.pc ?? pipeline.stages.IF?.pc ?? pipeline.cpu.pc;
    const focusLine = Math.max(0, this.listing.findIndex((line) => 'pc' in line && line.pc === focusPc));
    const start = Phaser.Math.Clamp(focusLine - 2, 0, Math.max(0, this.listing.length - LISTING_ROWS));
    const { syntax } = this.era;
    // The lines slide to their new place; while they move, one line above and below the window is drawn too.
    if (start !== this.listingStart) {
      this.listingLayer.setY(this.listingLayer.y + (start - this.listingStart) * LISTING_LINE);
      motionOf(this.scene).play('listing-scroll', this.listingLayer, { goal: { y: 0 } });
    }
    this.listingStart = start;
    const sliding = this.listingLayer.y !== 0;
    const first = sliding ? Math.max(0, start - 1) : start;

    this.listing.slice(first, start + LISTING_ROWS + (sliding ? 1 : 0)).forEach((line, i) => {
      const y = LISTING_TOP + (first + i - start) * LISTING_LINE;
      if ('label' in line) {
        this.listingParts.push(this.text(PANEL_X + 4, y, `${line.label}:`, 15).setColor(cssColor(syntax.label)).setAlpha(0.8));
        return;
      }
      const stages = stagesAt.get(line.pc) ?? [];
      const current = line.pc === focusPc;
      const code = codeLine(this.scene, PANEL_X + 22, y, tokens(line.instr), syntax, { size: 15, originY: 0 });
      this.listingParts.push(code.setAlpha(current ? 1 : stages.length > 0 ? 0.8 : 0.45));
      if (current) this.listingParts.push(this.text(PANEL_X + 4, y, '>', 15));
      if (stages.length > 0) this.listingParts.push(this.text(PANEL_X + 250, y, stages.map((st) => words.stageTag(st)).join(' '), 14).setAlpha(0.8));
      if (setup.predictor) this.drawPredictorState(line.pc, y);
      else if (setup.guessing) this.drawHistory(line.pc, y);
    });
    this.listingLayer.add(this.listingParts);
    // Hint that the program continues beyond the window.
    if (start > 0) this.listingParts.push(this.text(PANEL_X + 380, LISTING_TOP, '^', 14).setAlpha(0.6));
    if (start + LISTING_ROWS < this.listing.length) {
      this.listingParts.push(this.text(PANEL_X + 380, LISTING_TOP + (LISTING_ROWS - 1) * LISTING_LINE, 'v', 14).setAlpha(0.6));
    }
  }

  /** Tier 4: after a branch in the listing, its last 4 outcomes (T taken, N not taken), oldest first. */
  private drawHistory(pc: number, y: number): void {
    const outcomes = this.view.run.pipeline.history.get(pc)?.slice(-4) ?? [];
    outcomes.forEach((taken, i) => {
      const letter = this.text(PANEL_X + 192 + i * 14, y, taken ? 'T' : 'N', 14).setColor(cssColor(hintColor(this.era, taken)));
      this.listingParts.push(this.view.clickable(letter, () => GLOSSARY.HISTORY));
    });
  }

  /**
   * Tiers 5-6: after a branch in the listing, its predictor entry: N T (1-bit)
   * or N n t T (2-bit: strong and weak), with the current state lit.
   */
  private drawPredictorState(pc: number, y: number): void {
    const state = this.view.run.pipeline.predictorState(pc);
    if (state === undefined) return;
    const cells = this.view.setup.predictor === '1-bit' ? ['N', 'T'] : ['N', 'n', 't', 'T'];
    cells.forEach((cell, i) => {
      const taken = i >= cells.length / 2;
      const text = this.text(PANEL_X + 192 + i * 14, y, cell, 14).setColor(cssColor(hintColor(this.era, taken)));
      text.setAlpha(i === state ? 1 : 0.25).setFontStyle(i === state ? 'bold' : '');
      this.listingParts.push(this.view.clickable(text, () => this.view.words.predictorState(pc)));
    });
  }

  // ---- marks ----

  /** Lights a cache line as it's used or filled. */
  private flashCacheLine(line: number): void {
    const text = this.cacheTexts[line];
    if (!text) return;
    this.highlight(text);
    const mark = this.scene.add.rectangle(text.x - 4, text.y + text.height / 2, text.width + 8, text.height + 2).setOrigin(0, 0.5);
    mark.setStrokeStyle(1, this.era.fg).setDepth(690);
    motionOf(this.scene).play('mark-fade', mark, { remove: true });
  }

  /** Outlines what a trip to RAM brings in the MEMORY box while it comes (`seconds` at least): the blocks that missed, or without a cache the item. */
  markBlock(access: Access, seconds: number): void {
    const cache = this.view.setup.l1;
    const fills = access.fills ?? [];
    const [from, to] =
      cache && fills.length > 0
        ? [fills[0].block * cache.blockBytes, (fills[fills.length - 1].block + 1) * cache.blockBytes]
        : [access.address, access.address + access.size];
    this.markBytes(from, to, Math.max(PACE.linger, seconds * 1000));
  }

  /**
   * Outlines bytes `from` to `to` (not included) in the MEMORY box, fading
   * out over `ms`: the bytes, or the numbers they're part of. Bytes past the
   * row (a 64-bit number in 4-byte blocks spans one) are outlined up to its end.
   */
  private markBytes(from: number, to: number, ms: number): void {
    const text = this.memRow(from);
    const { cells } = this.memoryRow(Math.floor(from / 8));
    const touched = cells.filter((cell) => cell.from < to && cell.to > from);
    if (touched.length === 0 || !text.text) return;
    const charW = text.width / text.text.length;
    const start = touched[0].at * charW - 3;
    const end = (touched[touched.length - 1].at + touched[touched.length - 1].len) * charW + 3;
    const mark = this.scene.add.rectangle(text.x + start, text.y + text.height / 2, end - start, text.height + 2).setOrigin(0, 0.5);
    mark.setStrokeStyle(1, this.era.fg).setDepth(690);
    motionOf(this.scene).play('mark-fade', mark, { remove: true, duration: ms });
  }

  private highlight(text: Phaser.GameObjects.Text | undefined): void {
    if (!text) return;
    const motion = motionOf(this.scene);
    motion.stop(text);
    text.setAlpha(1);
    // Key registers stay bright; everything else settles back to dim.
    const keyRow = this.view.setup.spec.keys?.some(({ reg }) => this.regTexts[reg] === text);
    if (!keyRow) motion.play('value-settle', text);
  }
}

/**
 * Where a cache line goes in its box: its row and column. A line a row in
 * one column; in two, a set's lines side by side (2-way), or lines 0-3 then 4-7.
 */
function cachePlace(line: number, ways: number, columns: number): [number, number] {
  if (columns === 1) return [line, 0];
  if (ways === columns) return [Math.floor(line / ways), line % ways];
  return [line % MEMORY_ROWS, Math.floor(line / MEMORY_ROWS)];
}

/** The program as the listing shows it: each label on its own line before its instruction. */
function listingOf(program: Program): ListingLine[] {
  const lines: ListingLine[] = [];
  program.instructions.forEach((instr, pc) => {
    for (const [label, target] of program.labels) if (target === pc) lines.push({ label });
    lines.push({ pc, instr });
  });
  return lines;
}

/** A register's value as the panel shows it: a byte in hex and decimal; wider data in decimal only, like the memory box (hex wouldn't leave room for the tags). */
function registerValue(value: number, bits: number): string {
  return bits === 8 ? `0x${hex(value)} ${String(value).padStart(3)}` : String(value).padStart(6);
}
