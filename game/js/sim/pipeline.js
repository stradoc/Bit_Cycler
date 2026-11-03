import { destReg, isBranch, isLoad, sourceRegs, unitOf } from './isa.js';
import { MemorySystem } from './memory.js';
// The classic 5-stage in-order pipeline from Patterson & Hennessy:
//   IF  fetch   ID  decode + read registers (branches resolve here)
//   EX  execute MEM memory access   WB  write the register file
// The register file is written in the first half of a cycle and read in the
// second half, so an instruction in ID can read a value written by WB that
// same cycle. The player acts at ID: issue the instruction, or stall.
// Loads and stores reach memory in MEM (sim/memory.ts). An access slower than
// a cycle freezes the whole pipeline until it's done: every stage holds, so
// the distances between instructions (and their hazards) don't change.
// Superscalar (tier 7): the instruction in ID and the one behind it in IF can
// start together, a pair, when each goes to a different unit, the second
// doesn't need the first's result, and the first isn't a branch. The second
// then travels beside the first (its partner in EX, MEM and WB), and fetch
// brings in two to refill. Like the i960CA, one instruction per unit a cycle;
// Patterson & Hennessy's static two-issue CPU (section 4.10) is stricter (one
// ALU-or-branch with one load-or-store).
export const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
const INITIAL_COUNTER = { '1-bit': 0, '2-bit': 1 };
/**
 * Bubbles needed between a producer and a consumer that is `distance`
 * instructions behind it (1 = producer now in EX, 2 = in MEM).
 */
export function stallsNeeded(producer, consumer, distance, forwarding) {
    // Without forwarding, a value is only readable once its producer reaches WB.
    if (!forwarding)
        return 3 - distance;
    const load = isLoad(producer);
    // Branches compare in ID, so they need their operands a stage earlier.
    if (consumer.op === 'beq' || consumer.op === 'bne')
        return load ? 3 - distance : 2 - distance;
    // A load's data only exists after MEM: the load-use hazard.
    return load && distance === 1 ? 1 : 0;
}
/** A 5-stage pipeline driven one clock cycle at a time by the player's choice at ID. */
export class Pipeline {
    /** Functional state; instructions execute here when issued, in program order. */
    cpu;
    /** The register file as the hardware sees it: updated when instructions reach WB. */
    regs;
    options;
    stages = { IF: null, ID: null, EX: null, MEM: null, WB: null };
    /** Superscalar: the second instruction of each pair, beside the first in EX, MEM and WB. */
    partners = { EX: null, MEM: null, WB: null };
    /** Pairs started (two instructions in one cycle). */
    pairs = 0;
    /** Current clock cycle, starting at 1 with the first instruction in IF. */
    cycle = 1;
    /** Instructions that reached WB. */
    instructions = 0;
    /** Bubbles inserted by stalling (needed or not). */
    stalls = 0;
    /** Instructions thrown away by flushes. */
    flushed = 0;
    /** Data memory: RAM, and the L1 cache if fitted. */
    memory;
    /** The clock right now (MHz); undefined = memory keeps up with any clock. */
    clockMhz;
    /** Cycles left with the pipeline frozen, waiting for memory. */
    memoryWait = 0;
    /** Cycles spent frozen waiting for memory so far. */
    memoryCycles = 0;
    /** Cycles left refilling the deep pipeline's front after a wrong guess (nothing reaches ID). */
    refillWait = 0;
    /** Cycles spent refilling so far. */
    refillCycles = 0;
    /** The last access to reach memory, and the instruction making it. */
    lastAccess;
    /** Branches decided, and how many of them were guessed wrong. */
    branches = 0;
    mispredicted = 0;
    /** What each branch (by pc) did each time it was decided, oldest first: true = taken. */
    history = new Map();
    /** With a predictor: branches it guessed wrong, whatever the player did. */
    predictorMisses = 0;
    /** With a predictor: branches the player guessed differently from it, and how many of those were right. */
    overrides = 0;
    overridesRight = 0;
    /** The predictor table: a counter per branch pc. */
    counters = new Map();
    /** The predictor's guess that fetch followed, for each fetched branch (by seq). */
    fetchGuesses = new Map();
    /** The guess made for the branch in ID, if any (otherwise it's guessed not taken). */
    prediction = null;
    /** The guess made for a branch starting as the second of a pair (in IF), for this cycle. */
    partnerPrediction = null;
    fetchPc = 0;
    nextSeq = 0;
    constructor(cpu, options) {
        this.cpu = cpu;
        this.options = options;
        this.regs = [...cpu.regs];
        this.memory = new MemorySystem(options.cache, options.lowerCaches);
        this.clockMhz = options.mhz;
        this.stages.IF = this.fetch();
        if (options.singleCycle) {
            // Nothing to fill: the first instruction starts straight away.
            this.stages.ID = this.stages.IF;
            this.stages.IF = this.fetch();
        }
    }
    /** Clock cycles so far: a single-cycle CPU has no cycle where the first instruction is only fetched. */
    get cycles() {
        return this.options.singleCycle ? this.cycle - 1 : this.cycle;
    }
    get done() {
        const { IF, ID, EX, MEM } = this.stages;
        const partners = this.partners.EX || this.partners.MEM;
        return this.fetchPc >= this.cpu.program.instructions.length && !IF && !ID && !EX && !MEM && !partners && this.waitLeft === 0;
    }
    /** Cycles left with nothing able to move on: waiting for memory, then refilling after a wrong guess. */
    get waitLeft() {
        return this.memoryWait + this.refillWait;
    }
    /** Average cycles per instruction so far, counting the cycles to fill the pipeline. */
    get cpi() {
        return this.instructions === 0 ? 0 : this.cycles / this.instructions;
    }
    /** Stages holding a real instruction (0-5): how full the pipeline is (a pair counts once). */
    get occupancy() {
        return STAGES.filter((stage) => this.stages[stage] !== null).length;
    }
    /** The data hazard blocking the instruction in ID, if any (the worst one). */
    hazard() {
        const consumer = this.stages.ID;
        if (!consumer || this.options.singleCycle)
            return null;
        return this.hazardFor(consumer.instr);
    }
    /**
     * The worst hazard an instruction about to start would have with the older
     * ones still computing (in EX or MEM, a pair's second included), as if it
     * were in ID: the one in ID, or the one behind it starting beside it.
     */
    hazardFor(consumer) {
        let worst = null;
        for (const reg of sourceRegs(consumer)) {
            if (reg === 0)
                continue; // x0 is constant
            for (const [producer, distance] of this.producers()) {
                if (destReg(producer.instr) !== reg)
                    continue;
                const stalls = stallsNeeded(producer.instr, consumer, distance, this.options.forwarding);
                if (stalls > 0 && (!worst || stalls > worst.stalls))
                    worst = { reg, producer, stalls };
                break; // the nearest (newest) producer is the one that matters
            }
        }
        return worst;
    }
    /** The older instructions still computing, newest first (in each stage a pair's second is the newer), with their distance: 1 in EX, 2 in MEM. */
    producers() {
        return ['EX', 'MEM'].flatMap((stage, i) => [this.partners[stage], this.stages[stage]].filter((slot) => slot !== null).map((slot) => [slot, i === 0 ? 1 : 2]));
    }
    /**
     * Whether the instruction in ID and the one behind it (in IF) can start
     * together this cycle, and if not, why: the first must be free to go and
     * not a branch, they must need different units, the second mustn't need
     * the first's result, and the second must be free to go too.
     */
    pairCheck() {
        const first = this.stages.ID;
        const second = this.stages.IF;
        const no = (reason) => ({ ok: false, reason });
        if (!this.options.superscalar || this.options.singleCycle || !first || !second)
            return no('no-second');
        if (this.hazard())
            return no('hazard');
        if (isBranch(first.instr))
            return no('branch-first');
        if (unitOf(first.instr) === unitOf(second.instr))
            return no('same-unit');
        const wrote = destReg(first.instr);
        if (wrote !== undefined && wrote !== 0 && sourceRegs(second.instr).includes(wrote))
            return no('depends');
        if (this.hazardFor(second.instr))
            return no('hazard');
        return { ok: true };
    }
    /**
     * The hint shown on a branch: what it did last time it was decided (what a
     * 1-bit predictor remembers). Before any history, a branch jumping backward
     * is probably a loop, so it suggests taken. Undefined if `pc` isn't a branch.
     */
    hint(pc) {
        const instr = this.cpu.program.instructions[pc];
        if (!instr || !('target' in instr))
            return undefined;
        const last = this.history.get(pc)?.at(-1);
        return last === undefined ? { taken: instr.target <= pc, seen: false } : { taken: last, seen: true };
    }
    /** The predictor's table entry for the branch at `pc` (1-bit: 0-1, 2-bit: 0-3); undefined without a predictor. */
    predictorState(pc) {
        const kind = this.options.predictor;
        if (!kind || !isBranch(this.cpu.program.instructions[pc]))
            return undefined;
        return this.counters.get(pc) ?? INITIAL_COUNTER[kind];
    }
    /** What the predictor guesses right now for the branch at `pc`. */
    predictorGuess(pc) {
        const state = this.predictorState(pc);
        if (state === undefined)
            return undefined;
        return this.options.predictor === '1-bit' ? { taken: state === 1, sure: true } : { taken: state >= 2, sure: state === 0 || state === 3 };
    }
    /** The predictor's guess for a slot: the one fetch followed if it's been fetched, else what it would guess now. */
    guessFor(slot) {
        const guess = this.predictorGuess(slot.pc);
        const fetched = this.fetchGuesses.get(slot.seq);
        return guess && fetched !== undefined ? { ...guess, taken: fetched } : guess;
    }
    /** Whether the branch in ID (or `stage` IF: a pair's second) will be taken (undefined if it holds no branch). */
    branchOutcome(stage = 'ID') {
        const instr = this.stages[stage]?.instr;
        if (!isBranch(instr))
            return undefined;
        // Older instructions have all executed already, so the CPU's registers hold the values it compares.
        const equal = this.cpu.regs[instr.rs1] === this.cpu.regs[instr.rs2];
        return instr.op === 'beq' ? equal : !equal;
    }
    /**
     * The player's guess for the branch in ID. The next instruction is fetched in
     * this same cycle, so a "taken" guess fetches from the branch target instead
     * of the next line. Without a guess, fetch follows the predictor (or assumes
     * not taken without one); guessing the other way overrides it.
     */
    predict(taken) {
        const branch = this.stages.ID;
        if (!branch || !isBranch(branch.instr) || this.prediction?.seq === branch.seq)
            return;
        this.prediction = { seq: branch.seq, taken };
        if (taken === (this.fetchGuesses.get(branch.seq) ?? false))
            return;
        // Redirect fetch: the slot behind the branch now holds the other path's instruction.
        this.fetchPc = taken ? branch.instr.target : branch.pc + 1;
        this.stages.IF = this.fetch(this.stages.IF?.seq);
    }
    /**
     * The player's guess for a branch starting as the second of a pair (in IF),
     * this cycle: fetch goes on from its target if it's guessed taken.
     */
    predictPartner(taken) {
        const branch = this.stages.IF;
        if (!branch || !isBranch(branch.instr))
            return;
        this.partnerPrediction = { seq: branch.seq, taken };
        this.fetchPc = taken ? branch.instr.target : branch.pc + 1;
    }
    /**
     * The next `count` instructions fetch will bring in, following the
     * predictor's current guesses (not taken without one). Their seq numbers are
     * the ones they'll get when fetched.
     */
    upcoming(count) {
        const program = this.cpu.program.instructions;
        const slots = [];
        for (let pc = this.fetchPc, i = 0; i < count && pc < program.length; i++, pc = this.nextFetch(pc)) {
            slots.push({ seq: this.nextSeq + i, pc, instr: program[pc] });
        }
        return slots;
    }
    /** The instructions in `stage`: its own, and (EX, MEM, WB) the second of a pair beside it, older first. */
    inStage(stage) {
        const partner = stage === 'EX' || stage === 'MEM' || stage === 'WB' ? this.partners[stage] : null;
        return [this.stages[stage], partner].filter((slot) => slot !== null);
    }
    /** Which stage holds the instruction with this seq, if any (a pair's second is in the stage beside its first). */
    stageOf(seq) {
        return STAGES.find((stage) => this.stages[stage]?.seq === seq) ?? ['EX', 'MEM', 'WB'].find((stage) => this.partners[stage]?.seq === seq);
    }
    /**
     * With forwarding on: the registers the instruction in ID will receive
     * straight from an older instruction still in EX or MEM, instead of from the
     * register file. Empty when there's a hazard (it has to stall first).
     */
    forwardedFrom() {
        const consumer = this.stages.ID;
        if (!consumer || !this.options.forwarding || this.hazard())
            return [];
        const forwarded = [];
        for (const reg of new Set(sourceRegs(consumer.instr))) {
            if (reg === 0)
                continue;
            const producer = this.producers().find(([slot]) => destReg(slot.instr) === reg)?.[0];
            if (producer)
                forwarded.push({ reg, producer });
        }
        return forwarded;
    }
    /** The correct choice this cycle (used by autoplay and tests): stall for a hazard, else start a pair if one can, else issue. */
    bestAction() {
        if (this.hazard())
            return 'stall';
        return this.pairCheck().ok ? 'pair' : 'issue';
    }
    /**
     * Superscalar: the instructions (by seq) that will start as the second of
     * a pair over the next `cycles` if they're played perfectly from here, so
     * the song can draw a chord from the moment its notes appear, not only once
     * both reach the front. Played on a copy that keeps up with any clock:
     * memory waits change when pairs start, never which ones do.
     */
    plannedPartners(cycles) {
        const partners = new Set();
        if (!this.options.superscalar || this.options.singleCycle)
            return partners;
        const copy = this.copy();
        for (let i = 0; i < cycles && !copy.done; i++) {
            if (copy.waitLeft > 0) {
                copy.wait();
                continue;
            }
            const { event } = copy.step(copy.bestAction());
            if (event.kind === 'paired')
                partners.add(event.partner.seq);
        }
        return partners;
    }
    /** A copy to play ahead on: the same state, with memory that keeps up with any clock (no new waits). */
    copy() {
        const copy = new Pipeline(this.cpu.clone(), { ...this.options, mhz: undefined });
        copy.regs.splice(0, copy.regs.length, ...this.regs);
        copy.stages = { ...this.stages };
        copy.partners = { ...this.partners };
        copy.cycle = this.cycle;
        copy.memoryWait = this.memoryWait;
        copy.refillWait = this.refillWait;
        for (const [pc, outcomes] of this.history)
            copy.history.set(pc, [...outcomes]);
        for (const [pc, counter] of this.counters)
            copy.counters.set(pc, counter);
        copy.fetchGuesses.clear();
        for (const [seq, guess] of this.fetchGuesses)
            copy.fetchGuesses.set(seq, guess);
        copy.prediction = this.prediction;
        copy.partnerPrediction = this.partnerPrediction;
        copy.fetchPc = this.fetchPc;
        copy.nextSeq = this.nextSeq;
        return copy;
    }
    /**
     * Spends up to `cycles` of the current wait (memory first, then a refill),
     * nothing able to move on. Returns how many it spent. A refill holds the
     * whole pipeline too: what's ahead of the refetched instruction is only the
     * bubble and the branch, which writes no register, so holding it changes no
     * later hazard and costs the same cycles as bubbles drifting through.
     */
    wait(cycles = this.waitLeft) {
        const memory = Math.max(0, Math.min(cycles, this.memoryWait));
        const refill = Math.max(0, Math.min(cycles - memory, this.refillWait));
        this.cycle += memory + refill;
        this.memoryCycles += memory;
        this.memoryWait -= memory;
        this.refillCycles += refill;
        this.refillWait -= refill;
        return memory + refill;
    }
    /**
     * Advances one clock cycle. `action` is the player's choice for the
     * instruction in ID: issue it, stall, or (superscalar) start it and the one
     * behind it together as a pair.
     */
    step(action) {
        if (this.done)
            throw new Error('pipeline is done');
        if (this.waitLeft > 0)
            throw new Error('pipeline is frozen, waiting for memory or refilling');
        if (this.options.singleCycle)
            return this.stepSingleCycle(action === 'stall' ? 'stall' : 'issue');
        const { IF, ID, EX, MEM } = this.stages;
        const flushed = [];
        let event;
        let nextEX = null; // a bubble unless something issues
        let nextPartner = null;
        let mispredicted;
        let predicted;
        let nextID;
        let nextIF;
        const check = action === 'pair' ? this.pairCheck() : undefined;
        if (ID && check && !check.ok && !this.hazard()) {
            // Started together when they couldn't be: both are thrown away and fetched again.
            event = { kind: 'pair-violation', slot: ID, partner: IF, reason: check.reason };
            flushed.push(ID);
            if (IF)
                flushed.push(IF);
            this.fetchPc = ID.pc;
            nextID = null;
            nextIF = this.fetch();
        }
        else if (ID && IF && check?.ok) {
            // A pair: both start, in program order, and fetch brings in two behind them.
            const first = this.issue(ID);
            const second = this.issue(IF);
            event = { kind: 'paired', slot: first, partner: second };
            nextEX = first;
            nextPartner = second;
            this.pairs++;
            const decided = this.decideBranch(second, this.partnerPrediction);
            mispredicted = decided?.mispredicted;
            predicted = decided?.predicted;
            if (mispredicted) {
                // What was fetched behind the branch is on the wrong path.
                const wrong = this.fetch();
                if (wrong)
                    flushed.push(wrong);
                this.fetchPc = second.step?.taken ? this.cpu.pc : second.pc + 1;
                nextID = null;
                nextIF = this.fetch();
            }
            else {
                nextID = this.fetch();
                nextIF = this.fetch();
            }
        }
        else if (!ID) {
            event = { kind: 'idle' };
            nextID = IF;
            nextIF = this.fetch();
        }
        else if (action === 'stall') {
            // ID and IF hold; a bubble enters EX.
            this.stalls++;
            event = { kind: 'stalled', needed: this.hazard() !== null };
            nextID = ID;
            nextIF = IF;
        }
        else {
            const hazard = this.hazard();
            if (hazard) {
                // Issued too early: it would read a stale value. Flush it (and the
                // instruction behind it) and fetch it again.
                event = {
                    kind: 'hazard-violation',
                    slot: ID,
                    hazard,
                    staleValue: this.regs[hazard.reg],
                    correctValue: hazard.producer.value ?? 0,
                };
                flushed.push(ID);
                if (IF)
                    flushed.push(IF);
                this.fetchPc = ID.pc;
                nextID = null;
                nextIF = this.fetch();
            }
            else {
                const issued = this.issue(ID);
                event = { kind: 'issued', slot: issued };
                nextEX = issued;
                const taken = issued.step?.taken;
                const decided = this.decideBranch(issued, this.prediction);
                mispredicted = decided?.mispredicted;
                predicted = decided?.predicted;
                if (mispredicted) {
                    // The instruction fetched behind the branch is on the wrong path.
                    if (IF)
                        flushed.push(IF);
                    this.fetchPc = taken ? this.cpu.pc : issued.pc + 1;
                    nextID = null;
                    nextIF = this.fetch();
                }
                else {
                    nextID = IF;
                    nextIF = this.fetch();
                }
            }
        }
        const committed = MEM ?? undefined;
        const committedPartner = this.partners.MEM ?? undefined;
        if (committed)
            this.commit(committed);
        if (committedPartner)
            this.commit(committedPartner);
        const enteringMem = [EX, this.partners.EX];
        this.flushed += flushed.length;
        this.stages = { IF: nextIF, ID: nextID, EX: nextEX, MEM: EX, WB: MEM };
        this.partners = { EX: nextPartner, MEM: this.partners.EX, WB: this.partners.MEM };
        if (this.prediction && this.prediction.seq !== nextID?.seq)
            this.prediction = null;
        this.partnerPrediction = null;
        this.cycle++;
        // The instruction now entering MEM reaches memory next cycle (a pair holds at most one load or store); if that takes longer, everything waits.
        const access = this.reachMemory(enteringMem.find((slot) => slot?.step?.loaded !== undefined || slot?.step?.stored !== undefined) ?? null);
        // A deep pipeline's wrong guess: its front refills (during a memory wait, the refill overlaps it).
        if (mispredicted)
            this.refillWait = Math.max(0, (this.options.wrongGuessCycles ?? 1) - 1 - this.memoryWait);
        return { event, flushed, committed, committedPartner, mispredicted, predicted, access };
    }
    /**
     * A branch decided as it starts (in ID, or as a pair's second): fetch
     * followed the guess, the player's (`guess`, if it's for this branch), else
     * the predictor's, else not taken. Counts it, keeps its history and trains
     * the predictor. Undefined if `slot` isn't a branch.
     */
    decideBranch(slot, guess) {
        const taken = slot.step?.taken;
        if (taken === undefined)
            return undefined;
        const predicted = this.fetchGuesses.get(slot.seq);
        this.fetchGuesses.delete(slot.seq);
        const guessedTaken = guess?.seq === slot.seq ? guess.taken : (predicted ?? false);
        const mispredicted = guessedTaken !== taken;
        this.branches++;
        if (mispredicted)
            this.mispredicted++;
        this.history.set(slot.pc, [...(this.history.get(slot.pc) ?? []), taken]);
        if (predicted !== undefined) {
            if (predicted !== taken)
                this.predictorMisses++;
            if (guessedTaken !== predicted) {
                this.overrides++;
                if (!mispredicted)
                    this.overridesRight++;
            }
            this.train(slot.pc, taken);
        }
        return { mispredicted, predicted };
    }
    /**
     * One long cycle of the single-cycle CPU: the instruction in ID runs all the
     * way and its result is written straight away (it shows in WB for a cycle).
     * The next instruction is fetched from wherever the program counter points,
     * so a taken branch never fetches the wrong instruction.
     */
    stepSingleCycle(action) {
        const { IF, ID } = this.stages;
        let event = { kind: 'idle' };
        let done = null;
        let nextID = ID;
        let nextIF = IF;
        if (ID && action === 'stall') {
            this.stalls++;
            event = { kind: 'stalled', needed: false };
        }
        else if (ID) {
            done = this.issue(ID);
            this.commit(done);
            event = { kind: 'issued', slot: done };
            const taken = done.step?.taken;
            if (taken !== undefined) {
                this.branches++;
                this.history.set(done.pc, [...(this.history.get(done.pc) ?? []), taken]);
            }
            if (taken) {
                this.fetchPc = this.cpu.pc;
                nextID = this.fetch();
            }
            else {
                nextID = IF;
            }
            nextIF = this.fetch();
        }
        this.stages = { IF: nextIF, ID: nextID, EX: null, MEM: null, WB: done };
        this.cycle++;
        // A load or store stretches the long cycle until memory answers.
        const access = this.reachMemory(done);
        return { event, flushed: [], committed: done ?? undefined, access };
    }
    /** A load or store reaches memory: an access longer than one cycle freezes the pipeline. */
    reachMemory(slot) {
        const address = slot?.step?.loaded ?? slot?.step?.stored;
        if (!slot || address === undefined)
            return undefined;
        const access = this.memory.access(slot.step?.loaded !== undefined ? 'load' : 'store', address, this.clockMhz, slot.step?.size ?? 1);
        this.memoryWait = access.cycles - 1;
        this.lastAccess = { slot, access };
        return this.lastAccess;
    }
    /** Fetches the instruction at fetchPc (as `seq` when refetching a slot) and moves fetch on, following the predictor. */
    fetch(seq) {
        if (this.fetchPc >= this.cpu.program.instructions.length)
            return null;
        const pc = this.fetchPc;
        const slot = { seq: seq ?? this.nextSeq++, pc, instr: this.cpu.program.instructions[pc] };
        const guess = this.predictorGuess(pc);
        if (guess)
            this.fetchGuesses.set(slot.seq, guess.taken);
        this.fetchPc = this.nextFetch(pc);
        return slot;
    }
    /** Where fetch goes after `pc`: a branch's target if the predictor guesses taken, else the next line. */
    nextFetch(pc) {
        const instr = this.cpu.program.instructions[pc];
        return isBranch(instr) && this.predictorGuess(pc)?.taken ? instr.target : pc + 1;
    }
    /** Updates the predictor's entry for a decided branch. */
    train(pc, taken) {
        const state = this.predictorState(pc) ?? 0;
        const max = this.options.predictor === '1-bit' ? 1 : 3;
        this.counters.set(pc, Math.max(0, Math.min(max, state + (taken ? 1 : -1))));
    }
    issue(slot) {
        if (this.cpu.pc !== slot.pc)
            throw new Error(`issued pc ${slot.pc} but the program is at ${this.cpu.pc}`);
        const step = this.cpu.step();
        const value = step.wrote === undefined ? undefined : this.cpu.regs[step.wrote];
        return { ...slot, step, value };
    }
    commit(slot) {
        const rd = slot.step?.wrote;
        if (rd !== undefined && slot.value !== undefined)
            this.regs[rd] = slot.value;
        this.instructions++;
    }
}
/**
 * A perfectly played run (stalling exactly when needed), for comparisons.
 * Branches follow the hardware ('hardware': the predictor, or not taken
 * without one), or are always guessed right ('perfect').
 */
export function perfectRun(cpu, options, guesses = 'hardware') {
    const pipeline = new Pipeline(cpu.clone(), options);
    while (!pipeline.done) {
        if (pipeline.waitLeft > 0) {
            pipeline.wait();
            continue;
        }
        const action = pipeline.bestAction();
        if (guesses === 'perfect' && action !== 'stall') {
            // The branch starting this cycle: the one in ID, or a pair's second.
            const taken = pipeline.branchOutcome();
            if (taken !== undefined)
                pipeline.predict(taken);
            const second = action === 'pair' ? pipeline.branchOutcome('IF') : undefined;
            if (second !== undefined)
                pipeline.predictPartner(second);
        }
        pipeline.step(action);
    }
    return pipeline;
}
/** Cycles a perfectly played run takes; see perfectRun(). */
export function perfectCycles(cpu, options, guesses = 'hardware') {
    return perfectRun(cpu, options, guesses).cycles;
}
//# sourceMappingURL=pipeline.js.map