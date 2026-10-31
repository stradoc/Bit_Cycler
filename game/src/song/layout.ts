import type { Entry } from '../data/glossary.ts';
import { UNITS, type Unit } from '../sim/isa.ts';
import { BLOCK_BYTES, lineOf, SHOWN_BYTES, tagOf, type Access, type MissKind } from '../sim/memory.ts';
import type { Slot, Stage } from '../sim/pipeline.ts';

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
export type Rows = { readonly EX: number; readonly MEM: number; readonly WB: number };
export const ROWS: Rows = { EX: HIT_Y + ROW_GAP, MEM: HIT_Y + 2 * ROW_GAP, WB: HIT_Y + 3 * ROW_GAP };
/** Tier 1 (single-cycle): no EX / MEM rows; a finished instruction shows its result just below the line. */
export const SINGLE_CYCLE_ROWS: Rows = { EX: HIT_Y + ROW_GAP, MEM: HIT_Y + ROW_GAP, WB: HIT_Y + ROW_GAP };
export const PX_PER_BEAT = 64;
export const NOTE_W = LANE_W - 8;
export const NOTE_H = 26;
/** How many instructions past IF get falling notes. */
export const LOOKAHEAD = 6;
/** How long a key's lane lights up (and its 90s button stays pressed in), ms. */
export const FLASH_MS = 120;
export const LANE_KEYS: Readonly<Record<Unit, string>> = { ALU: 'D', MEM: 'F', BRANCH: 'J' };
export const STAGE_NAMES: Readonly<Record<Stage, string>> = { IF: 'FETCH', ID: 'DECODE', EX: 'EXECUTE', MEM: 'MEMORY', WB: 'WRITE BACK' };

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
export const REPLAY_SPEEDS = [0.5, 1, 2, 4] as const;

// ---- shared types ----
export type Point = readonly [number, number];

/** A note: its box (clickable, pulses on a hazard) and its label, which carries the era's decoration and a branch's hint. */
export type NoteBlock = {
  box: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Container;
  /** Tier 4 branch notes: the hint drawn around the note (it lives in `label`, so it moves with it). */
  hint?: { taken: boolean; sure: boolean; view: Phaser.GameObjects.Container };
  /** The 90s desktop: the note's raised edges, pressed in once it's played. */
  button?: { press(down: boolean): void };
};
export type NoteView = NoteBlock & {
  /** Beat this note is drawn as due; eases toward `target` when the schedule shifts. */
  due: number;
  target: number;
  /** In ID and already on the hit line: it stays pinned there until it moves on. */
  pinned: boolean;
};
/** An issued note in the EX / MEM / WB rows; eases toward its row every frame. */
export type RowBlock = NoteBlock & { rowY: number; result?: Phaser.GameObjects.Text };

/** Something on screen that can be hovered and clicked in a replay. */
export type Hoverable = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.GetBounds & { visible: boolean };
/** Makes `target` explain itself (`entry`) when clicked in a replay; elsewhere it returns it unchanged. */
export type Clickable = <T extends Hoverable>(target: T, entry: () => Entry) => T;

/** A memory wait being drawn: from beat `start` for `beats` beats, standing for `total` cycles. */
export type FreezeView = {
  readonly start: number;
  readonly beats: number;
  /** The run's frozen beats before this wait. */
  readonly base: number;
  readonly total: number;
  readonly slot: Slot;
  readonly access: Access;
};

// ---- helpers ----
export const noteKey = (slot: Slot) => `${slot.seq}:${slot.pc}`;
export const laneCenter = (unit: Unit) => LANE_X0 + LANE_W * (UNITS.indexOf(unit) + 0.5);
export const hex = (value: number) => value.toString(16).toUpperCase().padStart(2, '0');
export const bin = (value: number, bits: number) => value.toString(2).padStart(bits, '0');
/** An address as the cache splits it: tag, line, offset (tttt ii oo). */
export const addressBits = (address: number) => `${bin(tagOf(address), 4)} ${bin(lineOf(address), 2)} ${bin(address % BLOCK_BYTES, 2)}`;
/** Why a miss happened, in the words the screen uses. */
export const MISS_WORDS: Readonly<Record<MissKind, string>> = { 'first-use': 'FIRST USE', conflict: 'CONFLICT', 'too-small': 'TOO SMALL' };

/** The point `fraction` (0-1) of the way along a polyline, and the path up to it. */
export function alongPath(path: readonly Point[], fraction: number): Point[] {
  const lengths = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  let remaining = fraction * lengths.reduce((a, b) => a + b, 0);
  const travelled: Point[] = [path[0]];
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
