// The memory wall and the caches. RAM takes a fixed time in nanoseconds,
// however fast the clock is, so a faster clock means more cycles spent
// waiting for it: about 60 ns is 1 cycle at 16 MHz but 240 at 4 GHz. While a
// load waits, the whole pipeline freezes (the textbook's in-order pipeline),
// so the waiting cycles raise CPI.
//
// The L1 cache starts as the textbook's first cache: 16 bytes, direct-mapped,
// 4 lines of 4 bytes. An 8-bit address splits into tag (4 bits), line (2) and
// offset (2): tttt ii oo. Its shape is data (CacheShape): the shop's upgrades
// (data/economy.ts CACHE_UPGRADES) give it 8 lines, 2-way sets (lines paired,
// a block going in either line of its set, the one used longest ago making
// room) or 8-byte blocks, and the address split follows. A hit is served
// inside the MEMORY stage. A miss checks L1, then the caches below it in turn
// (LOWER_CACHES: the L2, then the L3, once bought), each lookup adding its
// time, and the first level that has the block answers; RAM if none does.
// Every level it missed on keeps a copy of its own (bigger) block on the way
// back. Stores are write-through with a write buffer: they go to RAM through
// the buffer and never freeze (here the buffer never fills), and a store that
// misses doesn't bring its block in (no write allocate). Without a cache,
// stores wait for RAM like loads. Instruction fetch is always fast: like the
// textbook's separate instruction memory, or an instruction cache that always
// hits on small loops.
import { CACHE_UPGRADES } from '../data/economy.js';
export const MEMORY_TIMING = {
    /** One DRAM access (ns), bringing 4 bytes. Approximate: the textbook gives 50-70 ns for DRAM. */
    ramNs: 60,
    /** Checking L1 on the way to RAM (ns, approximate). A hit itself fits in the MEMORY stage. */
    l1Ns: 1,
    /**
     * RAM sending each 4 bytes of an L1 block after its first (ns, approximate):
     * a bigger block makes a trip to RAM a little longer (the textbook's miss
     * penalty: the wait for RAM, then the time to send the block). Inside the
     * chip, a cache below the L1 hands over a whole block at once (a wide bus),
     * so a miss it answers takes no longer for it.
     */
    moreBytesNs: 5,
};
/** The L1 cache as it's first bought: 16 bytes, 4 lines of 4, direct-mapped. */
export const L1_BASE = { lines: 4, blockBytes: 4, ways: 1 };
/** The L1 with these shop upgrades (CACHE_UPGRADES), in any order. */
export function cacheShape(upgrades) {
    return CACHE_UPGRADES.reduce((shape, upgrade) => (upgrades.includes(upgrade.id) ? { ...shape, [upgrade.field]: upgrade.value } : shape), L1_BASE);
}
/** Two caches built the same way. */
export const sameShape = (a, b) => a.lines === b.lines && a.blockBytes === b.blockBytes && a.ways === b.ways;
/** The cache's size in bytes. */
export const cacheBytes = (shape) => shape.lines * shape.blockBytes;
/** How many sets it has: places a block can be found (a set holds `ways` lines). */
export const setsOf = (shape) => shape.lines / shape.ways;
/**
 * The caches below the L1 (the shop's memory parts after it), in the order a
 * miss checks them. Each is bigger, with bigger blocks, and slower: lower
 * levels are larger and often use larger blocks (Patterson & Hennessy 5.4).
 * The L2 (128 bytes) holds a whole 32-bit job's data, the L3 (256 bytes) a
 * whole 64-bit job's, so it misses only on first use. Times approximate: the
 * textbook's example of a second-level cache takes 5 ns.
 */
export const LOWER_CACHES = [
    { name: 'L2', shape: { lines: 8, blockBytes: 16, ways: 2 }, ns: 5 },
    { name: 'L3', shape: { lines: 4, blockBytes: 64, ways: 4 }, ns: 12 },
];
/** The caches below the L1 on a CPU that has `lower` of them (0, 1 or 2), in the order a miss checks them. */
export const cachesBelow = (lower) => LOWER_CACHES.slice(0, lower);
/** The cache in a few words, as the boot and the shop say it: "16 BYTES: 4 LINES OF 4, DIRECT-MAPPED". */
export function cacheWords(shape) {
    const placing = shape.ways === 1 ? 'DIRECT-MAPPED' : `${shape.ways}-WAY`;
    return `${cacheBytes(shape)} BYTES: ${shape.lines} LINES OF ${shape.blockBytes}, ${placing}`;
}
/**
 * Memory a byte job uses and the panel shows at once (4 rows of 8): two
 * first caches' worth, so blocks can compete for a line. A job's data fits in
 * this many items, so wider data uses more bytes (up to 256), shown through a window.
 */
export const SHOWN_BYTES = 32;
/**
 * How long an L1 miss takes when `from` answers it (ns), with the first
 * `lower` of LOWER_CACHES fitted: the L1 check, each lookup below it on the
 * way down to `from` (found or not), and if it came to RAM, RAM's 60 ns and
 * the time to send the rest of a bigger L1 block. A lower level's own bigger
 * block comes in behind the bytes asked for (the textbook's "critical word
 * first"), so it adds nothing here (approximate).
 */
export function missNs(shape, lower = 0, from = 'RAM') {
    const levels = cachesBelow(lower);
    const reached = from === 'RAM' ? levels.length : levels.findIndex((level) => level.name === from) + 1;
    if (reached === 0 && from !== 'RAM')
        throw new Error(`no ${from} among ${lower} lower caches`);
    const lookups = levels.slice(0, reached).reduce((ns, level) => ns + level.ns, 0);
    const ram = from === 'RAM' ? MEMORY_TIMING.ramNs + MEMORY_TIMING.moreBytesNs * (shape.blockBytes / 4 - 1) : 0;
    return MEMORY_TIMING.l1Ns + lookups + ram;
}
/** Cycles an access taking `ns` occupies at `mhz`: the whole access, at least the 1 the MEMORY stage has anyway. */
export function cyclesFor(ns, mhz) {
    // The tiny margin keeps 60 ns at 4 GHz at 240 cycles despite rounding (4400.000000000001 MHz and so on).
    return Math.max(1, Math.ceil((ns * mhz) / 1000 - 1e-9));
}
/** Cycles a trip to RAM takes at `mhz`: without a cache, or a miss in `cache` that every level below it (the first `lower`) missed too. */
export function ramCycles(mhz, cache, lower = 0) {
    return cyclesFor(cache ? missNs(cache, lower) : MEMORY_TIMING.ramNs, mhz);
}
/**
 * Beats a memory wait is drawn over. A few hundred cycles can't take a few
 * hundred beats, so a wait gets one more beat each time its cycles about
 * triple (each half power of ten: 10, 32, 100, 317 cycles): 2 beats under 10,
 * then 3, 4, 5 and 6. So at 2-4 GHz an L2 hit takes 3 beats, an L3 hit 4 and
 * a trip to RAM 5 (team: a trip to RAM should hurt). Never more beats than
 * cycles, so a beat still never stands for less than a cycle. The cycles all
 * count; only the song squeezes them.
 */
export function freezeBeats(extraCycles) {
    if (extraCycles <= 0)
        return 0;
    const triplings = Math.floor(2 * Math.log10(extraCycles) + 1e-9);
    return Math.min(extraCycles, Math.max(2, triplings + 1));
}
/** The block holding `address`: blocks are numbered from address 0, `blockBytes` each. */
export const blockOf = (shape, address) => Math.floor(address / shape.blockBytes);
/** The set (direct-mapped: the line) a block must go in: its number's last bits. */
export const setOf = (shape, address) => blockOf(shape, address) % setsOf(shape);
/** The tag: the rest of the block's number, saying which of the blocks that share a set is there. */
export const tagOf = (shape, address) => Math.floor(blockOf(shape, address) / setsOf(shape));
/** How many of an 8-bit address's bits are its tag, its set (or line) and its offset in the block: 4, 2, 2 at first. */
export function addressSplit(shape) {
    const offset = Math.log2(shape.blockBytes);
    const set = Math.log2(setsOf(shape));
    return { tag: 8 - set - offset, set, offset };
}
/**
 * A cache of any shape. Each block has one set it can go in; within the set,
 * any of its lines (an empty one first, else the one used longest ago).
 * Direct-mapped, a set is one line.
 */
export class Cache {
    shape;
    /** The lines, set by set: set s holds lines s x ways to s x ways + ways - 1. */
    lines;
    /** When each line was last used, to find the one used longest ago in a set. */
    lastUse;
    uses = 0;
    /** Every block ever brought in, to tell first-use misses apart. */
    seen = new Set();
    /** The same size of cache with no fixed places (least recently used goes): most recent last. */
    anywhere = [];
    constructor(shape = L1_BASE) {
        this.shape = shape;
        this.lines = Array.from({ length: shape.lines }, () => ({ valid: false, tag: 0 }));
        this.lastUse = new Array(shape.lines).fill(0);
    }
    /** The line holding the block with `address`, if it's in. */
    find(address) {
        const { ways } = this.shape;
        const [set, tag] = [setOf(this.shape, address), tagOf(this.shape, address)];
        for (let way = 0; way < ways; way++) {
            const line = this.lines[set * ways + way];
            if (line.valid && line.tag === tag)
                return set * ways + way;
        }
        return undefined;
    }
    /** Is the block holding `address` in the cache? */
    holds(address) {
        return this.find(address) !== undefined;
    }
    /** A load: a hit (in `line`), or a miss (and why) that brings the block into `line`. */
    read(address) {
        const block = blockOf(this.shape, address);
        const kept = this.anywhere.includes(block);
        this.touch(block);
        const found = this.find(address);
        if (found !== undefined) {
            this.lastUse[found] = ++this.uses;
            return { hit: true, line: found };
        }
        const missKind = !this.seen.has(block) ? 'first-use' : kept ? 'conflict' : 'too-small';
        this.seen.add(block);
        const set = setOf(this.shape, address);
        const line = this.room(set);
        const old = this.lines[line];
        this.lines[line] = { valid: true, tag: tagOf(this.shape, address) };
        this.lastUse[line] = ++this.uses;
        const evicted = old.valid ? old.tag * setsOf(this.shape) + set : undefined;
        return evicted === undefined ? { hit: false, line, missKind } : { hit: false, line, missKind, evicted };
    }
    /** A store: write-through, so the cache only matters if the block is already in (no write allocate). */
    write(address) {
        const found = this.find(address);
        if (found === undefined)
            return { hit: false };
        this.lastUse[found] = ++this.uses;
        this.touch(blockOf(this.shape, address));
        return { hit: true, line: found };
    }
    /** The line a new block takes in `set`: an empty one, else the one used longest ago. */
    room(set) {
        const { ways } = this.shape;
        let best = set * ways;
        for (let line = set * ways; line < (set + 1) * ways; line++) {
            if (!this.lines[line].valid)
                return line;
            if (this.lastUse[line] < this.lastUse[best])
                best = line;
        }
        return best;
    }
    touch(block) {
        const at = this.anywhere.indexOf(block);
        if (at >= 0)
            this.anywhere.splice(at, 1);
        this.anywhere.push(block);
        if (this.anywhere.length > this.shape.lines)
            this.anywhere.shift();
    }
}
/** How far down each level is, to find the deepest one an access reached. */
const DEPTH = ['BUFFER', 'L1', 'L2', 'L3', 'RAM'];
/** The data memory side of the CPU: RAM, and the caches once they're bought. */
export class MemorySystem {
    cache;
    /** The caches below the L1 that are fitted, in the order a miss checks them. */
    lower;
    loads = 0;
    stores = 0;
    hits = 0;
    misses = 0;
    missKinds = { 'first-use': 0, conflict: 0, 'too-small': 0 };
    /** Accesses by where they were served (a load whose blocks came from different levels counts at the deepest). */
    served = { L1: 0, L2: 0, L3: 0, RAM: 0, BUFFER: 0 };
    /** Every load's time added up (ns), for the average memory access time. */
    loadNs = 0;
    /** Trips to RAM that made the pipeline wait. */
    ramTrips = 0;
    /** `lower`: how many of LOWER_CACHES sit below the L1 (0 without; none without an L1). */
    constructor(cache, lower = 0) {
        this.cache = cache ? new Cache(cache) : undefined;
        this.lower = cache ? cachesBelow(lower).map((level) => ({ ...level, cache: new Cache(level.shape) })) : [];
    }
    /**
     * The average memory access time (ns) over the loads so far, the textbook's
     * AMAT: an L1 hit's time, plus the misses' share of their trips down.
     */
    averageLoadNs() {
        return this.loads > 0 ? this.loadNs / this.loads : 0;
    }
    /**
     * A load or store of `size` bytes at `address` on a clock of `mhz`. Without
     * a clock the memory keeps up with anything (every access fits in the
     * MEMORY stage). An item wider than a cache block spans several: each one
     * missing is its own trip down (a 64-bit number in 4-byte blocks can take
     * two, the second often found in the L2 the first one filled). Without a
     * cache, RAM hands over the whole item in one trip, as wide as the chip's bus.
     */
    access(kind, address, mhz, size = 1) {
        const cache = this.cache;
        const cyclesOf = (ns) => (mhz === undefined ? 1 : cyclesFor(ns, mhz));
        if (kind === 'store')
            this.stores++;
        else
            this.loads++;
        let access;
        if (!cache) {
            access = { kind, address, size, level: 'RAM', cycles: cyclesOf(MEMORY_TIMING.ramNs), ns: MEMORY_TIMING.ramNs };
        }
        else {
            const { shape } = cache;
            const first = blockOf(shape, address);
            const starts = Array.from({ length: blockOf(shape, address + size - 1) - first + 1 }, (_, i) => (first + i) * shape.blockBytes);
            if (kind === 'store') {
                // Write-through: every level holding the block updates its copy (and none takes one in).
                const results = starts.map((start) => {
                    for (const level of this.lower)
                        level.cache.write(start);
                    return cache.write(start);
                });
                const used = results.flatMap((result) => (result.line === undefined ? [] : [result.line]));
                access = { kind, address, size, level: 'BUFFER', cycles: 1, ns: MEMORY_TIMING.l1Ns, hit: results.every((result) => result.hit), used };
            }
            else {
                const results = starts.map((start) => {
                    const read = cache.read(start);
                    return { block: blockOf(shape, start), ...read, from: read.hit ? undefined : this.below(start) };
                });
                const missed = results.filter((result) => !result.hit);
                if (missed.length === 0)
                    this.hits++;
                else {
                    this.misses++;
                    if (missed[0].missKind)
                        this.missKinds[missed[0].missKind]++;
                }
                const used = results.filter((result) => result.hit).map((result) => result.line);
                const trips = missed.map((result) => missNs(shape, this.lower.length, result.from));
                access =
                    missed.length === 0
                        ? { kind, address, size, level: 'L1', cycles: 1, ns: MEMORY_TIMING.l1Ns, hit: true, used }
                        : {
                            kind,
                            address,
                            size,
                            level: missed.map((result) => result.from ?? 'RAM').reduce((deepest, from) => (DEPTH.indexOf(from) > DEPTH.indexOf(deepest) ? from : deepest)),
                            cycles: trips.reduce((cycles, ns) => cycles + cyclesOf(ns), 0),
                            ns: trips.reduce((total, ns) => total + ns, 0),
                            hit: false,
                            missKind: missed[0].missKind,
                            evicted: missed.find((result) => result.evicted !== undefined)?.evicted,
                            used,
                            fills: missed.map(({ block, line }) => ({ block, line })),
                        };
            }
        }
        this.served[access.level]++;
        if (kind === 'load')
            this.loadNs += access.ns;
        if (access.level === 'RAM' && access.cycles > 1)
            this.ramTrips++;
        return access;
    }
    /** An L1 miss for the block at `address`, checked in each cache below in turn: the first that has it answers (RAM if none). Each one that missed takes its block in. */
    below(address) {
        for (const level of this.lower)
            if (level.cache.read(address).hit)
                return level.name;
        return 'RAM';
    }
}
//# sourceMappingURL=memory.js.map