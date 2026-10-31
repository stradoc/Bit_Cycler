import { GLOSSARY, type Entry } from '../data/glossary.ts';
import { formatDuration, formatMhz } from '../format.ts';
import type { Decision, Outcome, PipelineRun } from '../rhythm/pipelineRun.ts';
import { describe, format, UNIT_ROLES, unitOf } from '../sim/isa.ts';
import { BLOCK_BYTES, blockOf, CACHE_LINES, lineOf, MEMORY_TIMING, tagOf, type Access, type MissKind } from '../sim/memory.ts';
import type { Hazard, Slot, Stage } from '../sim/pipeline.ts';
import type { Chip } from '../sim/thermal.ts';
import { THERMAL } from '../sim/thermal.ts';
import { addressBits, bin, LANE_KEYS, MISS_WORDS, STAGE_NAMES, type FreezeView } from './layout.ts';
import type { SongSetup } from './setup.ts';
import type { Shown } from './view.ts';

// Everything the song screen says: the feedback under the stats, practice's
// tips, and what each thing is when clicked in a replay. Words only: the
// screen decides when to show them.

/** A practice tip, shown once per song (`id`). */
export type Tip = { readonly id: string; readonly message: string };

export class SongWords {
  private readonly run: PipelineRun;
  private readonly setup: SongSetup;
  private readonly shown: Shown;
  /** Each load and store's trip to memory, by seq (clicking its note in a replay explains it). */
  private readonly accesses = new Map<number, Access>();

  constructor(run: PipelineRun, setup: SongSetup, shown: Shown) {
    this.run = run;
    this.setup = setup;
    this.shown = shown;
  }

  /** Remembers a load or store's trip, to explain its note later. */
  remember(slot: Slot, access: Access): void {
    this.accesses.set(slot.seq, access);
  }

  tierTitle(): string {
    const { singleCycle, predictor, guessing, forwarding } = this.setup;
    if (singleCycle) return 'TIER 1: SINGLE-CYCLE';
    if (predictor) return `TIER ${predictor === '1-bit' ? 5 : 6}: ${predictor.toUpperCase()} PREDICTOR`;
    if (guessing) return 'TIER 4: BRANCH PREDICTION';
    return forwarding ? 'TIER 3: FORWARDING' : 'TIER 2: PIPELINE';
  }

  // ---- feedback ----

  /** After a key press: how it went (an issued note's timing and streak, a stall, or the mistake). */
  decision(d: Decision, streak: number): string | undefined {
    switch (d.outcome) {
      case 'issued':
        return `${d.waited ? 'GO' : d.judgment}${streak >= 4 ? `\nSTREAK ${streak}` : ''}`;
      case 'stalled':
        return `STALL: WAITING FOR x${d.hazard?.reg}`;
      case 'wasted-stall':
        return 'NOTHING TO WAIT FOR:\nA WASTED CYCLE';
      case 'violation': {
        const h = d.hazard;
        return `DATA HAZARD! x${h?.reg} WASN'T READY\n(READ ${h ? this.run.pipeline.regs[h.reg] : 0}, NEEDED ${h?.producer.value})\nFLUSHED`;
      }
      case 'wrong-unit':
        return `WRONG UNIT: ${d.slot.instr.op}\nRUNS ON ${unitOf(d.slot.instr)}`;
      case 'off-beat':
        return 'OFF BEAT: STALLED';
      case 'missed':
        return undefined; // said when the cycle closes
    }
  }

  /** No key in time: a note waiting on the line has no beat to miss, it just lost a cycle. */
  missed(waited: boolean): string {
    return waited ? 'LATE: +1 CYCLE' : 'MISSED: STALLED';
  }

  /** G / H: the dial moved to `dial`, or (`moved` false) couldn't go further that way. */
  dial(chip: Chip, direction: 1 | -1, moved: boolean, ratedMhz: number): string {
    const percent = Math.round(chip.dial * 100);
    if (!moved) {
      const limit = direction > 0 ? `MAX CLOCK: ${percent}%` : `MIN CLOCK: ${percent}%`;
      const why =
        direction < 0
          ? "CAN'T GO FURTHER"
          : chip.maxDial < THERMAL.maxDial && (chip.canOverclock || chip.maxDial <= 1)
            ? 'CHIP DAMAGED BY HEAT'
            : !chip.canOverclock
              ? 'OVERCLOCKING: IN THE SHOP'
              : "CAN'T GO FURTHER";
      return `${limit}\n${why}`;
    }
    const note = chip.halted ? 'CLOCK STOPPED: COOLING' : chip.dial > 1 ? 'OVERCLOCKED: WATCH THE HEAT' : chip.dial < 1 ? 'UNDERCLOCKED: RUNS COOLER' : 'RATED CLOCK';
    return `CLOCK ${percent}% (${formatMhz(ratedMhz * chip.dial)})\n${note}`;
  }

  /** G / H in practice. */
  practiceClock(): string {
    return 'PRACTICE RUNS AT\nTHE RATED CLOCK';
  }

  /** While the clock is stopped to cool, and once it runs again. */
  halted(chip: Chip): string {
    const worn = chip.maxDial <= 1 ? 'CHIP WORN OUT: [G] OR REPAIR' : `CHIP DAMAGED: MAX ${Math.round(chip.maxDial * 100)}%`;
    return `OVERHEATED: CLOCK STOPPED\nCOOLING ${Math.round(chip.temperature)}°C -> ${Math.round(chip.resumeAt)}°C\n${worn}`;
  }

  resumed(chip: Chip): string {
    return `COOLED: CLOCK RUNNING\nAGAIN AT ${Math.round(chip.dial * 100)}%`;
  }

  /** A memory wait, `counted` of its cycles gone by. */
  waiting(view: FreezeView, counted: number): string {
    const { access } = view;
    const why = this.setup.l1 ? `MISS: ${MISS_WORDS[access.missKind ?? 'first-use']}` : access.kind === 'store' ? 'STORE: WRITING TO RAM' : 'LOAD: WAITING ON RAM';
    const ns = MEMORY_TIMING.ramNs + (this.setup.l1 ? MEMORY_TIMING.l1Ns : 0);
    return `${why}\n${counted} / ${view.total} CYCLES FROZEN\n${ns} ns = ${access.cycles} AT ${formatMhz(this.run.chip.mhz)}`;
  }

  /** The tag over a note waiting on memory. */
  waitingTag(access: Access): string {
    return this.setup.l1 ? 'MISS -> RAM' : access.kind === 'store' ? 'WRITING TO RAM' : 'WAITING ON RAM';
  }

  /** The value on the bus during a wait: the address asked for, then what came back (`back`). */
  trip(access: Access, back: boolean, value: number): string {
    if (access.kind === 'store') return back ? 'DONE' : `[${access.address}]`;
    return back ? `=${value}` : `[${access.address}]?`;
  }

  arrived(): string {
    return this.setup.l1 ? 'BLOCK ARRIVED:\nGO!' : 'DATA ARRIVED:\nGO!';
  }

  /** What the last access did, in one line: "lb 5: 0000 01 01 LINE 1 TAG 0 -> HIT". */
  lookup(slot: Slot, access: Access): string {
    const what = `${slot.instr.op} ${access.address}`;
    if (!this.setup.l1) {
      const ns = MEMORY_TIMING.ramNs;
      return access.cycles > 1
        ? `${what} -> RAM: ${ns} ns = ${access.cycles} CYCLES AT ${formatMhz(this.run.chip.mhz)}`
        : `${what} -> RAM: ${ns} ns FITS IN ONE ${formatDuration(1e-6 / this.run.chip.mhz)} CYCLE`;
    }
    const where = `${what}: ${addressBits(access.address)} LINE ${lineOf(access.address)} TAG ${tagOf(access.address)}`;
    if (access.kind === 'store') return `${where} -> ${access.hit ? 'HIT, ' : ''}WRITE BUFFER`;
    return `${where} -> ${access.hit ? 'HIT' : `MISS (${MISS_WORDS[access.missKind ?? 'first-use']})`}`;
  }

  /** What an instruction did, in a few characters (shown on its note in WB). */
  result(slot: Slot): string {
    const step = slot.step;
    if (step?.wrote !== undefined) return `x${step.wrote} = ${slot.value}`;
    if (step?.stored !== undefined) return `mem[${step.stored}] = ${this.run.pipeline.cpu.memory[step.stored]}`;
    if (step?.taken !== undefined) return step.taken ? 'BRANCH TAKEN' : 'NOT TAKEN';
    return 'x0 stays 0';
  }

  /** A branch was decided (`predicted`: the hardware predictor's guess, tiers 5-6). Tiers 2-3 always guess "not taken". */
  branch(mispredicted: boolean, taken: boolean, predicted: boolean | undefined): { feedback?: string; tip?: Tip } {
    if (predicted !== undefined) return this.predictorResult(mispredicted, taken, predicted);
    if (!this.setup.guessing) {
      if (!mispredicted) return {};
      return {
        feedback: 'BRANCH TAKEN:\nWRONG NEXT INSTRUCTION FLUSHED',
        tip: { id: 'branch', message: 'BRANCH TAKEN: the instruction behind\nit was the wrong one, so it was\nflushed. Costs 1 cycle, not your fault.' },
      };
    }
    const feedback = mispredicted ? 'WRONG GUESS:\nNEXT INSTRUCTION FLUSHED' : `GOOD GUESS: ${taken ? 'TAKEN' : 'NOT TAKEN'}\nNO CYCLE LOST`;
    if (mispredicted) return { feedback, tip: { id: 'wrong-guess', message: 'WRONG GUESS: the CPU fetched the wrong\nnext instruction, so it was flushed.\nIt cost 1 cycle.' } };
    if (taken) return { feedback, tip: { id: 'right-guess', message: "RIGHT GUESS: the loop's first instruction\nwas fetched straight away.\nNo cycle lost." } };
    return { feedback };
  }

  /** Tiers 5-6: did the player follow the predictor or override it, and how did that turn out? */
  private predictorResult(mispredicted: boolean, taken: boolean, predicted: boolean): { feedback: string; tip?: Tip } {
    const overrode = (mispredicted ? !taken : taken) !== predicted;
    const direction = taken ? 'TAKEN' : 'NOT TAKEN';
    const feedback = overrode
      ? mispredicted
        ? 'BAD OVERRIDE:\nNEXT INSTRUCTION FLUSHED'
        : 'OVERRIDE! YOU BEAT\nTHE PREDICTOR'
      : mispredicted
        ? 'PREDICTOR MISSED:\nNEXT INSTRUCTION FLUSHED'
        : `PREDICTOR RIGHT: ${direction}\nNO CYCLE LOST`;
    if (overrode && !mispredicted) return { feedback, tip: { id: 'beat', message: 'YOU BEAT THE PREDICTOR!\nIt would have guessed wrong here.\nNo cycle lost.' } };
    if (!overrode && mispredicted) {
      const message =
        this.setup.predictor === '1-bit'
          ? 'PREDICTOR MISSED: it guessed what the\nbranch did last time. Watch x1 reach\nx2 to see a row end, then override.'
          : 'PREDICTOR MISSED: a row ended. That\nonly weakens its counter. Watch x1\nreach x2 to see it coming, then override.';
      return { feedback, tip: { id: 'predictor-miss', message } };
    }
    return { feedback };
  }

  // ---- practice's tips ----

  /**
   * The instruction on the line (practice holds the chart there): the tips
   * for its situation, the first one not yet shown to be shown.
   */
  situation(): Tip[] {
    const pipeline = this.run.pipeline;
    const hazard = pipeline.hazard();
    const slot = pipeline.stages.ID;
    if (!slot) return [];
    const unit = unitOf(slot.instr);
    // Tier 1: each kind of instruction, the first time it reaches the line.
    if (this.setup.singleCycle) return [{ id: slot.instr.op, message: `NEW INSTRUCTION: ${format(slot.instr)}\n${describe(slot.instr)}\n${UNIT_ROLES[unit]} -> press ${LANE_KEYS[unit]} (${unit})` }];
    if (hazard) return [{ id: 'hazard', message: `HAZARD: ${slot.instr.op} needs x${hazard.reg}, but\n${this.whyNotReady(hazard)}\nPress SPACE until the link is gone.` }];
    const route = { id: 'route', message: `NO LINK: nothing below is still\ncomputing what it needs.\nRoute it: press ${LANE_KEYS[unit]} (${unit})` };
    if (this.setup.guessing && pipeline.branchOutcome() !== undefined) {
      const message = this.setup.predictor
        ? "THE PREDICTOR'S GUESS GLOWS.\nPress that key to follow it, the other\nto override (J NOT TAKEN, K TAKEN)."
        : 'BRANCH: will it jump back to loop:?\nJ = guess NOT TAKEN, K = guess TAKEN.\nIts glow shows what it did last time.';
      return [{ id: 'guess', message }, route];
    }
    return [route];
  }

  /** A wrong key in practice: what it should have been, and why. */
  mistake(outcome: Outcome): string {
    const slot = this.run.pipeline.stages.ID;
    const hazard = this.run.pipeline.hazard();
    if (!slot) return '';
    const unit = unitOf(slot.instr);
    if (outcome === 'violation' && hazard) return `WAIT! x${hazard.reg} isn't ready:\n${this.whyNotReady(hazard)}\nPress SPACE to stall.`;
    if (outcome === 'wasted-stall') return `NO NEED TO WAIT: there's no link.\nRoute it: press ${LANE_KEYS[unit]} (${unit})`;
    return `${describe(slot.instr)}\n${UNIT_ROLES[unit]} -> press ${LANE_KEYS[unit]} (${unit})`;
  }

  /**
   * Why a value isn't ready yet, by where its producer actually is. A load only
   * works out its address in EXECUTE and reads memory in MEMORY; its value exists
   * after that, which is why even forwarding can't hand it over any sooner.
   */
  private whyNotReady(hazard: Hazard): string {
    const op = hazard.producer.instr.op;
    const stage = this.run.pipeline.stageOf(hazard.producer.seq);
    if (op === 'lb' && stage === 'EX') return 'lb is in EXECUTE, only working out\nthe address. It reads memory next beat,\ntoo late to forward.';
    if (op === 'lb' && stage === 'MEM') return 'lb is reading memory right now;\nthe value exists at the end of this beat.';
    return `${op} (linked below) hasn't finished it.`;
  }

  /** Each kind of memory trip, the first time it happens. */
  access(access: Access): Tip | undefined {
    const at = formatMhz(this.run.chip.mhz);
    if (!this.setup.l1) {
      if (access.cycles <= 1) return undefined;
      return { id: 'ram', message: `WAITING ON RAM: memory takes ${MEMORY_TIMING.ramNs} ns,\n${access.cycles} cycles at ${at}. Everything freezes\nuntil it answers. No key needed.` };
    }
    if (access.kind === 'store') return { id: 'buffer', message: 'STORE: it goes to RAM through the\nwrite buffer, so the CPU never\nwaits for it.' };
    if (access.hit) {
      const block = blockOf(access.address) * BLOCK_BYTES;
      return { id: 'hit', message: `HIT: byte ${access.address} came in with its\nblock (bytes ${block}-${block + 3}). No trip to RAM,\nno waiting.` };
    }
    if (access.cycles <= 1) return undefined;
    return { id: 'miss', message: `MISS: line ${lineOf(access.address)} doesn't hold byte ${access.address}.\nIts whole block comes from RAM:\n${access.cycles} cycles at ${at}. Just watch.` };
  }

  /** Tier 3: a value forwarded into the instruction that needed it. */
  forwarded(reg: number, producer: Slot): Tip {
    return { id: 'forward', message: `FORWARDED: x${reg} came straight from\n${producer.instr.op} (watch the wire light up).\nNo stall needed!` };
  }

  // ---- what things are, when clicked in a replay ----

  stage(stage: Stage): Entry {
    const entry = GLOSSARY[stage];
    if (stage === 'EX' && this.setup.forwarding) return { title: entry.title, body: `${entry.body} ${GLOSSARY.FORWARDING.body}` };
    return entry;
  }

  /** A stage's tag in the listing; the single-cycle CPU has no stages, just now / next / done. */
  stageTag(stage: Stage): string {
    if (!this.setup.singleCycle) return stage;
    return stage === 'ID' ? 'NOW' : stage === 'IF' ? 'NEXT' : 'DONE';
  }

  note(slot: Slot): Entry {
    const { pipeline } = this.run;
    const stage = pipeline.stageOf(slot.seq);
    const where = this.setup.singleCycle
      ? stage === 'ID'
        ? 'On the line: all five steps happen in this one beat.'
        : stage === 'WB'
          ? 'Done: its result is on the way to the registers.'
          : 'Coming up next.'
      : stage
        ? `Now in ${STAGE_NAMES[stage]} (${stage}).`
        : 'Coming up: it will be fetched soon.';
    const guess = (taken: boolean) => (taken ? 'TAKEN (K)' : 'NOT TAKEN (J)');
    const predicted = this.setup.predictor ? pipeline.guessFor(slot) : undefined;
    if (predicted) {
      const sure = predicted.sure ? '' : ', but it is unsure (weak)';
      return { title: format(slot.instr), body: `${describe(slot.instr)}. ${where} Its glow: the predictor guesses ${guess(predicted.taken)}${sure}.` };
    }
    const access = this.accesses.get(slot.seq);
    if (access) return { title: format(slot.instr), body: `${describe(slot.instr)}. ${where} ${this.tripWords(access)}` };
    const hint = this.setup.guessing ? pipeline.hint(slot.pc) : undefined;
    const glow = !hint
      ? ''
      : hint.seen
        ? ` Its glow: last time it was ${guess(hint.taken)}.`
        : ` No history yet: it jumps backward, so it's probably a loop: ${guess(hint.taken)}.`;
    return { title: format(slot.instr), body: `${describe(slot.instr)}. ${where}${glow}` };
  }

  /** A load or store's trip to memory, for its note's explanation. */
  private tripWords(access: Access): string {
    const at = `${access.cycles} cycles at ${formatMhz(this.run.chip.mhz)}`;
    if (access.level === 'BUFFER') return `It went to RAM through the write buffer: no waiting${access.hit ? ', and its cache line was updated too' : ''}.`;
    if (access.level === 'L1') return `Cache HIT: its block was already in line ${lineOf(access.address)}, so no trip to RAM.`;
    if (!this.setup.l1) return access.cycles > 1 ? `RAM took ${MEMORY_TIMING.ramNs} ns = ${at}: everything froze while it waited.` : 'RAM answered within the cycle.';
    const why: Record<MissKind, string> = {
      'first-use': 'FIRST USE: its block had never been loaded.',
      conflict: `CONFLICT: another block using line ${lineOf(access.address)} had pushed it out. A cache that could put blocks anywhere would still hold it.`,
      'too-small': 'TOO SMALL: more blocks were in use than the 4 lines hold.',
    };
    return `Cache MISS, ${why[access.missKind ?? 'first-use']} Its block came from RAM: ${at}.`;
  }

  /** A cache line: valid or not, and which block it holds. */
  cacheLine(line: number): Entry {
    const { valid, tag } = this.shown.lines[line];
    const block = tag * CACHE_LINES + line;
    const holds = valid ? `Holds bytes ${block * BLOCK_BYTES}-${block * BLOCK_BYTES + 3} (tag ${bin(tag, 4)}).` : 'Empty: nothing loaded into it yet.';
    return {
      title: `CACHE LINE ${line}`,
      body: `${holds} Only addresses whose line bits are ${bin(line, 2)} (xxxx ${bin(line, 2)} xx) can go here, so blocks ${line}, ${line + 4}, ${line + 8}... share it.`,
    };
  }

  predictorState(pc: number): Entry {
    const { pipeline } = this.run;
    const state = pipeline.predictorState(pc) ?? 0;
    const history = (pipeline.history.get(pc) ?? []).slice(-6).map((taken) => (taken ? 'T' : 'N')).join(' ');
    const oneBit = this.setup.predictor === '1-bit';
    const names = oneBit ? ['NOT TAKEN', 'TAKEN'] : ['STRONG NOT TAKEN', 'WEAK NOT TAKEN', 'WEAK TAKEN', 'STRONG TAKEN'];
    const entry = oneBit ? GLOSSARY.PREDICTOR_1BIT : GLOSSARY.PREDICTOR_2BIT;
    return { title: `${entry.title}: ${names[state]}`, body: `${entry.body} So far this branch went: ${history || 'nothing yet'}.` };
  }

  register(r: number): Entry {
    const role = this.setup.spec.roles?.[r];
    const job = r === 0 ? 'x0 is wired to zero: writing to it does nothing.' : role ? `In this program: ${role}.` : 'Not used by this program.';
    const pending = (['EX', 'MEM'] as const).some((stage) => this.run.pipeline.stages[stage]?.step?.wrote === r);
    const note = pending ? ' A new value for it is still in the pipeline.' : '';
    return { title: `REGISTER x${r} = ${this.shown.regs[r]}`, body: `${job}${note} ${GLOSSARY.REGISTERS.body}` };
  }

  memory(): Entry {
    return { title: GLOSSARY.MEMORY.title, body: `${GLOSSARY.MEMORY.body} ${this.setup.spec.memoryNote ?? ''}` };
  }
}
