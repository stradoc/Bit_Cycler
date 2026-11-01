import { GLOSSARY } from '../data/glossary.js';
import { tokens } from '../sim/isa.js';
import { BLOCK_BYTES, blockOf, CACHE_LINES, lineOf, tagOf } from '../sim/memory.js';
import { STAGES } from '../sim/pipeline.js';
import { cssColor } from '../ui/eras.js';
import { panel } from '../ui/widgets.js';
import { hintColor } from '../visual/branchHint.js';
import { codeLine } from '../visual/codeLine.js';
import { isSmooth } from '../visual/display.js';
import { bin, BOX_W, BOX_X, hex, LINE, LISTING_LINE, LISTING_ROWS, LISTING_TOP, MEMORY_ROWS, MEMORY_W_CACHED, PANEL_X, REGISTER_COUNT } from './layout.js';
import { Part } from './view.js';
/**
 * The panel on the right: the program listing (scrolling with the
 * instruction in ID), the registers, memory and the L1 cache as values arrive
 * over the bus, the last trip to memory, the stats, and the feedback line.
 */
export class Panel extends Part {
    regTexts = [];
    memTexts = [];
    cacheTexts = [];
    listing;
    listingParts = [];
    /** The listing's lines live in a layer that the modern era slides when it scrolls (clipped to its box). */
    listingLayer;
    listingStart = 0;
    /** How far the lines are still sliding (px): eased to 0 each frame. */
    listingScroll = 0;
    lookupText;
    statsText;
    throughputText;
    feedback;
    /** The count-in's text (key registers and beats left); gone once the song starts. */
    countIn;
    /** Where its boxes are, for the guide to point at (the cache's only once it's bought). */
    areas;
    /** `countInPulse`: the song opens with a count-in, the key registers pulsing this slowly (ms); undefined: no count-in. */
    constructor(view, program, countInPulse) {
        super(view);
        const { setup, clickable, words } = view;
        const { spec } = setup;
        this.listing = listingOf(program);
        const mode = setup.watching ? '   REPLAY' : '';
        // A contract's client goes on top; the program's own name labels its listing.
        this.text(PANEL_X, 4, `${words.tierTitle()}   ${spec.client ?? spec.name}${mode}`, 14).setAlpha(0.7);
        const listingTitle = spec.client ? `PROGRAM: ${spec.name}` : 'PROGRAM';
        clickable(panel(this.scene, this.era, BOX_X, LISTING_TOP - 10, BOX_W, LISTING_ROWS * LISTING_LINE + 16, listingTitle), () => GLOSSARY.PROGRAM);
        this.listingLayer = this.scene.add.container(0, 0);
        if (isSmooth()) {
            const window = this.scene.make.graphics({}, false).fillRect(BOX_X, LISTING_TOP - 1, BOX_W, LISTING_ROWS * LISTING_LINE);
            this.listingLayer.setMask(window.createGeometryMask());
        }
        let y = LISTING_TOP + LISTING_ROWS * LISTING_LINE + 16;
        const listingArea = { x: BOX_X, y: LISTING_TOP - 10, w: BOX_W, h: LISTING_ROWS * LISTING_LINE + 16 };
        const registersArea = { x: BOX_X, y, w: BOX_W, h: 4 * LINE + 20 };
        clickable(panel(this.scene, this.era, BOX_X, y, BOX_W, 4 * LINE + 20, 'REGISTERS  (<- STILL COMPUTING)'), () => GLOSSARY.REGISTERS);
        y += 12;
        // A size smaller than the rest of the panel, so a key register's tag fits beside "<-MEM".
        const keyRegs = new Set((spec.keys ?? []).map((key) => key.reg));
        for (let r = 0; r < REGISTER_COUNT; r++) {
            const column = Math.floor(r / 4);
            const row = this.text(PANEL_X + column * 210, y + (r % 4) * LINE, '', 14).setAlpha(0.8);
            if (keyRegs.has(r))
                row.setFontStyle('bold');
            this.regTexts.push(clickable(row, () => words.register(r)));
        }
        y += 4 * LINE + 18;
        // Memory, 8 bytes (two cache blocks) per row; the L1 cache sits beside it once it's bought.
        const memoryW = setup.l1 ? MEMORY_W_CACHED : BOX_W;
        const memoryArea = { x: BOX_X, y, w: memoryW, h: MEMORY_ROWS * LINE + 20 };
        const cacheArea = { x: BOX_X + memoryW + 6, y, w: BOX_W - memoryW - 6, h: MEMORY_ROWS * LINE + 20 };
        clickable(panel(this.scene, this.era, BOX_X, y, memoryW, MEMORY_ROWS * LINE + 20, 'MEMORY'), () => words.memory());
        if (setup.l1) {
            const cacheX = BOX_X + memoryW + 6;
            clickable(panel(this.scene, this.era, cacheX, y, BOX_W - memoryW - 6, MEMORY_ROWS * LINE + 20, 'L1: LINE TAG DATA'), () => GLOSSARY.CACHE);
            for (let line = 0; line < CACHE_LINES; line++) {
                this.cacheTexts.push(clickable(this.text(cacheX + 8, y + 12 + line * LINE, '', 13).setAlpha(0.8), () => words.cacheLine(line)));
            }
        }
        y += 12;
        for (let row = 0; row < MEMORY_ROWS; row++) {
            this.memTexts.push(clickable(this.text(PANEL_X, y + row * LINE, '', 14).setAlpha(0.8), () => words.memory()));
        }
        y += MEMORY_ROWS * LINE + 12;
        const lookup = setup.l1 ? 'LOADS LOOK IN THE CACHE FIRST' : 'LOADS AND STORES GO TO RAM';
        this.lookupText = clickable(this.text(PANEL_X, y, lookup, 13).setAlpha(0.8), () => (setup.l1 ? GLOSSARY.LOOKUP : GLOSSARY.RAM));
        y += 22;
        this.areas = { listing: listingArea, registers: registersArea, memory: memoryArea, cache: setup.l1 ? cacheArea : memoryArea, stats: { x: BOX_X, y: y - 6, w: BOX_W, h: 64 } };
        this.statsText = clickable(this.text(PANEL_X, y, '', 14).setLineSpacing(3), () => GLOSSARY.STATS);
        y += 36;
        this.throughputText = clickable(this.text(PANEL_X, y, '', 14), () => GLOSSARY.THROUGHPUT);
        y += 22;
        const intro = setup.watching ? 'WATCHING YOUR RUN' : setup.practice ? 'PRACTICE:\nNOTES WAIT FOR YOU' : 'GET READY...';
        this.feedback = this.text(PANEL_X, y, intro, 18).setLineSpacing(4);
        if (countInPulse !== undefined) {
            // The count-in: the key registers pulse in the panel while the text says what they do.
            this.feedback.setVisible(false);
            this.countIn = this.text(PANEL_X, y, this.countInText(view.run.firstBeat), 14).setLineSpacing(4);
            for (const { reg } of spec.keys ?? []) {
                this.scene.tweens.add({ targets: this.regTexts[reg], alpha: 0.35, duration: countInPulse, yoyo: true, repeat: -1 });
            }
        }
        if (setup.watching) {
            // The program listing as one click target; the replay's controls go where the menu's hint is.
            clickable(this.scene.add.zone(PANEL_X, LISTING_TOP, 400, LISTING_ROWS * LISTING_LINE).setOrigin(0), () => GLOSSARY.PROGRAM);
            return;
        }
        this.text(PANEL_X, 512, '[ESC] MENU', 16)
            .setAlpha(0.5)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => view.openMenu());
    }
    /** The feedback line: how the last press went, the clock, a memory wait. */
    say(message) {
        this.feedback.setText(message);
    }
    /** The middles of the rows the bus wires plug into: the first column of registers, then memory. */
    wireRows() {
        return [...this.regTexts.slice(0, 4), ...this.memTexts].map((text) => text.y + 9);
    }
    /** Where the bus delivers a register's value, and a stored byte. */
    registerY(r) {
        return this.regTexts[r].y + 9;
    }
    storeY(address) {
        return this.memTexts[Math.floor(address / 8)].y + 9;
    }
    /** The middle of the memory row holding `address` (undefined past the rows shown). */
    memoryY(address) {
        const row = this.memTexts[Math.floor(address / 8)];
        return row && row.y + row.height / 2;
    }
    // ---- the count-in ----
    get countingIn() {
        return this.countIn !== undefined;
    }
    countInText(beatsLeft) {
        const keys = (this.view.setup.spec.keys ?? []).map((key) => `x${key.reg} = ${key.tag}: ${key.about}`);
        return [`GET READY: ${beatsLeft}`, ...keys].join('\n');
    }
    /** Counts the beats down, then hands the panel over to the song. */
    updateCountIn(beat) {
        const { countIn } = this;
        if (!countIn)
            return;
        const left = Math.ceil(this.view.run.firstBeat - beat);
        if (left > 0) {
            countIn.setText(this.countInText(left));
            return;
        }
        countIn.destroy();
        this.countIn = undefined;
        for (const { reg } of this.view.setup.spec.keys ?? []) {
            this.scene.tweens.killTweensOf(this.regTexts[reg]);
            this.regTexts[reg].setAlpha(1);
        }
        if (!this.view.setup.practice)
            this.feedback.setText('GO!');
        this.feedback.setVisible(true);
    }
    // ---- values arriving ----
    /** A register's new value has arrived over the bus. */
    landRegister(r, value) {
        this.view.shown.regs[r] = value;
        this.refresh();
        this.highlight(this.regTexts[r]);
    }
    /** A stored byte has arrived in memory: its row lights up and the byte is outlined. */
    landStore(address, value) {
        this.view.shown.memory[address] = value;
        this.refresh();
        const row = this.memTexts[Math.floor(address / 8)];
        this.highlight(row);
        this.markByte(row, address % 8);
    }
    /** A load or store reached memory: the lookup line says what it did; a hit lights its cache line. */
    showAccess(lookup, access) {
        this.lookupText.setText(lookup);
        this.highlight(this.lookupText);
        if (access.level === 'L1' || (access.kind === 'store' && access.hit))
            this.flashCacheLine(lineOf(access.address));
    }
    /** A load that missed brings its block into its line (what the panel shows once it has arrived). */
    fillLine(access) {
        if (!this.view.setup.l1 || access.kind !== 'load' || access.hit)
            return;
        const line = lineOf(access.address);
        this.view.shown.lines[line] = { valid: true, tag: tagOf(access.address) };
        this.flashCacheLine(line);
    }
    /** Redraws the listing, registers, memory and cache as they've arrived, plus throughput and stats. */
    refresh() {
        this.refreshListing();
        const { run, shown, setup } = this.view;
        const { pipeline } = run;
        const pending = new Map();
        for (const stage of ['MEM', 'EX']) {
            const wrote = pipeline.stages[stage]?.step?.wrote;
            if (wrote !== undefined)
                pending.set(wrote, stage); // EX overrides MEM: it's newer
        }
        const tags = new Map((setup.spec.keys ?? []).map((key) => [key.reg, key.tag]));
        shown.regs.forEach((value, r) => {
            const where = pending.get(r);
            const tag = tags.get(r);
            this.regTexts[r]
                .setText(`x${r}`.padEnd(4) + `0x${hex(value)} ${String(value).padStart(3)}` + (tag ? ` ${tag}` : '') + (where ? ` <-${where}` : ''))
                .setAlpha(where || tag ? 1 : 0.8);
        });
        const bytes = (block) => Array.from(shown.memory.subarray(block * BLOCK_BYTES, (block + 1) * BLOCK_BYTES), hex).join(' ');
        // A gap between each row's two blocks.
        this.memTexts.forEach((row, i) => row.setText(`${hex(i * 8)}: ${bytes(2 * i)}  ${bytes(2 * i + 1)}`));
        shown.lines.forEach((line, i) => {
            // Write-through keeps a cached block the same as memory, so its bytes are memory's.
            const data = line.valid ? bytes(line.tag * CACHE_LINES + i) : '-- -- -- --';
            this.cacheTexts[i]?.setText(`${i} ${line.valid ? bin(line.tag, 4) : '----'} ${data}`);
        });
        const filled = Math.round(run.throughput * 8);
        this.throughputText.setText(`THROUGHPUT [${'#'.repeat(filled)}${'.'.repeat(8 - filled)}] ${run.throughput.toFixed(2)}`);
        const waited = pipeline.memoryCycles > 0 ? `  WAITING ON RAM ${pipeline.memoryCycles}` : '';
        this.statsText.setText(`CYCLE ${pipeline.cycle}  DONE ${pipeline.instructions}  CPI ${pipeline.cpi.toFixed(2)}  STREAK ${run.streak}\n` +
            `STALLS ${pipeline.stalls}  FLUSHED ${pipeline.flushed}${waited}`);
    }
    /**
     * Redraws the listing window: it scrolls to keep the instruction in ID near
     * the top, marks it with '>', and tags every line that's in a pipeline stage.
     */
    refreshListing() {
        for (const part of this.listingParts)
            part.destroy();
        this.listingParts = [];
        const { run, setup, words } = this.view;
        const { pipeline } = run;
        const stagesAt = new Map();
        for (const stage of STAGES) {
            const slot = pipeline.stages[stage];
            if (slot)
                stagesAt.set(slot.pc, [...(stagesAt.get(slot.pc) ?? []), stage]);
        }
        const focusPc = pipeline.stages.ID?.pc ?? pipeline.stages.IF?.pc ?? pipeline.cpu.pc;
        const focusLine = Math.max(0, this.listing.findIndex((line) => 'pc' in line && line.pc === focusPc));
        const start = Phaser.Math.Clamp(focusLine - 2, 0, Math.max(0, this.listing.length - LISTING_ROWS));
        const { syntax } = this.era;
        // The modern era slides the lines to their new place; while they move, it also draws one line above and below the window.
        if (isSmooth())
            this.listingScroll += (start - this.listingStart) * LISTING_LINE;
        this.listingStart = start;
        this.listingLayer.setY(this.listingScroll);
        const sliding = this.listingScroll !== 0;
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
            if (current)
                this.listingParts.push(this.text(PANEL_X + 4, y, '>', 15));
            if (stages.length > 0)
                this.listingParts.push(this.text(PANEL_X + 250, y, stages.map((st) => words.stageTag(st)).join(' '), 14).setAlpha(0.8));
            if (setup.predictor)
                this.drawPredictorState(line.pc, y);
            else if (setup.guessing)
                this.drawHistory(line.pc, y);
        });
        this.listingLayer.add(this.listingParts);
        // Hint that the program continues beyond the window.
        if (start > 0)
            this.listingParts.push(this.text(PANEL_X + 380, LISTING_TOP, '^', 14).setAlpha(0.6));
        if (start + LISTING_ROWS < this.listing.length) {
            this.listingParts.push(this.text(PANEL_X + 380, LISTING_TOP + (LISTING_ROWS - 1) * LISTING_LINE, 'v', 14).setAlpha(0.6));
        }
    }
    /** Every frame: slides the listing's lines the rest of the way to where they belong. */
    easeListing(elapsed) {
        if (this.listingScroll === 0)
            return;
        this.listingScroll *= Math.exp(-elapsed / 70);
        if (Math.abs(this.listingScroll) < 0.2)
            this.listingScroll = 0;
        this.listingLayer.setY(this.listingScroll);
    }
    /** Tier 4: after a branch in the listing, its last 4 outcomes (T taken, N not taken), oldest first. */
    drawHistory(pc, y) {
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
    drawPredictorState(pc, y) {
        const state = this.view.run.pipeline.predictorState(pc);
        if (state === undefined)
            return;
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
    flashCacheLine(line) {
        const text = this.cacheTexts[line];
        if (!text)
            return;
        this.highlight(text);
        const mark = this.scene.add.rectangle(text.x - 4, text.y + text.height / 2, text.width + 8, text.height + 2).setOrigin(0, 0.5);
        mark.setStrokeStyle(1, this.era.fg).setDepth(690);
        this.view.fades.add([mark], 700);
    }
    /** Outlines the 4-byte block holding `address` in the MEMORY box while it's fetched (`seconds` at least). */
    markBlock(address, seconds) {
        const row = this.memTexts[Math.floor(address / 8)];
        if (!row?.text)
            return;
        const charW = row.width / row.text.length;
        const first = blockOf(address) % 2 === 0 ? 4 : 17; // "00: " then 4 bytes and the gap
        const mark = this.scene.add.rectangle(row.x + first * charW - 3, row.y + row.height / 2, 11 * charW + 6, row.height + 2).setOrigin(0, 0.5);
        mark.setStrokeStyle(1, this.era.fg).setDepth(690);
        this.view.fades.add([mark], Math.max(700, seconds * 1000));
    }
    /** Outlines the byte a store just wrote in a memory row, fading out. */
    markByte(row, column) {
        const charW = row.width / Math.max(1, row.text.length);
        // "00: " then 3 characters per byte, and a gap after the first block.
        const x = row.x + (4 + column * 3 + (column >= BLOCK_BYTES ? 1 : 0) + 1) * charW;
        const mark = this.scene.add.rectangle(x, row.y + row.height / 2, 3 * charW, row.height + 2).setStrokeStyle(1, this.era.fg).setDepth(690);
        this.view.fades.add([mark], 700);
    }
    highlight(text) {
        if (!text)
            return;
        this.scene.tweens.killTweensOf(text);
        text.setAlpha(1);
        // Key registers stay bright; everything else settles back to dim.
        const keyRow = this.view.setup.spec.keys?.some(({ reg }) => this.regTexts[reg] === text);
        if (!keyRow)
            this.scene.tweens.add({ targets: text, alpha: 0.8, duration: 400 });
    }
}
/** The program as the listing shows it: each label on its own line before its instruction. */
function listingOf(program) {
    const lines = [];
    program.instructions.forEach((instr, pc) => {
        for (const [label, target] of program.labels)
            if (target === pc)
                lines.push({ label });
        lines.push({ pc, instr });
    });
    return lines;
}
//# sourceMappingURL=panel.js.map