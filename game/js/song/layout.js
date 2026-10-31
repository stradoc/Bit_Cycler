import { UNITS } from '../sim/isa.js';
import { BLOCK_BYTES, lineOf, SHOWN_BYTES, tagOf } from '../sim/memory.js';
// Where everything on the song screen goes (layout pixels, 960 x 540), and
// the small types and helpers its parts share. The highway IS the pipeline:
// notes fall to the hit line (ID), and once routed they step down through the
// EX, MEM and WB rows, one row per beat. The panel on the right shows the
// program, registers, memory and stats; the bus carries results across.
// ---- the highway ----
export const LANE_X0 = 108;
export const LANE_W = 138;
export const LANES_W = UNITS.length * LANE_W;
export const HIT_Y = 330;
export const ROW_GAP = 40;
export const ROWS = { EX: HIT_Y + ROW_GAP, MEM: HIT_Y + 2 * ROW_GAP, WB: HIT_Y + 3 * ROW_GAP };
/** Tier 1 (single-cycle): no EX / MEM rows; a finished instruction shows its result just below the line. */
export const SINGLE_CYCLE_ROWS = { EX: HIT_Y + ROW_GAP, MEM: HIT_Y + ROW_GAP, WB: HIT_Y + ROW_GAP };
export const PX_PER_BEAT = 64;
export const NOTE_W = LANE_W - 8;
export const NOTE_H = 26;
/** How many instructions past IF get falling notes. */
export const LOOKAHEAD = 6;
/** How long a key's lane lights up (and its 90s button stays pressed in), ms. */
export const FLASH_MS = 120;
export const LANE_KEYS = { ALU: 'D', MEM: 'F', BRANCH: 'J' };
export const STAGE_NAMES = { IF: 'FETCH', ID: 'DECODE', EX: 'EXECUTE', MEM: 'MEMORY', WB: 'WRITE BACK' };
// ---- the clock and temperature gauge, top left above the stage names ----
export const GAUGE_X = 54;
export const GAUGE_TOP = 76;
export const GAUGE_BOTTOM = 214;
export const GAUGE_MIN_C = 40;
export const GAUGE_MAX_C = 100;
// ---- the panel ----
export const PANEL_X = 544;
/** The bus between the pipeline and the register file / memory. */
export const BUS_X = 532;
/** Left edge of the panel's boxes; the bus wires plug into it. */
export const BOX_X = PANEL_X - 8;
export const BOX_W = 950 - BOX_X;
export const LINE = 18;
/** The program listing: a window that scrolls to follow the instruction in ID. */
export const LISTING_TOP = 42;
export const LISTING_ROWS = 5;
export const LISTING_LINE = 18;
export const REGISTER_COUNT = 8;
/** Memory rows of 8 bytes (two cache blocks each), and the MEMORY box's width when the L1 cache sits beside it. */
export const MEMORY_ROWS = SHOWN_BYTES / 8;
export const MEMORY_W_CACHED = 252;
/** Replay speeds, chosen with the arrow keys; starts at 1x. */
export const REPLAY_SPEEDS = [0.5, 1, 2, 4];
// ---- helpers ----
export const noteKey = (slot) => `${slot.seq}:${slot.pc}`;
export const laneCenter = (unit) => LANE_X0 + LANE_W * (UNITS.indexOf(unit) + 0.5);
export const hex = (value) => value.toString(16).toUpperCase().padStart(2, '0');
export const bin = (value, bits) => value.toString(2).padStart(bits, '0');
/** An address as the cache splits it: tag, line, offset (tttt ii oo). */
export const addressBits = (address) => `${bin(tagOf(address), 4)} ${bin(lineOf(address), 2)} ${bin(address % BLOCK_BYTES, 2)}`;
/** Why a miss happened, in the words the screen uses. */
export const MISS_WORDS = { 'first-use': 'FIRST USE', conflict: 'CONFLICT', 'too-small': 'TOO SMALL' };
/** The point `fraction` (0-1) of the way along a polyline, and the path up to it. */
export function alongPath(path, fraction) {
    const lengths = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
    let remaining = fraction * lengths.reduce((a, b) => a + b, 0);
    const travelled = [path[0]];
    for (let i = 0; i < lengths.length; i++) {
        const [from, to] = [path[i], path[i + 1]];
        if (remaining >= lengths[i]) {
            travelled.push(to);
            remaining -= lengths[i];
            continue;
        }
        const t = lengths[i] === 0 ? 1 : remaining / lengths[i];
        travelled.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
        break;
    }
    return travelled;
}
//# sourceMappingURL=layout.js.map