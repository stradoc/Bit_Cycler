import type { Cpu, Step } from './cpu.ts';
import { destReg, sourceRegs, type Instruction } from './isa.ts';

// The classic 5-stage in-order pipeline from Patterson & Hennessy:
//   IF  fetch   ID  decode + read registers (branches resolve here)
//   EX  execute MEM memory access   WB  write the register file
// The register file is written in the first half of a cycle and read in the
// second half, so an instruction in ID can read a value written by WB that
// same cycle. The player acts at ID: issue the instruction, or stall.

export const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'] as const;
export type Stage = (typeof STAGES)[number];

/** One fetched instruction moving through the pipeline. */
export type Slot = {
  /** Unique per fetch; a re-fetched instruction gets a new seq. */
  readonly seq: number;
  readonly pc: number;
  readonly instr: Instruction;
  /** Set when issued (functionally executed, in program order). */
  readonly step?: Step;
  /** Value written to the destination register, once issued. */
  readonly value?: number;
};

export type PipelineOptions = {
  /** Forwarding unit: results are passed straight to later instructions. */
  readonly forwarding: boolean;
};

export type Hazard = {
  /** The register the instruction in ID needs. */
  readonly reg: number;
  /** The older instruction still computing it. */
  readonly producer: Slot;
  /** Bubbles needed before the instruction in ID can safely issue. */
  readonly stalls: number;
};

export type CycleEvent =
  | { readonly kind: 'idle' } // nothing in ID (pipeline filling, or after a flush)
  | { readonly kind: 'issued'; readonly slot: Slot }
  | { readonly kind: 'stalled'; readonly needed: boolean } // needed = false: a wasted bubble
  | {
      readonly kind: 'hazard-violation';
      readonly slot: Slot;
      readonly hazard: Hazard;
      /** What the instruction would have read from the register file... */
      readonly staleValue: number;
      /** ...instead of the value still being computed. */
      readonly correctValue: number;
    };

export type CycleResult = {
  readonly event: CycleEvent;
  /** Instructions thrown away this cycle (wrong path or hazard violation). */
  readonly flushed: readonly Slot[];
  /** Instruction that reached WB this cycle. */
  readonly committed?: Slot;
};

/**
 * Bubbles needed between a producer and a consumer that is `distance`
 * instructions behind it (1 = producer now in EX, 2 = in MEM).
 */
export function stallsNeeded(
  producer: Instruction,
  consumer: Instruction,
  distance: 1 | 2,
  forwarding: boolean,
): number {
  // Without forwarding, a value is only readable once its producer reaches WB.
  if (!forwarding) return 3 - distance;
  const load = producer.op === 'lb';
  // Branches compare in ID, so they need their operands a stage earlier.
  if (consumer.op === 'beq' || consumer.op === 'bne') return load ? 3 - distance : 2 - distance;
  // A load's data only exists after MEM: the load-use hazard.
  return load && distance === 1 ? 1 : 0;
}

/** A 5-stage pipeline driven one clock cycle at a time by the player's choice at ID. */
export class Pipeline {
  /** Functional state; instructions execute here when issued, in program order. */
  readonly cpu: Cpu;
  /** The register file as the hardware sees it: updated when instructions reach WB. */
  readonly regs: number[];
  readonly options: PipelineOptions;
  stages: Record<Stage, Slot | null> = { IF: null, ID: null, EX: null, MEM: null, WB: null };
  /** Current clock cycle, starting at 1 with the first instruction in IF. */
  cycle = 1;
  /** Instructions that reached WB. */
  instructions = 0;
  /** Bubbles inserted by stalling (needed or not). */
  stalls = 0;
  /** Instructions thrown away by flushes. */
  flushed = 0;
  private fetchPc = 0;
  private nextSeq = 0;

  constructor(cpu: Cpu, options: PipelineOptions) {
    this.cpu = cpu;
    this.options = options;
    this.regs = [...cpu.regs];
    this.stages.IF = this.fetch();
  }

  get done(): boolean {
    const { IF, ID, EX, MEM } = this.stages;
    return this.fetchPc >= this.cpu.program.instructions.length && !IF && !ID && !EX && !MEM;
  }

  /** Average cycles per instruction so far, counting the cycles to fill the pipeline. */
  get cpi(): number {
    return this.instructions === 0 ? 0 : this.cycle / this.instructions;
  }

  /** Stages holding a real instruction (0-5): how full the pipeline is. */
  get occupancy(): number {
    return STAGES.filter((stage) => this.stages[stage] !== null).length;
  }

  /** The data hazard blocking the instruction in ID, if any (the worst one). */
  hazard(): Hazard | null {
    const consumer = this.stages.ID;
    if (!consumer) return null;
    let worst: Hazard | null = null;
    for (const reg of sourceRegs(consumer.instr)) {
      if (reg === 0) continue; // x0 is constant
      for (const [stage, distance] of [['EX', 1], ['MEM', 2]] as const) {
        const producer = this.stages[stage];
        if (!producer || destReg(producer.instr) !== reg) continue;
        const stalls = stallsNeeded(producer.instr, consumer.instr, distance, this.options.forwarding);
        if (stalls > 0 && (!worst || stalls > worst.stalls)) worst = { reg, producer, stalls };
        break; // the nearest (newest) producer is the one that matters
      }
    }
    return worst;
  }

  /**
   * The next `count` instructions fetch will bring in, assuming no branch is
   * taken. Their seq numbers are the ones they'll get when fetched.
   */
  upcoming(count: number): Slot[] {
    const program = this.cpu.program.instructions;
    const slots: Slot[] = [];
    for (let i = 0; i < count && this.fetchPc + i < program.length; i++) {
      slots.push({ seq: this.nextSeq + i, pc: this.fetchPc + i, instr: program[this.fetchPc + i] });
    }
    return slots;
  }

  /** Which stage holds the instruction with this seq, if any. */
  stageOf(seq: number): Stage | undefined {
    return STAGES.find((stage) => this.stages[stage]?.seq === seq);
  }

  /**
   * With forwarding on: the registers the instruction in ID will receive
   * straight from an older instruction still in EX or MEM, instead of from the
   * register file. Empty when there's a hazard (it has to stall first).
   */
  forwardedFrom(): { reg: number; producer: Slot }[] {
    const consumer = this.stages.ID;
    if (!consumer || !this.options.forwarding || this.hazard()) return [];
    const forwarded: { reg: number; producer: Slot }[] = [];
    for (const reg of new Set(sourceRegs(consumer.instr))) {
      if (reg === 0) continue;
      const producer = (['EX', 'MEM'] as const)
        .map((stage) => this.stages[stage])
        .find((slot) => slot && destReg(slot.instr) === reg);
      if (producer) forwarded.push({ reg, producer });
    }
    return forwarded;
  }

  /** The correct choice this cycle (used by autoplay and tests). */
  bestAction(): 'issue' | 'stall' {
    return this.hazard() ? 'stall' : 'issue';
  }

  /** Advances one clock cycle. `action` is the player's choice for the instruction in ID. */
  step(action: 'issue' | 'stall'): CycleResult {
    if (this.done) throw new Error('pipeline is done');
    const { IF, ID, EX, MEM } = this.stages;
    const flushed: Slot[] = [];
    let event: CycleEvent;
    let nextEX: Slot | null = null; // a bubble unless something issues
    let nextID: Slot | null;
    let nextIF: Slot | null;

    if (!ID) {
      event = { kind: 'idle' };
      nextID = IF;
      nextIF = this.fetch();
    } else if (action === 'stall') {
      // ID and IF hold; a bubble enters EX.
      this.stalls++;
      event = { kind: 'stalled', needed: this.hazard() !== null };
      nextID = ID;
      nextIF = IF;
    } else {
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
        if (IF) flushed.push(IF);
        this.fetchPc = ID.pc;
        nextID = null;
        nextIF = this.fetch();
      } else {
        const issued = this.issue(ID);
        event = { kind: 'issued', slot: issued };
        nextEX = issued;
        if (issued.step?.taken) {
          // Fetch assumed not-taken; the instruction fetched behind the branch is wrong.
          if (IF) flushed.push(IF);
          this.fetchPc = this.cpu.pc;
          nextID = null;
          nextIF = this.fetch();
        } else {
          nextID = IF;
          nextIF = this.fetch();
        }
      }
    }

    const committed = MEM ?? undefined;
    if (committed) this.commit(committed);
    this.flushed += flushed.length;
    this.stages = { IF: nextIF, ID: nextID, EX: nextEX, MEM: EX, WB: MEM };
    this.cycle++;
    return { event, flushed, committed };
  }

  private fetch(): Slot | null {
    if (this.fetchPc >= this.cpu.program.instructions.length) return null;
    const pc = this.fetchPc++;
    return { seq: this.nextSeq++, pc, instr: this.cpu.program.instructions[pc] };
  }

  private issue(slot: Slot): Slot {
    if (this.cpu.pc !== slot.pc) throw new Error(`issued pc ${slot.pc} but the program is at ${this.cpu.pc}`);
    const step = this.cpu.step();
    const value = step.wrote === undefined ? undefined : this.cpu.regs[step.wrote];
    return { ...slot, step, value };
  }

  private commit(slot: Slot): void {
    const rd = slot.step?.wrote;
    if (rd !== undefined && slot.value !== undefined) this.regs[rd] = slot.value;
    this.instructions++;
  }
}

/** Cycles a perfectly played run takes (stalling exactly when needed); for comparisons. */
export function perfectCycles(cpu: Cpu, options: PipelineOptions): number {
  const pipeline = new Pipeline(cpu.clone(), options);
  while (!pipeline.done) pipeline.step(pipeline.bestAction());
  return pipeline.cycle;
}
