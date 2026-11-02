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
};
export const CACHE_LINES = 4;
export const BLOCK_BYTES = 4;
/**
 * Memory a byte job uses and the panel shows at once (4 rows of 8): two
 * cache-fulls, so blocks can compete for a line. A job's data fits in this many
 * items, so wider data uses more bytes (up to 256), shown through a window.
 */
export const SHOWN_BYTES = 32;
/** Cycles an access taking `ns` occupies at `mhz`: the whole access, at least the 1 the MEMORY stage has anyway. */
export function cyclesFor(ns, mhz) {
    // The tiny margin keeps 60 ns at 4 GHz at 240 cycles despite rounding (4400.000000000001 MHz and so on).
    return Math.max(1, Math.ceil((ns * mhz) / 1000 - 1e-9));
}
/** Cycles a trip to RAM takes at `mhz`, with or without the L1 check on the way. */
export function ramCycles(mhz, cache = false) {
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
export function freezeBeats(extraCycles) {
    if (extraCycles <= 0)
        return 0;
    const scale = extraCycles < 10 ? 1 : extraCycles < 100 ? 2 : 3;
    return Math.min(extraCycles, Math.ceil(scale * FREEZE_STRETCH));
}
/** Address bits: tttt ii oo. */
export const lineOf = (address) => Math.floor(address / BLOCK_BYTES) % CACHE_LINES;
export const tagOf = (address) => Math.floor(address / (BLOCK_BYTES * CACHE_LINES));
export const blockOf = (address) => Math.floor(address / BLOCK_BYTES);
/** A direct-mapped cache: each address has exactly one line it can go in. */
export class Cache {
    lines = Array.from({ length: CACHE_LINES }, () => ({ valid: false, tag: 0 }));
    /** Every block ever brought in, to tell first-use misses apart. */
    seen = new Set();
    /** The same size of cache with no fixed lines (least recently used goes): most recent last. */
    anywhere = [];
    /** Is the block holding `address` in its line? */
    holds(address) {
        const line = this.lines[lineOf(address)];
        return line.valid && line.tag === tagOf(address);
    }
    /** A load: hit, or a miss (and why) that brings the block in. */
    read(address) {
        const block = blockOf(address);
        const kept = this.anywhere.includes(block);
        this.touch(block);
        if (this.holds(address))
            return { hit: true };
        const missKind = !this.seen.has(block) ? 'first-use' : kept ? 'conflict' : 'too-small';
        this.seen.add(block);
        const index = lineOf(address);
        const old = this.lines[index];
        this.lines[index] = { valid: true, tag: tagOf(address) };
        return { hit: false, missKind, evicted: old.valid ? old.tag * CACHE_LINES + index : undefined };
    }
    /** A store: write-through, so the cache only matters if the block is already in (no write allocate). */
    write(address) {
        const hit = this.holds(address);
        if (hit)
            this.touch(blockOf(address));
        return { hit };
    }
    touch(block) {
        const at = this.anywhere.indexOf(block);
        if (at >= 0)
            this.anywhere.splice(at, 1);
        this.anywhere.push(block);
        if (this.anywhere.length > CACHE_LINES)
            this.anywhere.shift();
    }
}
/** The data memory side of the CPU: RAM, and the L1 cache once it's bought. */
export class MemorySystem {
    cache;
    loads = 0;
    stores = 0;
    hits = 0;
    misses = 0;
    missKinds = { 'first-use': 0, conflict: 0, 'too-small': 0 };
    /** Trips to RAM that made the pipeline wait. */
    ramTrips = 0;
    constructor(cache) {
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
    access(kind, address, mhz, size = 1) {
        const ram = mhz === undefined ? 1 : ramCycles(mhz, this.cache !== undefined);
        if (kind === 'store')
            this.stores++;
        else
            this.loads++;
        let access;
        const cache = this.cache;
        const blocks = Array.from({ length: blockOf(address + size - 1) - blockOf(address) + 1 }, (_, i) => blockOf(address) + i);
        if (!cache) {
            access = { kind, address, size, level: 'RAM', cycles: ram };
        }
        else if (kind === 'store') {
            access = { kind, address, size, level: 'BUFFER', cycles: 1, hit: blocks.every((block) => cache.write(block * BLOCK_BYTES).hit) };
        }
        else {
            const results = blocks.map((block) => ({ block, ...cache.read(block * BLOCK_BYTES) }));
            const missed = results.filter((result) => !result.hit);
            if (missed.length === 0)
                this.hits++;
            else {
                this.misses++;
                if (missed[0].missKind)
                    this.missKinds[missed[0].missKind]++;
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
        if (access.cycles > 1)
            this.ramTrips++;
        return access;
    }
}
//# sourceMappingURL=memory.js.map