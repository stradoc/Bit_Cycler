import { GLOSSARY } from '../data/glossary.ts';
import { unitOf } from '../sim/isa.ts';
import type { Slot } from '../sim/pipeline.ts';
import type { Highway } from './highway.ts';
import { motionOf } from '../visual/motion.ts';
import { alongPath, BOX_X, BUS_X, LANE_X0, LANES_W, laneCenter, NOTE_H, NOTE_W, type Point } from './layout.ts';
import type { Panel } from './panel.ts';
import { Part, type SongView } from './view.ts';

/** A value travelling along the bus from the pipeline to a register or memory cell; `progress` (0-1) is moved by its recipe. */
type Transfer = { text: Phaser.GameObjects.Text; path: readonly Point[]; progress: number };

/**
 * The bus: wires from the MEM and WB rows across to a vertical bus, and from
 * it into each register row and memory row. Results travel along it to the
 * panel, lighting the wire behind them; tier 3's forwarded values jump between
 * notes; a memory wait's request goes up it and the data comes back.
 */
export class Bus extends Part {
  private readonly panel: Panel;
  private readonly highway: Highway;
  private readonly glow: Phaser.GameObjects.Graphics;
  /** The value on its way during a memory wait ("[5]?", then "=7"). */
  private readonly tripLabel: Phaser.GameObjects.Text;
  private transfers: Transfer[] = [];
  /** Stores already sent to memory (they travel from the MEM row). */
  private readonly storesSent = new Set<number>();

  constructor(view: SongView, panel: Panel, highway: Highway) {
    super(view);
    this.panel = panel;
    this.highway = highway;
    const { rows, singleCycle } = view.setup;
    this.tripLabel = this.text(0, 0, '', 14).setOrigin(1, 1).setDepth(700).setVisible(false);
    const wires = this.scene.add.graphics().lineStyle(1, this.era.fg, 0.25);
    const lanesRight = LANE_X0 + LANES_W;
    if (!singleCycle) wires.lineBetween(lanesRight, rows.MEM, BUS_X, rows.MEM);
    wires.lineBetween(lanesRight, rows.WB, BUS_X, rows.WB);
    const ends = panel.wireRows();
    const top = Math.min(...ends);
    wires.lineBetween(BUS_X, top, BUS_X, rows.WB);
    for (const y of ends) wires.lineBetween(BUS_X, y, BOX_X, y);
    this.glow = this.scene.add.graphics().setDepth(690);
    view.clickable(this.scene.add.zone(BUS_X - 8, top, 16, rows.WB - top).setOrigin(0), () => GLOSSARY.BUS);
  }

  /** Values still on their way. */
  get busy(): boolean {
    return this.transfers.length > 0;
  }

  /**
   * Sends results to the panel: register results leave from WB (when they're
   * written back), stored bytes from MEM (when memory is written); each lands
   * in the panel within `beatSeconds`.
   */
  send(committed: Slot | undefined, beatSeconds: number): void {
    const { run, setup } = this.view;
    const rd = committed?.step?.wrote;
    if (committed && rd !== undefined && committed.value !== undefined) {
      const value = committed.value;
      this.carry(committed, setup.rows.WB, `x${rd}=${value}`, this.panel.registerY(rd), beatSeconds, () => this.panel.landRegister(rd, value));
    }
    // Stores leave from MEMORY (a pair holds at most one); on the single-cycle CPU, from the finished instruction.
    const store = setup.singleCycle ? run.pipeline.stages.WB : run.pipeline.inStage('MEM').find((slot) => slot.step?.stored !== undefined);
    const address = store?.step?.stored;
    if (store && address !== undefined && !this.storesSent.has(store.seq)) {
      this.storesSent.add(store.seq);
      const value = run.pipeline.cpu.memory[address];
      const from = setup.singleCycle ? setup.rows.WB : setup.rows.MEM;
      this.carry(store, from, `[${address}]=${value}`, this.panel.storeY(address), beatSeconds, () => this.panel.landStore(address, value));
    }
  }

  /**
   * Starts a value along the bus: right along its row, up the bus, then to the
   * box's edge beside its line. It stops there, so it never covers the panel's
   * text; the line lights up as the value lands.
   */
  private carry(slot: Slot, rowY: number, label: string, toY: number, beatSeconds: number, land: () => void): void {
    const startX = laneCenter(unitOf(slot.instr)) + NOTE_W / 2;
    const path: Point[] = [[startX, rowY], [BUS_X, rowY], [BUS_X, toY], [BOX_X, toY]];
    // The label rides up and to the left of the moving point, outside the panel.
    const text = this.text(startX, rowY, label, 14).setOrigin(1, 1).setDepth(700);
    // Fits inside one beat, so values never pile up on the bus.
    this.travel('bus-carry', { text, path, progress: 0 }, beatSeconds, land);
  }

  /** Sends a value on its way, by `recipe`; once there, it goes and `land` says it has arrived. */
  private travel(recipe: 'bus-carry' | 'bus-forward', transfer: Transfer, beatSeconds: number, land: () => void): void {
    this.transfers.push(transfer);
    motionOf(this.scene).play(recipe, transfer, {
      beatMs: beatSeconds * 1000,
      done: () => {
        this.transfers.splice(this.transfers.indexOf(transfer), 1);
        transfer.text.destroy();
        land();
      },
    });
  }

  /**
   * Tier 3: when an instruction issues with a value forwarded from EX or MEM,
   * that value jumps up a lit wire from the producer's note into it. Returns
   * the first value forwarded (for practice's tip).
   */
  forward(consumer: Slot, beatSeconds: number): { reg: number; producer: Slot } | undefined {
    const forwarded = this.view.run.pipeline.forwardedFrom();
    const note = this.highway.note(consumer);
    if (!note) return undefined;
    for (const { reg, producer } of forwarded) {
      const from = this.highway.block(producer.seq);
      if (!from) continue;
      const midY = (from.box.y + note.box.y) / 2;
      const x = note.box.x + 34;
      const path: Point[] = [
        [from.box.x + 34, from.box.y - NOTE_H / 2],
        [from.box.x + 34, midY],
        [x, midY],
        [x, note.box.y + NOTE_H / 2],
      ];
      const text = this.text(path[0][0], path[0][1], `x${reg}=${producer.value}`, 14).setOrigin(1, 1).setDepth(700);
      this.travel('bus-forward', { text, path, progress: 0 }, beatSeconds, () => {});
    }
    return forwarded[0];
  }

  /** Every frame: draws each value where its recipe has got it to, lighting the wire behind it. */
  update(): void {
    this.glow.clear();
    this.tripLabel.setVisible(false);
    for (const { text, path, progress } of this.transfers) {
      const travelled = alongPath(path, progress);
      const [x, y] = travelled.at(-1) ?? path[0];
      // Hidden until it has left its note, so it doesn't sit on top of the note's result.
      text.setPosition(x - 4, y - 2).setVisible(progress > 0.15);
      this.glow.lineStyle(2, this.era.fg, 0.9 * (1 - progress * 0.5));
      this.glow.strokePoints(travelled.map(([px, py]) => new Phaser.Math.Vector2(px, py)));
    }
  }

  /**
   * A memory wait `t` (0-1) of the way through: the request runs up the bus
   * from the waiting note to memory's row (`rowY`), and the data comes back.
   * Call after update(), every frame of the wait.
   */
  trip(from: { x: number; y: number }, rowY: number, t: number, label: string): void {
    const path: Point[] = [[from.x + NOTE_W / 2, from.y], [BUS_X, from.y], [BUS_X, rowY], [BOX_X, rowY]];
    const travelled = t >= 0.5 ? alongPath([...path].reverse(), 2 * t - 1) : alongPath(path, 2 * t);
    this.glow.lineStyle(2, this.era.fg, 0.9).strokePoints(travelled.map(([x, y]) => new Phaser.Math.Vector2(x, y)));
    const [x, y] = travelled.at(-1) ?? path[0];
    this.tripLabel.setText(label).setPosition(x - 4, y - 2).setVisible(true);
  }
}
