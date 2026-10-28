import { destReg, sourceRegs } from './isa.js';
// The classic 5-stage in-order pipeline from Patterson & Hennessy:
//   IF  fetch   ID  decode + read registers (branches resolve here)
//   EX  execute MEM memory access   WB  write the register file
// The register file is written in the first half of a cycle and read in the
// second half, so an instruction in ID can read a value written by WB that
// same cycle. The player acts at ID: issue the instruction, or stall.
export const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
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
    fetchPc = 0;
    nextSeq = 0;
    constructor(cpu, options) {
        this.cpu = cpu;
        this.options = options;
        this.regs = [...cpu.regs];
        this.stages.IF = this.fetch();
    }
    get done() {
        const { IF, ID, EX, MEM } = this.stages;
        return this.fetchPc >= this.cpu.program.instructions.length && !IF && !ID && !EX && !MEM;
    }
    /** Average cycles per instruction so far, counting the cycles to fill the pipeline. */
    get cpi() {
        return this.instructions === 0 ? 0 : this.cycle / this.instructions;
    }
    /** Stages holding a real instruction (0-5): how full the pipeline is. */
    get occupancy() {
        return STAGES.filter((stage) => this.stages[stage] !== null).length;
    }
    /** The data hazard blocking the instruction in ID, if any (the worst one). */
    hazard() {
        const consumer = this.stages.ID;
        if (!consumer)
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
    /** The correct choice this cycle (used by autoplay and tests). */
    bestAction() {
        return this.hazard() ? 'stall' : 'issue';
    }
    /** Advances one clock cycle. `action` is the player's choice for the instruction in ID. */
    step(action) {
        if (this.done)
            throw new Error('pipeline is done');
        const { IF, ID, EX, MEM } = this.stages;
        const flushed = [];
        let event;
        let nextEX = null; // a bubble unless something issues
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
                if (issued.step?.taken) {
                    // Fetch assumed not-taken; the instruction fetched behind the branch is wrong.
                    if (IF)
                        flushed.push(IF);
                    this.fetchPc = this.cpu.pc;
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
        this.cycle++;
        return { event, flushed, committed };
    }
    fetch() {
        if (this.fetchPc >= this.cpu.program.instructions.length)
            return null;
        const pc = this.fetchPc++;
        return { seq: this.nextSeq++, pc, instr: this.cpu.program.instructions[pc] };
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
//# sourceMappingURL=pipeline.js.map