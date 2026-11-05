import type { PipelineRun } from '../rhythm/pipelineRun.ts';
import type { CacheLine } from '../sim/memory.ts';
import type { Era } from '../ui/eras.ts';
import { eraText } from '../ui/widgets.ts';
import type { Clickable } from './layout.ts';
import type { SongSetup } from './setup.ts';
import type { SongWords } from './words.ts';

// What every part of the song screen shares (song/highway.ts, panel.ts,
// bus.ts, gauge.ts): the scene and its era, the run, how this song is set up
// (song/setup.ts), what the panel shows, and the replay's click-to-learn.
// What moves is played by recipes (data/motions.ts, the `song` group) through
// the scene's motion player (visual/motion.ts).

/** What the panel shows: values change when they arrive over the bus, a cache line when its block arrives. */
export type Shown = { readonly regs: number[]; readonly memory: Uint8Array; readonly lines: CacheLine[] };

export type SongView = {
  readonly scene: Phaser.Scene;
  readonly era: Era;
  readonly run: PipelineRun;
  readonly setup: SongSetup;
  readonly shown: Shown;
  readonly words: SongWords;
  readonly clickable: Clickable;
  /** Opens the pause menu (its hint can be clicked). */
  readonly openMenu: () => void;
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
