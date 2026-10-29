import { destReg, sourceRegs } from './isa.js';
// The classic 5-stage in-order pipeline from Patterson & Hennessy:
//   IF  fetch   ID  decode + read registers (branches resolve here)
//   EX  execute MEM memory access   WB  write the register file
// The register file is written in the first half of a cycle and read in the
// second half, so an instruction in ID can read a value written by WB that
// same cycle. The player acts at ID: issue the instruction, or stall.
export const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
const INITIAL_COUNTER = { '1-bit': 0, '2-bit': 1 };
const isBranch = (instr) => instr?.op === 'beq' || instr?.op === 'bne';
/**
 * Bubbles needed between a producer and a consumer that is `distance`
 * instructions behind it (1 = producer now in EX, 2 = in MEM).
 */
export function stallsNeeded(producer, consumer, distance, forwarding) {
    // Without forwarding, a value is only readable once its producer reaches WB.
    if (!forwarding)
        return 3 - distance;
    const load = producer.op === 'lb';
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
    /** Current clock cycle, starting at 1 with the first instruction in IF. */
    cycle = 1;
    /** Instructions that reached WB. */
    instructions = 0;
    /** Bubbles inserted by stalling (needed or not). */
    stalls = 0;
    /** Instructions thrown away by flushes. */
    flushed = 0;
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
    fetchPc = 0;
    nextSeq = 0;
    constructor(cpu, options) {
        this.cpu = cpu;
        this.options = options;
        this.regs = [...cpu.regs];
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
        return this.fetchPc >= this.cpu.program.instructions.length && !IF && !ID && !EX && !MEM;
    }
    /** Average cycles per instruction so far, counting the cycles to fill the pipeline. */
    get cpi() {
        return this.instructions === 0 ? 0 : this.cycles / this.instructions;
    }
    /** Stages holding a real instruction (0-5): how full the pipeline is. */
    get occupancy() {
        return STAGES.filter((stage) => this.stages[stage] !== null).length;
    }
    /** The data hazard blocking the instruction in ID, if any (the worst one). */
    hazard() {
        const consumer = this.stages.ID;
        if (!consumer || this.options.singleCycle)
            return null;
        let worst = null;
        for (const reg of sourceRegs(consumer.instr)) {
            if (reg === 0)
                continue; // x0 is constant
            for (const [stage, distance] of [['EX', 1], ['MEM', 2]]) {
                const producer = this.stages[stage];
                if (!producer || destReg(producer.instr) !== reg)
                    continue;
                const stalls = stallsNeeded(producer.instr, consumer.instr, distance, this.options.forwarding);
                if (stalls > 0 && (!worst || stalls > worst.stalls))
                    worst = { reg, producer, stalls };
                break; // the nearest (newest) producer is the one that matters
            }
        }
        return worst;
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
    /** Whether the branch in ID will be taken (undefined if ID holds no branch). */
    branchOutcome() {
        const instr = this.stages.ID?.instr;
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
    /** Which stage holds the instruction with this seq, if any. */
    stageOf(seq) {
        return STAGES.find((stage) => this.stages[stage]?.seq === seq);
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
            const producer = ['EX', 'MEM']
                .map((stage) => this.stages[stage])
                .find((slot) => slot && destReg(slot.instr) === reg);
            if (producer)
                forwarded.push({ reg, producer });
        }
        return forwarded;
    }
    /** The correct choice this cycle (used by autoplay and tests). */
    bestAction() {
        return this.hazard() ? 'stall' : 'issue';
    }
    /** Advances one clock cycle. `action` is the player's choice for the instruction in ID. */
    step(action) {
        if (this.done)
            throw new Error('pipeline is done');
        if (this.options.singleCycle)
            return this.stepSingleCycle(action);
        const { IF, ID, EX, MEM } = this.stages;
        const flushed = [];
        let event;
        let nextEX = null; // a bubble unless something issues
        let mispredicted;
        let predicted;
        let nextID;
        let nextIF;
        if (!ID) {
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
                if (taken !== undefined) {
                    // A branch is decided here. Fetch followed the guess: the player's, else the predictor's, else not taken.
                    predicted = this.fetchGuesses.get(issued.seq);
                    this.fetchGuesses.delete(issued.seq);
                    const guessedTaken = this.prediction?.seq === issued.seq ? this.prediction.taken : (predicted ?? false);
                    mispredicted = guessedTaken !== taken;
                    this.branches++;
                    if (mispredicted)
                        this.mispredicted++;
                    this.history.set(issued.pc, [...(this.history.get(issued.pc) ?? []), taken]);
                    if (predicted !== undefined) {
                        if (predicted !== taken)
                            this.predictorMisses++;
                        if (guessedTaken !== predicted) {
                            this.overrides++;
                            if (!mispredicted)
                                this.overridesRight++;
                        }
                        this.train(issued.pc, taken);
                    }
                }
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
        if (committed)
            this.commit(committed);
        this.flushed += flushed.length;
        this.stages = { IF: nextIF, ID: nextID, EX: nextEX, MEM: EX, WB: MEM };
        if (this.prediction && this.prediction.seq !== nextID?.seq)
            this.prediction = null;
        this.cycle++;
        return { event, flushed, committed, mispredicted, predicted };
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
        return { event, flushed: [], committed: done ?? undefined };
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
        const action = pipeline.bestAction();
        const taken = pipeline.branchOutcome();
        if (action === 'issue' && guesses === 'perfect' && taken !== undefined)
            pipeline.predict(taken);
        pipeline.step(action);
    }
    return pipeline;
}
/** Cycles a perfectly played run takes; see perfectRun(). */
export function perfectCycles(cpu, options, guesses = 'hardware') {
    return perfectRun(cpu, options, guesses).cycle;
}
//# sourceMappingURL=pipeline.js.map