import { DEEP_PIPELINE } from '../data/economy.ts';
import { GLOSSARY, type Entry } from '../data/glossary.ts';
import type { SongTarget, TourStep } from '../data/tours.ts';
import { formatDuration, formatHours, formatMhz, formatMoney } from '../format.ts';
import type { Decision, Outcome, PipelineRun } from '../rhythm/pipelineRun.ts';
import { addressOf, itemAt } from '../sim/cpu.ts';
import { describe, format, UNIT_ROLES, unitOf, type Instruction, type RType, type Unit } from '../sim/isa.ts';
import { addressSplit, blockOf, cacheBytes, cachesBelow, cacheWords, L1_BASE, MEMORY_TIMING, missNs, sameShape, setOf, setsOf, tagOf, type Access, type MissKind } from '../sim/memory.ts';
import type { Hazard, PairBlock, Slot, Stage } from '../sim/pipeline.ts';
import type { Chip } from '../sim/thermal.ts';
import { THERMAL } from '../sim/thermal.ts';
import { addressBits, bin, hex, LANE_KEYS, MISS_WORDS, STAGE_NAMES, type FreezeView } from './layout.ts';
import { SKILLS, type Skill } from '../rhythm/skills.ts';
import type { CycleUse, RunReport } from './results.ts';
import type { SongSetup } from './setup.ts';
import type { Shown } from './view.ts';

// Everything the song screen says: the feedback under the stats, practice's
// tips (the guide says them), and what each thing is when clicked in a replay. Words only: the
// screen decides when to show them.

/**
 * A practice tip, said by the guide, who points at the part of the screen
 * it's about (the hit line unless given). Each is said once per save
 * (`Progress.seenTips`), so each id is one idea; a tip that says something
 * new for another CPU needs its own id.
 */
export type Tip = { readonly id: string; readonly message: string; readonly point?: SongTarget };

/** What each kind of instruction is for, in everyday words: tier 1's tips are for players who have never seen one. */
const PLAIN: Readonly<Record<Instruction['op'], string>> = {
  add: 'It adds two registers together.',
  sub: 'It takes one register away from another.',
  and: 'It keeps the bits that are on in both registers.',
  or: 'It keeps the bits that are on in either register.',
  xor: 'It keeps the bits where the two registers differ.',
  addi: 'It adds a number, written right in it, to a register.',
  lb: 'It copies a number from memory into a register.',
  lh: 'It copies a number 2 bytes long from memory into a register.',
  lw: 'It copies a number 4 bytes long from memory into a register.',
  ld: 'It copies a number 8 bytes long from memory into a register.',
  sb: 'It copies a register into memory.',
  sh: 'It copies a register into 2 bytes of memory.',
  sw: 'It copies a register into 4 bytes of memory.',
  sd: 'It copies a register into 8 bytes of memory.',
  beq: 'It jumps to another instruction if two registers match.',
  bne: 'It jumps back (to repeat) if two registers differ.',
};

/**
 * What an instruction reads as it reaches the line, for lesson 1's close
 * look: its two registers (rs1, rs2), for a load the byte at its address,
 * and whether it keeps a running total (sim/isa.ts keepsTotal).
 */
export type Reads = { readonly a: number; readonly b: number; readonly byte: number; readonly total?: boolean };

/** Each math or logic instruction: its symbol, and what it does in words. */
const SYMBOL: Readonly<Record<RType['op'], string>> = { add: '+', sub: '-', and: 'AND', or: 'OR', xor: 'XOR' };
const MEANING: Readonly<Record<RType['op'], string>> = {
  add: 'add two registers and store the answer in one',
  sub: 'take one register from another and store the answer',
  and: 'keep only the bits that are on in both',
  or: 'keep the bits that are on in either',
  xor: 'keep the bits where the two differ',
};
const BITWISE: ReadonlySet<Instruction['op']> = new Set(['and', 'or', 'xor']);

/** Why an instruction goes down each lane, to start a sentence. */
const LANE_WORK: Readonly<Record<Unit, string>> = { ALU: 'This is math or logic', MEM: 'This is memory work', BRANCH: 'This decides what runs next' };

/** Why two instructions can't start together, as feedback says it. */
const PAIR_WHY: Readonly<Record<PairBlock, string>> = {
  'no-second': 'NOTHING BEHIND IT',
  'branch-first': 'A BRANCH MUST GO SECOND',
  'same-unit': 'BOTH NEED THE SAME UNIT',
  depends: "THE SECOND NEEDS THE FIRST'S RESULT",
  hazard: 'ONE IS STILL WAITING FOR A VALUE',
};

/** The player's calls of each kind, as TICK says them ("4 of 5 hazard calls"). */
const CALL_WORDS: Readonly<Record<Skill, string>> = { routing: 'routes', hazards: 'hazard calls', branches: 'branch guesses', pairing: 'pairing calls' };

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

  /** The count-in's line naming the song's music. */
  music(): string {
    return `MUSIC: ${this.setup.song.name}`;
  }

  tierTitle(): string {
    const { singleCycle, predictor, guessing, forwarding, superscalar } = this.setup;
    if (singleCycle) return 'TIER 1: SINGLE-CYCLE';
    if (superscalar) return 'TIER 7: SUPERSCALAR';
    if (predictor) return `TIER ${predictor === '1-bit' ? 5 : 6}: ${predictor.toUpperCase()} PREDICTOR`;
    if (guessing) return 'TIER 4: BRANCH PREDICTION';
    return forwarding ? 'TIER 3: FORWARDING' : 'TIER 2: PIPELINE';
  }

  // ---- feedback ----

  /** After a key press: how it went (an issued note's timing and streak, a stall, or the mistake). */
  decision(d: Decision, streak: number): string | undefined {
    switch (d.outcome) {
      case 'issued': {
        // Superscalar: one key on two that could have gone together is right, but slower.
        const behind = this.run.pipeline.stages.IF;
        const chance = d.pairable && behind ? `\nCOULD PAIR WITH ${behind.instr.op}` : '';
        return `${d.waited ? 'GO' : d.judgment}${streak >= 4 ? `\nSTREAK ${streak}` : ''}${chance}`;
      }
      case 'paired':
        return `${d.waited ? 'GO' : d.judgment}: PAIRED\nTWO AT ONCE${streak >= 4 ? `\nSTREAK ${streak}` : ''}`;
      case 'wrong-pair':
        return `CAN'T PAIR: ${PAIR_WHY[d.pairBlock ?? 'no-second']}\nBOTH FLUSHED`;
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
    const from = this.setup.lowerCaches > 0 ? ` -> ${access.level}` : '';
    const why = this.setup.l1 ? `MISS: ${MISS_WORDS[access.missKind ?? 'first-use']}${from}` : access.kind === 'store' ? 'STORE: WRITING TO RAM' : 'LOAD: WAITING ON RAM';
    return `${why}\n${counted} / ${view.total} CYCLES FROZEN\n${access.ns} ns = ${access.cycles} AT ${formatMhz(this.run.chip.mhz)}`;
  }

  /** The deep pipeline refilling after a wrong guess, `counted` of its cycles gone by. */
  refilling(total: number, counted: number): string {
    return `WRONG GUESS: THE DEEP PIPELINE\nREFILLS ${counted} / ${total} CYCLES\nNO NEW NOTE UNTIL IT'S FULL`;
  }

  /** What the stats line calls the cycles spent waiting: on RAM, or with caches below the L1, on memory (any level). */
  waitedWord(): string {
    return this.setup.lowerCaches > 0 ? 'WAITING ON MEMORY' : 'WAITING ON RAM';
  }

  /** The tag over a note waiting on memory. */
  waitingTag(access: Access): string {
    return this.setup.l1 ? `MISS -> ${access.level}` : access.kind === 'store' ? 'WRITING TO RAM' : 'WAITING ON RAM';
  }

  /** The tag over a note thrown out of the pipeline. */
  flushedTag(): string {
    return 'FLUSHED';
  }

  /** The callout over the note fetch was sent to after a branch went the way it didn't expect (`taken`: to the branch's target). */
  redirectTag(taken: boolean): string {
    return `REDIRECTED BY BRANCH UNIT\n${taken ? 'TAKEN: JUMPS TO ITS LABEL' : 'NOT TAKEN: ON TO THE NEXT LINE'}`;
  }

  /** The value on the bus during a wait: the address asked for, then what came back (`back`); with caches below the L1, from which. */
  trip(access: Access, back: boolean, value: number): string {
    if (access.kind === 'store') return back ? 'DONE' : `[${access.address}]`;
    const from = this.setup.lowerCaches > 0 ? `${access.level}: ` : '';
    return back ? `${from}=${value}` : `${from}[${access.address}]?`;
  }

  arrived(): string {
    return this.setup.l1 ? 'BLOCK ARRIVED:\nGO!' : 'DATA ARRIVED:\nGO!';
  }

  /** What the last access did, in one line: "lb 5: 0000 01 01 LINE 1 TAG 0 -> HIT". */
  lookup(slot: Slot, access: Access): string {
    const what = `${slot.instr.op} ${access.address}`;
    const cache = this.setup.l1;
    if (!cache) {
      const ns = MEMORY_TIMING.ramNs;
      return access.cycles > 1
        ? `${what} -> RAM: ${ns} ns = ${access.cycles} CYCLES AT ${formatMhz(this.run.chip.mhz)}`
        : `${what} -> RAM: ${ns} ns FITS IN ONE ${formatDuration(1e-6 / this.run.chip.mhz)} CYCLE`;
    }
    const where = `${what}: ${addressBits(cache, access.address)} ${this.placeWord()} ${setOf(cache, access.address)} TAG ${tagOf(cache, access.address)}`;
    if (access.kind === 'store') return `${where} -> ${access.hit ? 'HIT, ' : ''}WRITE BUFFER`;
    if (access.hit) return `${where} -> HIT`;
    // With caches below the L1, where the block came from (the kind of miss is in the feedback line): the line has no room for both.
    return `${where} -> MISS ${this.setup.lowerCaches > 0 ? `-> ${access.level}` : `(${MISS_WORDS[access.missKind ?? 'first-use']})`}`;
  }

  /** The lookup line before the first load or store: where they look. */
  lookupStart(): string {
    if (!this.setup.l1) return 'LOADS AND STORES GO TO RAM';
    if (this.setup.lowerCaches === 0) return 'LOADS LOOK IN THE CACHE FIRST';
    return `LOADS LOOK IN ${['L1', ...this.lowerNames()].join(', THEN ')}, THEN RAM`;
  }

  /** The caches below the L1 this CPU has, in the order a miss checks them. */
  private lowerNames(): string[] {
    return cachesBelow(this.setup.lowerCaches).map((level) => level.name);
  }

  /** What an instruction did, in a few characters (shown on its note in WB). */
  result(slot: Slot): string {
    const step = slot.step;
    if (step?.wrote !== undefined) return `x${step.wrote} = ${slot.value}`;
    if (step?.stored !== undefined) return `mem[${step.stored}] = ${itemAt(this.run.pipeline.cpu.memory, step.stored, this.setup.dataBits)}`;
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
        tip: { id: 'branch', message: 'BRANCH TAKEN: the CPU had already fetched\nthe wrong next instruction, so it was\nthrown out (FLUSHED). 1 cycle, not your fault.' },
      };
    }
    const lost = this.setup.deep ? DEEP_PIPELINE.wrongGuessCycles : 1;
    const feedback = mispredicted ? `WRONG GUESS: ${lost} CYCLE${lost === 1 ? '' : 'S'} LOST\nNEXT INSTRUCTION FLUSHED` : `GOOD GUESS: ${taken ? 'TAKEN' : 'NOT TAKEN'}\nNO CYCLE LOST`;
    if (mispredicted && this.setup.deep) {
      return { feedback, tip: { id: 'deep-refill', point: 'rows', message: `WRONG GUESS: the work started behind\nthe branch is thrown out (FLUSHED), and\nthe deep pipeline's ${DEEP_PIPELINE.wrongGuessCycles - 1} extra front stages\nrefill: ${lost} cycles lost, not 1.` } };
    }
    if (mispredicted) return { feedback, tip: { id: 'wrong-guess', message: 'WRONG GUESS: the CPU fetched the wrong\nnext instruction, so it was thrown out\n(FLUSHED). It cost 1 cycle.' } };
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
      return { feedback, tip: { id: `predictor-miss-${this.setup.predictor}`, message } };
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
    if (this.setup.singleCycle) return [{ id: slot.instr.op, message: `NEW INSTRUCTION: ${format(slot.instr)}\n${PLAIN[slot.instr.op]}\n${describe(slot.instr)}\n${UNIT_ROLES[unit]} -> press ${LANE_KEYS[unit]} (${unit})` }];
    if (hazard) return [{ id: 'hazard', point: 'rows', message: `HAZARD: ${slot.instr.op} needs x${hazard.reg}, but\n${this.whyNotReady(hazard)}\nPress SPACE until the link is gone.` }];
    const route = { id: 'route', message: `NO LINK: nothing below is still\ncomputing what it needs.\nRoute it: press ${LANE_KEYS[unit]} (${unit})` };
    // Superscalar: the first time two can go together, and the first time each reason stops them.
    const behind = pipeline.stages.IF;
    if (this.setup.superscalar && behind) {
      const check = pipeline.pairCheck();
      const other = unitOf(behind.instr);
      if (check.ok) {
        return [{ id: 'pair', message: `PAIR: ${slot.instr.op} (${unit}) and ${behind.instr.op} (${other})\nneed different units, and nothing links them.\nPress ${LANE_KEYS[unit]} and ${LANE_KEYS[other]} together.` }, route];
      }
      if (check.reason === 'same-unit') return [{ id: 'pair-same', message: `ONE AT A TIME: ${slot.instr.op} and ${behind.instr.op}\nboth need the ${unit}, and there's only one.\nPress just ${LANE_KEYS[unit]}.` }, route];
      if (check.reason === 'depends') return [{ id: 'pair-depends', message: `ONE AT A TIME: ${behind.instr.op} needs what\n${slot.instr.op} is still working out.\nPress just ${LANE_KEYS[unit]}.` }, route];
    }
    if (this.setup.guessing && pipeline.branchOutcome() !== undefined) {
      const message = this.setup.predictor
        ? "THE PREDICTOR'S GUESS GLOWS.\nPress that key to follow it, the other\nto override (J NOT TAKEN, K TAKEN)."
        : 'BRANCH: will it jump back to loop:?\nJ = guess NOT TAKEN, K = guess TAKEN.\nIts glow shows what it did last time.';
      return [{ id: this.setup.predictor ? 'predictor-guess' : 'guess', message }, route];
    }
    return [route];
  }

  /**
   * Tier 1's practice, as an instruction of a new kind reaches the line:
   * TICK goes through it with the numbers really in its registers (and, for
   * a load, in memory), then hands over to the player.
   */
  closeLook(instr: Instruction, reads: Reads): TourStep<SongTarget>[] {
    const reg = (r: number) => `x${r}` as const;
    const holds = (r: number, value: number) => (r === 0 ? `${reg(r)} always holds 0.` : `Right now ${reg(r)} holds ${value}.`);
    const intro = (meaning: string): TourStep<SongTarget> => ({ say: `Let's look closely at this one: ${format(instr)}. ${meaning}`, point: 'listing' });
    const lane = (unit: Unit, watch: string): TourStep<SongTarget> => ({
      say: `${LANE_WORK[unit]}, so it goes down the ${unit} lane. Press ${LANE_KEYS[unit]} when it reaches the line, and watch ${watch}.`,
      point: 'lanes',
    });
    switch (instr.op) {
      case 'add':
      case 'sub':
      case 'and':
      case 'or':
      case 'xor': {
        const bits = BITWISE.has(instr.op);
        const shown = (value: number) => (bits ? `${value}, or ${bin(value & 0xff, 8)} in BITS (ones and zeros)` : `${value}`);
        return [
          intro(`It means ${reg(instr.rd)} = ${reg(instr.rs1)} ${SYMBOL[instr.op]} ${reg(instr.rs2)}: ${MEANING[instr.op]}.`),
          { say: instr.rs1 === 0 ? `First, the CPU reads x0, which always holds 0.` : `First, the CPU reads ${reg(instr.rs1)}. It holds ${shown(reads.a)}.`, point: reg(instr.rs1) },
          { say: `Then it reads ${reg(instr.rs2)}${instr.rs2 === instr.rs1 ? ' again' : ''}, which holds ${shown(reads.b)}.`, point: reg(instr.rs2) },
          lane('ALU', reg(instr.rd)),
        ];
      }
      case 'addi':
        return [
          intro(`It means ${reg(instr.rd)} = ${reg(instr.rs1)} + ${instr.imm}. The ${instr.imm} is written in the instruction itself: an IMMEDIATE.`),
          {
            say: instr.rs1 === 0 ? `x0 always holds 0, so this just puts ${instr.imm} into ${reg(instr.rd)}: the easy way to set a register.` : `The CPU reads ${reg(instr.rs1)}. ${holds(instr.rs1, reads.a)}`,
            point: reg(instr.rs1),
          },
          lane('ALU', reg(instr.rd)),
        ];
      // Lesson 1 runs byte programs; a wider load or store would be talked through the same way.
      case 'lb':
      case 'lh':
      case 'lw':
      case 'ld': {
        const address = addressOf(reads.a, instr.imm);
        return [
          intro(`It LOADS: it copies a byte from memory into ${reg(instr.rd)}. The ADDRESS to read is ${reg(instr.rs1)} + ${instr.imm}.`),
          { say: `${holds(instr.rs1, reads.a)} So the address is ${reads.a} + ${instr.imm} = ${address}.`, point: reg(instr.rs1) },
          { say: `Memory address ${address} holds ${reads.byte} (memory shows it as ${hex(reads.byte)}).`, point: 'memory' },
          lane('MEM', reg(instr.rd)),
        ];
      }
      case 'sb':
      case 'sh':
      case 'sw':
      case 'sd': {
        const address = addressOf(reads.a, instr.imm);
        return [
          intro(`It STORES: it copies ${reg(instr.rs2)} into memory. The ADDRESS to write is ${reg(instr.rs1)} + ${instr.imm}.`),
          { say: `${reg(instr.rs2)} holds ${reads.b & 0xff}: that's what gets stored.`, point: reg(instr.rs2) },
          { say: `${holds(instr.rs1, reads.a)} So the address is ${reads.a} + ${instr.imm} = ${address}.`, point: reg(instr.rs1) },
          lane('MEM', 'memory'),
        ];
      }
      case 'beq':
      case 'bne': {
        const same = reads.a === reads.b;
        const taken = instr.op === 'beq' ? same : !same;
        return [
          intro(`It BRANCHES: if ${reg(instr.rs1)} and ${reg(instr.rs2)} are ${instr.op === 'beq' ? 'the same' : 'different'}, jump to ${instr.label}. If not, carry on.`),
          { say: `${reg(instr.rs1)} holds ${reads.a}.`, point: reg(instr.rs1) },
          { say: `${reg(instr.rs2)} holds ${reads.b}. They're ${same ? 'the same' : 'different'}, so it will ${taken ? 'jump (TAKEN)' : 'carry on (NOT TAKEN)'}.`, point: reg(instr.rs2) },
          lane('BRANCH', "the program's arrow"),
        ];
      }
    }
  }

  /** ...and once it has run and its answer has landed: what happened, pointing at it. */
  closeLookDone(instr: Instruction, reads: Reads, done: Slot): TourStep<SongTarget>[] {
    const reg = (r: number) => `x${r}` as const;
    // What doesn't fit in a byte wraps round, as the register does.
    const sum = (exact: number, result: number, sums: string) =>
      exact === result ? `${sums} = ${result}` : `${sums} is ${exact}, but a register only holds 0-255, so it wraps round to ${result}`;
    switch (instr.op) {
      case 'add':
      case 'sub':
      case 'and':
      case 'or':
      case 'xor': {
        const exact = instr.op === 'add' ? reads.a + reads.b : instr.op === 'sub' ? reads.a - reads.b : instr.op === 'and' ? reads.a & reads.b : instr.op === 'or' ? reads.a | reads.b : reads.a ^ reads.b;
        const result = exact & 0xff;
        if (instr.rd === 0) return [{ say: `The answer was ${result}, but x0 always stays 0, so it was thrown away.`, point: 'x0' }];
        const worked = BITWISE.has(instr.op)
          ? `In bits, ${bin(reads.a & 0xff, 8)} ${SYMBOL[instr.op]} ${bin(reads.b & 0xff, 8)} = ${bin(result, 8)}: that's ${result}`
          : sum(exact, result, `${reads.a} ${SYMBOL[instr.op]} ${reads.b}`);
        const steps: TourStep<SongTarget>[] = [{ say: `See! ${worked}, and the ALU stored it in ${reg(instr.rd)}.`, point: reg(instr.rd) }];
        if (reads.total) {
          steps.push({ say: `The answer replaced the ${reads.a} that ${reg(instr.rd)} held. Each time the loop comes round, it adds the next number: a running total.`, point: reg(instr.rd) });
        }
        return steps;
      }
      case 'addi': {
        const exact = reads.a + instr.imm;
        if (instr.rd === 0) return [{ say: `x0 always stays 0, so the answer was thrown away.`, point: 'x0' }];
        const steps: TourStep<SongTarget>[] = [{ say: `See! ${sum(exact, exact & 0xff, `${reads.a} + ${instr.imm}`)}, stored in ${reg(instr.rd)}.`, point: reg(instr.rd) }];
        if (instr.rd === instr.rs1 && instr.imm === 1) steps.push({ say: `Adding 1 to ${reg(instr.rd)} each time round is how the loop keeps count of where it is.`, point: reg(instr.rd) });
        return steps;
      }
      case 'lb':
      case 'lh':
      case 'lw':
      case 'ld':
        return [{ say: `See! The ${reads.byte} from address ${addressOf(reads.a, instr.imm)} was copied into ${reg(instr.rd)}. Memory still has its own copy.`, point: reg(instr.rd) }];
      case 'sb':
      case 'sh':
      case 'sw':
      case 'sd':
        return [{ say: `See! ${reads.b & 0xff} was copied into memory at address ${addressOf(reads.a, instr.imm)}. ${reg(instr.rs2)} still holds it too.`, point: 'memory' }];
      case 'beq':
      case 'bne': {
        if (!done.step?.taken) return [{ say: `See! It didn't jump: the arrow carried straight on to the next instruction.`, point: 'listing' }];
        const back = instr.target <= done.pc;
        return [{ say: back ? `See! The arrow jumped back to ${instr.label}: the loop runs again, on the next number.` : `See! The arrow jumped ahead to ${instr.label}.`, point: 'listing' }];
      }
    }
  }

  /** A wrong key in practice: what it should have been, and why. */
  /**
   * TICK going through a run's results, asked for on the results card ([T]):
   * the verdict, why the song's pace is the whole job's, the CPI and where
   * the lost cycles went, time per instruction and what this CPU improves on,
   * then branch guesses, the cache and the clock when they apply.
   */
  resultsTour(report: RunReport): TourStep<SongTarget>[] {
    const lower = (words: string) => words.toLowerCase();
    const time = (seconds: number) => lower(formatDuration(seconds));
    const steps: TourStep<SongTarget>[] = [];
    const { job } = report;
    if (job) {
      const [took, due, pay] = [lower(formatHours(job.seconds)), lower(formatHours(job.deadline)), formatMoney(job.pay)];
      steps.push({
        say: report.verdict === 'late' ? `Late. At your pace the whole job took ${took}, but it was due in ${due}, so it paid half: ${pay}.` : `On time! At your pace the whole job took ${took}. It was due in ${due}, so it paid in full: ${pay}.`,
        point: 'verdict',
        mood: report.verdict === 'late' ? 'worried' : 'happy',
      });
      steps.push({ say: 'The song was a small piece of the job. The rest runs the same way, so how you played sets the whole job\'s time.', point: 'verdict' });
    }
    steps.push({ say: `Your CPU took ${report.cycles} cycles to finish ${report.instructions} instructions: a CPI (cycles per instruction) of ${report.cpi.toFixed(2)}. Lower is faster.`, point: 'cycles' });
    if (report.pairs > 0) steps.push({ say: `${report.pairs} cycles started two instructions at once. That's how a superscalar CPU gets its CPI under 1.`, point: 'cycles' });
    const lost: Readonly<Record<Exclude<CycleUse, 'finished'>, (cycles: number) => string>> = {
      stalled: (c) => (report.singleCycle ? `${c} cycles finished nothing: a missed beat or a wrong key wastes the whole cycle.` : `${c} cycles were stalls: waiting for a value that wasn't ready yet, or a missed beat.`),
      flushed: (c) => `${c} cycles were flushed: instructions fetched down the wrong path after a branch, then thrown away.`,
      ram: (c) =>
        report.lowerCaches > 0 && report.cache
          ? `${c} cycles waited on memory: ${report.cache.found.filter(({ level }) => level !== 'L1').map(({ level, loads }) => `${loads} from ${level === 'RAM' ? 'RAM' : `the ${level}`}`).join(', ')}. The further down, the longer the wait.`
          : `${c} cycles waited on RAM (${report.ramTrips} trip${report.ramTrips === 1 ? '' : 's'}). Memory is far slower than the CPU: that's the memory wall.`,
      refill: (c) => `${c} cycles refilled the deep pipeline after wrong guesses: more stages means more to refill.`,
      fill: (c) => `${c} cycles were the pipeline filling at the start and emptying at the end, when not every stage has work.`,
    };
    for (const { use, cycles } of report.uses) if (use !== 'finished') steps.push({ say: lost[use](cycles), point: 'cycles' });
    steps.push({ say: `Time per instruction is CPI x clock period: ${report.cpi.toFixed(2)} x ${time(report.period)} = ${time(report.cpi * report.period)}.` });
    if (report.cooling > 0) steps.push({ say: `The clock also stopped to cool, which added ${time(report.cooling)} to every instruction.` });
    const compare: Readonly<Record<RunReport['compare'][number]['cpu'], (t: string) => string>> = {
      'one-at-a-time': (t) => `Starting just one instruction a cycle, even a perfect run would take ${t} an instruction.`,
      'no-forwarding': (t) => `Without forwarding, even a perfect run would take ${t} an instruction.`,
      'never-guessing': (t) => `Without guessing, waiting at every branch instead, a perfect run would take ${t} an instruction.`,
      'predictor-alone': (t) => `The predictor alone, with no help from you, would take ${t} an instruction.`,
      'no-cache': (t) => `With no cache, every load going to RAM, a perfect run would take ${t} an instruction.`,
      'first-l1': (t) => `With the first L1 (${this.firstCacheWords()}), a perfect run would take ${t} an instruction.`,
      'no-l2': (t) => `With the L1 alone, every miss going to RAM, a perfect run would take ${t} an instruction.`,
      'no-l3': (t) => `Without the L3, every L2 miss going to RAM, a perfect run would take ${t} an instruction.`,
      'single-cycle': (t) => `A single-cycle CPU needs a clock a quarter as fast as yours, so it takes ${t} an instruction.`,
    };
    for (const { cpu, time: t } of report.compare) steps.push({ say: compare[cpu](time(t)) });
    // The player's own calls, which the learning objective is about.
    const called = SKILLS.filter((skill) => report.calls[skill].total > 0).map((skill) => `${report.calls[skill].right} of ${report.calls[skill].total} ${CALL_WORDS[skill]}`);
    if (called.length > 0) steps.push({ say: `Your calls: ${called.join(', ')}. REPORT on the main menu charts them, job by job.`, point: 'cycles' });
    const { branches, cache, clock } = report;
    // Your branch guesses are in the calls above; with a predictor, how it would have done without you.
    if (branches?.predictorRight !== undefined) steps.push({ say: `The predictor alone would have got ${branches.predictorRight} of ${branches.total} branches right.` });
    if (cache) {
      steps.push({ say: `The L1 cache already had ${cache.hits} of ${cache.loads} loads (${Math.round((cache.hits / cache.loads) * 100)}%), so those didn't wait${report.lowerCaches > 0 ? '' : ' on RAM'}.` });
      steps.push({ say: `On average a load took ${time(cache.amatNs / 1e9)}: the AMAT (average memory access time). A hit takes ${MEMORY_TIMING.l1Ns} ns; each miss adds its trip down.` });
    }
    if (clock) {
      const hot = clock.overheats > 0 ? ` It overheated, so its top clock is now ${Math.round(clock.maxDial * 100)}%.` : '';
      steps.push({ say: `Your clock averaged ${formatMhz(clock.averageMhz)}, and the chip peaked at ${clock.peak}°C.${hot}` });
    }
    return steps;
  }

  mistake(outcome: Outcome): string {
    const slot = this.run.pipeline.stages.ID;
    const hazard = this.run.pipeline.hazard();
    if (!slot) return '';
    const unit = unitOf(slot.instr);
    if (outcome === 'violation' && hazard) return `WAIT! x${hazard.reg} isn't ready:\n${this.whyNotReady(hazard)}\nPress SPACE to stall.`;
    if (outcome === 'wasted-stall') return `NO NEED TO WAIT: there's no link.\nRoute it: press ${LANE_KEYS[unit]} (${unit})`;
    if (outcome === 'wrong-pair') {
      const check = this.run.pipeline.pairCheck();
      return `THESE TWO CAN'T GO TOGETHER:\n${PAIR_WHY[check.ok ? 'no-second' : check.reason].toLowerCase()}.\nPress just ${LANE_KEYS[unit]} (${unit}).`;
    }
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

  /**
   * The tips a memory trip can bring up, each the first time its kind
   * happens: the one to say is the first not said yet (PipelineScene.tip), so
   * what a miss is comes before where it was found.
   */
  access(access: Access): readonly Tip[] {
    const at = formatMhz(this.run.chip.mhz);
    if (!this.setup.l1) {
      if (access.cycles <= 1) return [];
      return [{ id: 'ram', point: 'memory', message: `WAITING ON RAM: memory takes ${MEMORY_TIMING.ramNs} ns,\n${access.cycles} cycles at ${at}. Everything freezes\nuntil it answers. No key needed.` }];
    }
    const cache = this.setup.l1;
    if (access.kind === 'store') return [{ id: 'buffer', point: 'cache', message: 'STORE: it goes to RAM through the\nwrite buffer, so the CPU never\nwaits for it.' }];
    if (access.hit) {
      const block = blockOf(cache, access.address) * cache.blockBytes;
      return [{ id: 'hit', point: 'cache', message: `HIT: byte ${access.address} came in with its\nblock (bytes ${block}-${block + cache.blockBytes - 1}). No trip to RAM,\nno waiting.` }];
    }
    if (access.cycles <= 1) return [];
    const below = this.belowTip(access, at);
    // The first miss is always a first use; the other kinds get a tip of their own when they first come up.
    if (access.missKind === 'conflict') {
      return [{ id: 'miss-conflict', point: 'cache', message: `CONFLICT: byte ${access.address} was in the cache,\nbut another block needed ${this.placeWord().toLowerCase()} ${setOf(cache, access.address)}\nand pushed it out.` }, ...below];
    }
    if (access.missKind === 'too-small') {
      return [{ id: 'miss-too-small', point: 'cache', message: `TOO SMALL: byte ${access.address} was in the cache,\nbut more blocks came in than its\n${cache.lines} lines hold, and pushed it out.` }, ...below];
    }
    const from = this.setup.lowerCaches > 0 ? 'from below' : 'from RAM';
    return [{ id: 'miss', point: 'cache', message: `MISS: the cache doesn't hold byte ${access.address}.\nIts whole block comes ${from}:\n${access.cycles} cycles at ${at}. Just watch.` }, ...below];
  }

  /** With caches below the L1: the first time each one answers a miss, and the first time a miss goes past them all to RAM. */
  private belowTip(access: Access, at: string): Tip[] {
    const cache = this.setup.l1;
    const lower = this.lowerNames();
    if (!cache || lower.length === 0) return [];
    if (access.level === 'RAM') {
      const missed = ['the L1', ...lower.map((name) => `the ${name}`)].join(', ').replace(/, ([^,]*)$/, ' or $1');
      return [
        {
          id: `miss-past-${lower[lower.length - 1].toLowerCase()}`,
          point: 'lookup',
          message: `ALL THE WAY TO RAM: byte ${access.address} wasn't\nin ${missed}.\nEach lookup adds its time: ${access.ns} ns,\n${access.cycles} cycles at ${at}.`,
        },
      ];
    }
    if (access.level !== 'L2' && access.level !== 'L3') return [];
    const above = access.level === 'L2' ? 'the L1' : 'the L1 and L2';
    return [
      {
        id: `${access.level.toLowerCase()}-hit`,
        point: 'lookup',
        message: `${access.level} HIT: ${above} missed byte ${access.address},\nbut the ${access.level} had it: ${access.ns} ns,\n${access.cycles} cycles at ${at}. RAM: ${missNs(cache, lower.length)} ns.`,
      },
    ];
  }

  /** Tier 3: a value forwarded into the instruction that needed it. */
  forwarded(reg: number, producer: Slot): Tip {
    return { id: 'forward', point: 'rows', message: `FORWARDED: x${reg} came straight from\n${producer.instr.op} (watch the wire light up).\nNo stall needed!` };
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
    const cache = this.setup.l1;
    if (!cache) return access.cycles > 1 ? `RAM took ${MEMORY_TIMING.ramNs} ns = ${at}: everything froze while it waited.` : 'RAM answered within the cycle.';
    const place = `${this.placeWord().toLowerCase()} ${setOf(cache, access.address)}`;
    if (access.level === 'L1') return `Cache HIT: its block was already in ${place}, so no trip to RAM.`;
    const why: Record<MissKind, string> = {
      'first-use': 'FIRST USE: its block had never been loaded.',
      conflict: `CONFLICT: ${cache.ways === 1 ? 'another block' : 'other blocks'} using ${place} had pushed it out. A cache that could put blocks anywhere would still hold it.`,
      'too-small': `TOO SMALL: more blocks were in use than the ${cache.lines} lines hold.`,
    };
    const from = access.level === 'RAM' ? 'RAM' : `the ${access.level}`;
    const below = this.setup.lowerCaches > 0 ? ` (${access.ns} ns: each lookup on the way adds its time)` : '';
    return `Cache MISS, ${why[access.missKind ?? 'first-use']} Its block came from ${from}${below}: ${at}.`;
  }

  /** A cache line: valid or not, and which block it holds. */
  cacheLine(line: number): Entry {
    const cache = this.setup.l1 || L1_BASE;
    const { valid, tag } = this.shown.lines[line];
    const sets = setsOf(cache);
    const set = Math.floor(line / cache.ways);
    const block = tag * sets + set;
    const bits = addressSplit(cache);
    const [from, to] = [block * cache.blockBytes, (block + 1) * cache.blockBytes - 1];
    const holds = valid ? `Holds bytes ${from}-${to} (tag ${bin(tag, bits.tag)}).` : 'Empty: nothing loaded into it yet.';
    const pattern = `${'x'.repeat(bits.tag)} ${bin(set, bits.set)} ${'x'.repeat(bits.offset)}`;
    const where =
      cache.ways === 1
        ? `Only addresses whose line bits are ${bin(set, bits.set)} (${pattern}) can go here, so blocks ${set}, ${set + sets}, ${set + 2 * sets}... share it.`
        : `It's one of the ${cache.ways} lines of set ${set}: addresses whose set bits are ${bin(set, bits.set)} (${pattern}) can go in either, so blocks ${set}, ${set + sets}, ${set + 2 * sets}... share them. A new block takes the one used longest ago.`;
    return { title: cache.ways === 1 ? `CACHE LINE ${line}` : `CACHE SET ${set}, LINE ${line % cache.ways}`, body: `${holds} ${where}` };
  }

  /** What a cache's places are called: lines when each block has one, sets when it has a few to choose from. */
  private placeWord(): 'LINE' | 'SET' {
    return this.setup.l1 && this.setup.l1.ways > 1 ? 'SET' : 'LINE';
  }

  /** The L1 box's title: what each row shows. */
  cacheTitle(): string {
    const cache = this.setup.l1 || L1_BASE;
    const place = this.placeWord();
    if (cache.lines > 4) return cache.ways > 1 ? 'L1: SET  TAGS' : 'L1: LINE TAG';
    return `L1: ${place} TAG ${cache.blockBytes > 4 ? 'BYTES' : 'DATA'}`;
  }

  /** What the L1 is, when its box is clicked: how it's built. */
  cache(): Entry {
    const cache = this.setup.l1 || L1_BASE;
    if (sameShape(cache, L1_BASE)) return GLOSSARY.CACHE;
    const placing =
      cache.ways === 1
        ? 'Each block has one line it can go in.'
        : `Its lines are paired into ${setsOf(cache)} SETS: a block can go in either line of its set, so two blocks that share a set both fit.`;
    const shown = cache.lines > 4 ? ' The box shows each line\'s tag; click one for the bytes it holds.' : '';
    return {
      title: GLOSSARY.CACHE.title,
      body: `A small, fast memory beside the CPU: ${cacheBytes(cache)} bytes, ${cache.lines} lines of ${cache.blockBytes} bytes. ${placing} A HIT needs no trip to RAM; a MISS brings the whole block in.${shown}`,
    };
  }

  /** How an address finds its place in this cache, when the lookup line is clicked. */
  lookupInfo(): Entry {
    const cache = this.setup.l1 || L1_BASE;
    const bits = addressSplit(cache);
    const pattern = `${'t'.repeat(bits.tag)} ${'i'.repeat(bits.set)} ${'o'.repeat(bits.offset)}`;
    const place = this.placeWord().toLowerCase();
    return {
      title: GLOSSARY.LOOKUP.title,
      body: `An address splits into ${pattern}: the i bits pick the ${place}, the t bits (the tag) say which block is in it, the o bits pick the byte. Valid + same tag = HIT.${this.belowWords()} Stores go out through a write buffer.`,
    };
  }

  /** What happens after an L1 miss with caches below it: who's asked next, and how long each takes. */
  private belowWords(): string {
    const lower = cachesBelow(this.setup.lowerCaches);
    if (lower.length === 0) return '';
    const asked = lower.map((level) => `the ${level.name} (${level.ns} ns more)`).join(', then ');
    return ` On a MISS, ${asked}, then RAM (${MEMORY_TIMING.ramNs} ns): the first that has the block answers.`;
  }

  /** The first L1's shape in words, for the results' comparison. */
  firstCacheWords(): string {
    return cacheWords(L1_BASE).toLowerCase();
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
    const pending = (['EX', 'MEM'] as const).some((stage) => this.run.pipeline.inStage(stage).some((slot) => slot.step?.wrote === r));
    const note = pending ? ' A new value for it is still in the pipeline.' : '';
    return { title: `REGISTER x${r} = ${this.shown.regs[r]}`, body: `${job}${note} ${GLOSSARY.REGISTERS.body}` };
  }

  memory(): Entry {
    const bits = this.setup.dataBits;
    // Wider data: what the box shows instead of bytes.
    const wide = bits === 8 ? '' : ` This job's data is ${bits}-bit numbers (${bits / 8} bytes each), so each row shows them in ordinary numbers, and the box scrolls to the one in use.`;
    return { title: GLOSSARY.MEMORY.title, body: `${GLOSSARY.MEMORY.body}${wide} ${this.setup.spec.memoryNote ?? ''}` };
  }
}
