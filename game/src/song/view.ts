import type { ProgramSpec } from '../data/programs.ts';
import type { PipelineRun } from '../rhythm/pipelineRun.ts';
import type { CacheLine } from '../sim/memory.ts';
import type { Predictor } from '../sim/pipeline.ts';
import type { Era } from '../ui/eras.ts';
import { eraText } from '../ui/widgets.ts';
import type { Clickable, Rows } from './layout.ts';
import type { SongWords } from './words.ts';

// What every part of the song screen shares (song/highway.ts, panel.ts,
// bus.ts, gauge.ts): the scene and its era, the run, how this song is set up,
// what the panel shows, the replay's click-to-learn, and fades.

/** How this song is set up: the program, the CPU's hardware, and how it's played. */
export type SongSetup = {
  readonly spec: ProgramSpec;
  /** Tier 1: every instruction does all five steps in one long beat. */
  readonly singleCycle: boolean;
  /** Tier 3: results go straight to the next instruction. */
  readonly forwarding: boolean;
  /** Tier 4: the player guesses each branch (J not taken, K taken). */
  readonly guessing: boolean;
  /** Tiers 5-6: a hardware predictor guesses first. */
  readonly predictor: Predictor | undefined;
  /** The L1 data cache (from the shop). */
  readonly l1: boolean;
  /** Notes wait for the player, and mistakes are explained. */
  readonly practice: boolean;
  /** A replay of a recorded run. */
  readonly watching: boolean;
  readonly rows: Rows;
};

/** What the panel shows: values change when they arrive over the bus, a cache line when its block arrives. */
export type Shown = { readonly regs: number[]; readonly memory: Uint8Array; readonly lines: CacheLine[] };

/** Things fading out on the real clock, then destroyed (so slow frames can't leave them stuck on screen). */
export class Fades {
  private fading: { parts: { setAlpha(alpha: number): unknown; destroy(): void }[]; start: number; duration: number }[] = [];

  add(parts: { setAlpha(alpha: number): unknown; destroy(): void }[], duration: number): void {
    this.fading.push({ parts, start: performance.now(), duration });
  }

  update(now: number): void {
    this.fading = this.fading.filter(({ parts, start, duration }) => {
      const t = (now - start) / duration;
      if (t >= 1) {
        for (const part of parts) part.destroy();
        return false;
      }
      for (const part of parts) part.setAlpha(1 - t);
      return true;
    });
  }
}

export type SongView = {
  readonly scene: Phaser.Scene;
  readonly era: Era;
  readonly run: PipelineRun;
  readonly setup: SongSetup;
  readonly shown: Shown;
  readonly words: SongWords;
  readonly clickable: Clickable;
  readonly fades: Fades;
};

/** A part of the song screen. */
export class Part {
  protected readonly view: SongView;
  protected readonly scene: Phaser.Scene;
  protected readonly era: Era;

  constructor(view: SongView) {
    this.view = view;
    this.scene = view.scene;
    this.era = view.era;
  }

  /** Text in the era's font and color, its top-left corner at (x, y). */
  protected text(x: number, y: number, content: string, size = 16): Phaser.GameObjects.Text {
    return eraText(this.scene, this.era, x, y, content, size);
  }
}
