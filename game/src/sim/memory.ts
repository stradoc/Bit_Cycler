// The memory wall and the L1 data cache. RAM takes a fixed time in
// nanoseconds, however fast the clock is, so a faster clock means more cycles
// spent waiting for it: about 60 ns is 1 cycle at 16 MHz but 240 at 4 GHz.
// While a load waits, the whole pipeline freezes (the textbook's in-order
// pipeline), so the waiting cycles raise CPI.
//
// The L1 cache is the textbook's first cache: 16 bytes, direct-mapped, 4 lines
// of 4 bytes. An 8-bit address splits into tag (4 bits), line (2) and offset
// (2): tttt ii oo. A hit is served inside the MEMORY stage; a miss checks L1,
// then fetches the whole 4-byte block from RAM. Stores are write-through with a
// write buffer: they go to RAM through the buffer and never freeze (here the
// buffer never fills), and a store that misses doesn't bring its block in
// (no write allocate). Without a cache, stores wait for RAM like loads.
// Instruction fetch is always fast: like the textbook's separate instruction
// memory, or an instruction cache that always hits on small loops.

export const MEMORY_TIMING = {
  /** One DRAM access (ns). Approximate: the textbook gives 50-70 ns for DRAM. */
  ramNs: 60,
  /** Checking L1 on the way to RAM (ns, approximate). A hit itself fits in the MEMORY stage. */
  l1Ns: 1,
} as const;

export const CACHE_LINES = 4;
export const BLOCK_BYTES = 4;
/**
 * Memory a byte job uses and the panel shows at once (4 rows of 8): two
 * cache-fulls, so blocks can compete for a line. A job's data fits in this many
 * items, so wider data uses more bytes (up to 256), shown through a window.
 */
export const SHOWN_BYTES = 32;

/** Cycles an access taking `ns` occupies at `mhz`: the whole access, at least the 1 the MEMORY stage has anyway. */
export function cyclesFor(ns: number, mhz: number): number {
  // The tiny margin keeps 60 ns at 4 GHz at 240 cycles despite rounding (4400.000000000001 MHz and so on).
  return Math.max(1, Math.ceil((ns * mhz) / 1000 - 1e-9));
}

/** Cycles a trip to RAM takes at `mhz`, with or without the L1 check on the way. */
export function ramCycles(mhz: number, cache = false): number {
  return cyclesFor(MEMORY_TIMING.ramNs + (cache ? MEMORY_TIMING.l1Ns : 0), mhz);
}

/**
 * How long memory waits feel in the song: the beats on the log scale below
 * are stretched by this much (rounded up). Team: a trip to RAM should hurt.
 */
export const FREEZE_STRETCH = 1.5;

/**
 * Beats a memory wait is drawn over: a few hundred cycles can't take a few
 * hundred beats, so on a log scale (1 for under 10 extra cycles, 2 for under
 * 100, else 3) times FREEZE_STRETCH: 2, 3 or 5 beats. Never more beats than
 * cycles, so a beat still never stands for less than a cycle. The cycles all
 * count; only the song squeezes them.
 */
export function freezeBeats(extraCycles: number): number {
  if (extraCycles <= 0) return 0;
  const scale = extraCycles < 10 ? 1 : extraCycles < 100 ? 2 : 3;
  return Math.min(extraCycles, Math.ceil(scale * FREEZE_STRETCH));
}

/** Address bits: tttt ii oo. */
export const lineOf = (address: number) => Math.floor(address / BLOCK_BYTES) % CACHE_LINES;
export const tagOf = (address: number) => Math.floor(address / (BLOCK_BYTES * CACHE_LINES));
export const blockOf = (address: number) => Math.floor(address / BLOCK_BYTES);

/**
 * Why a miss happened (the textbook's "three Cs"): the block was never used
 * before (compulsory), a cache of the same size that could put any block
 * anywhere would have kept it (conflict: two blocks fought over one line), or
 * even that cache was too small (capacity).
 */
export type MissKind = 'first-use' | 'conflict' | 'too-small';

export type CacheLine = { readonly valid: boolean; readonly tag: number };

/** A direct-mapped cache: each address has exactly one line it can go in. */
export class Cache {
  readonly lines: CacheLine[] = Array.from({ length: CACHE_LINES }, () => ({ valid: false, tag: 0 }));
  /** Every block ever brought in, to tell first-use misses apart. */
  private readonly seen = new Set<number>();
  /** The same size of cache with no fixed lines (least recently used goes): most recent last. */
  private readonly anywhere: number[] = [];

  /** Is the block holding `address` in its line? */
  holds(address: number): boolean {
    const line = this.lines[lineOf(address)];
    return line.valid && line.tag === tagOf(address);
  }

  /** A load: hit, or a miss (and why) that brings the block in. */
  read(address: number): { hit: boolean; missKind?: MissKind; evicted?: number } {
    const block = blockOf(address);
    const kept = this.anywhere.includes(block);
    this.touch(block);
    if (this.holds(address)) return { hit: true };
    const missKind: MissKind = !this.seen.has(block) ? 'first-use' : kept ? 'conflict' : 'too-small';
    this.seen.add(block);
    const index = lineOf(address);
    const old = this.lines[index];
    this.lines[index] = { valid: true, tag: tagOf(address) };
    return { hit: false, missKind, evicted: old.valid ? old.tag * CACHE_LINES + index : undefined };
  }

  /** A store: write-through, so the cache only matters if the block is already in (no write allocate). */
  write(address: number): { hit: boolean } {
    const hit = this.holds(address);
    if (hit) this.touch(blockOf(address));
    return { hit };
  }

  private touch(block: number): void {
    const at = this.anywhere.indexOf(block);
    if (at >= 0) this.anywhere.splice(at, 1);
    this.anywhere.push(block);
    if (this.anywhere.length > CACHE_LINES) this.anywhere.shift();
  }
}

/** One load or store reaching memory, and how long it took. */
export type Access = {
  readonly kind: 'load' | 'store';
  readonly address: number;
  /** How many bytes it moved (an item of the job's data). */
  readonly size: number;
  /** Where it was served: the L1 cache, RAM, or (stores with a cache) the write buffer. */
  readonly level: 'L1' | 'RAM' | 'BUFFER';
  /** The whole access in cycles: 1 fits in the MEMORY stage, more freezes the pipeline. */
  readonly cycles: number;
  /** With a cache: did it hit, and for a load that missed, why. */
  readonly hit?: boolean;
  readonly missKind?: MissKind;
  /** Block number pushed out of the line by this miss, if one was there. */
  readonly evicted?: number;
  /** A load that missed: the blocks it brought into the cache (more than one for an item wider than a block). */
  readonly fills?: readonly number[];
};

/** The data memory side of the CPU: RAM, and the L1 cache once it's bought. */
export class MemorySystem {
  readonly cache: Cache | undefined;
  loads = 0;
  stores = 0;
  hits = 0;
  misses = 0;
  readonly missKinds: Record<MissKind, number> = { 'first-use': 0, conflict: 0, 'too-small': 0 };
  /** Trips to RAM that made the pipeline wait. */
  ramTrips = 0;

  constructor(cache: boolean) {
    this.cache = cache ? new Cache() : undefined;
  }

  /**
   * A load or store of `size` bytes at `address` on a clock of `mhz`. Without
   * a clock the memory keeps up with anything (every access fits in the
   * MEMORY stage). An item wider than a cache block spans several: each one
   * missing is its own trip to RAM (a 64-bit number in 4-byte blocks can take
   * two). Without a cache, RAM hands over the whole item in one trip, as wide
   * as the chip's bus.
   */
  access(kind: 'load' | 'store', address: number, mhz: number | undefined, size = 1): Access {
    const ram = mhz === undefined ? 1 : ramCycles(mhz, this.cache !== undefined);
    if (kind === 'store') this.stores++;
    else this.loads++;
    let access: Access;
    const cache = this.cache;
    const blocks = Array.from({ length: blockOf(address + size - 1) - blockOf(address) + 1 }, (_, i) => blockOf(address) + i);
    if (!cache) {
      access = { kind, address, size, level: 'RAM', cycles: ram };
    } else if (kind === 'store') {
      access = { kind, address, size, level: 'BUFFER', cycles: 1, hit: blocks.every((block) => cache.write(block * BLOCK_BYTES).hit) };
    } else {
      const results = blocks.map((block) => ({ block, ...cache.read(block * BLOCK_BYTES) }));
      const missed = results.filter((result) => !result.hit);
      if (missed.length === 0) this.hits++;
      else {
        this.misses++;
        if (missed[0].missKind) this.missKinds[missed[0].missKind]++;
      }
      access =
        missed.length === 0
          ? { kind, address, size, level: 'L1', cycles: 1, hit: true }
          : {
              kind,
              address,
              size,
              level: 'RAM',
              cycles: ram * missed.length,
              hit: false,
              missKind: missed[0].missKind,
              evicted: missed.find((result) => result.evicted !== undefined)?.evicted,
              fills: missed.map((result) => result.block),
            };
    }
    if (access.cycles > 1) this.ramTrips++;
    return access;
  }
}
