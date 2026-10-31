import { GLOSSARY } from '../data/glossary.js';
import { unitOf } from '../sim/isa.js';
import { alongPath, BOX_X, BUS_X, LANE_X0, LANES_W, laneCenter, NOTE_H, NOTE_W } from './layout.js';
import { Part } from './view.js';
/**
 * The bus: wires from the MEM and WB rows across to a vertical bus, and from
 * it into each register row and memory row. Results travel along it to the
 * panel, lighting the wire behind them; tier 3's forwarded values jump between
 * notes; a memory wait's request goes up it and the data comes back.
 */
export class Bus extends Part {
    panel;
    highway;
    glow;
    /** The value on its way during a memory wait ("[5]?", then "=7"). */
    tripLabel;
    transfers = [];
    /** Stores already sent to memory (they travel from the MEM row). */
    storesSent = new Set();
    constructor(view, panel, highway) {
        super(view);
        this.panel = panel;
        this.highway = highway;
        const { rows, singleCycle } = view.setup;
        this.tripLabel = this.text(0, 0, '', 14).setOrigin(1, 1).setDepth(700).setVisible(false);
        const wires = this.scene.add.graphics().lineStyle(1, this.era.fg, 0.25);
        const lanesRight = LANE_X0 + LANES_W;
        if (!singleCycle)
            wires.lineBetween(lanesRight, rows.MEM, BUS_X, rows.MEM);
        wires.lineBetween(lanesRight, rows.WB, BUS_X, rows.WB);
        const ends = panel.wireRows();
        const top = Math.min(...ends);
        wires.lineBetween(BUS_X, top, BUS_X, rows.WB);
        for (const y of ends)
            wires.lineBetween(BUS_X, y, BOX_X, y);
        this.glow = this.scene.add.graphics().setDepth(690);
        view.clickable(this.scene.add.zone(BUS_X - 8, top, 16, rows.WB - top).setOrigin(0), () => GLOSSARY.BUS);
    }
    /** Values still on their way. */
    get busy() {
        return this.transfers.length > 0;
    }
    /**
     * Sends results to the panel: register results leave from WB (when they're
     * written back), stored bytes from MEM (when memory is written); each lands
     * in the panel within `beatSeconds`.
     */
    send(committed, beatSeconds) {
        const { run, setup } = this.view;
        const rd = committed?.step?.wrote;
        if (committed && rd !== undefined && committed.value !== undefined) {
            const value = committed.value;
            this.carry(committed, setup.rows.WB, `x${rd}=${value}`, this.panel.registerY(rd), beatSeconds, () => this.panel.landRegister(rd, value));
        }
        // Stores leave from MEMORY; on the single-cycle CPU, from the finished instruction.
        const store = setup.singleCycle ? run.pipeline.stages.WB : run.pipeline.stages.MEM;
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
    carry(slot, rowY, label, toY, beatSeconds, land) {
        const startX = laneCenter(unitOf(slot.instr)) + NOTE_W / 2;
        const path = [[startX, rowY], [BUS_X, rowY], [BUS_X, toY], [BOX_X, toY]];
        // The label rides up and to the left of the moving point, outside the panel.
        const text = this.text(startX, rowY, label, 14).setOrigin(1, 1).setDepth(700);
        // Fits inside one beat, so values never pile up on the bus.
        const duration = Math.min(600, beatSeconds * 1000 * 0.8);
        this.transfers.push({ text, path, start: performance.now(), duration, land });
    }
    /**
     * Tier 3: when an instruction issues with a value forwarded from EX or MEM,
     * that value jumps up a lit wire from the producer's note into it. Returns
     * the first value forwarded (for practice's tip).
     */
    forward(consumer, beatSeconds) {
        const forwarded = this.view.run.pipeline.forwardedFrom();
        const note = this.highway.note(consumer);
        if (!note)
            return undefined;
        for (const { reg, producer } of forwarded) {
            const from = this.highway.block(producer.seq);
            if (!from)
                continue;
            const midY = (from.box.y + note.box.y) / 2;
            const x = note.box.x + 34;
            const path = [
                [from.box.x + 34, from.box.y - NOTE_H / 2],
                [from.box.x + 34, midY],
                [x, midY],
                [x, note.box.y + NOTE_H / 2],
            ];
            const text = this.text(path[0][0], path[0][1], `x${reg}=${producer.value}`, 14).setOrigin(1, 1).setDepth(700);
            const duration = Math.min(350, beatSeconds * 1000 * 0.45);
            this.transfers.push({ text, path, start: performance.now(), duration, land: () => { } });
        }
        return forwarded[0];
    }
    /** Every frame: moves values along on the real clock, lighting the wire behind them. */
    update(now) {
        this.glow.clear();
        this.tripLabel.setVisible(false);
        this.transfers = this.transfers.filter((transfer) => {
            const t = Math.min(1, (now - transfer.start) / transfer.duration);
            const travelled = alongPath(transfer.path, 1 - (1 - t) ** 2);
            const [x, y] = travelled.at(-1) ?? transfer.path[0];
            // Hidden until it has left its note, so it doesn't sit on top of the note's result.
            transfer.text.setPosition(x - 4, y - 2).setVisible(t > 0.15);
            this.glow.lineStyle(2, this.era.fg, 0.9 * (1 - t * 0.5));
            this.glow.strokePoints(travelled.map(([px, py]) => new Phaser.Math.Vector2(px, py)));
            if (t < 1)
                return true;
            transfer.text.destroy();
            transfer.land();
            return false;
        });
    }
    /**
     * A memory wait `t` (0-1) of the way through: the request runs up the bus
     * from the waiting note to memory's row (`rowY`), and the data comes back.
     * Call after update(), every frame of the wait.
     */
    trip(from, rowY, t, label) {
        const path = [[from.x + NOTE_W / 2, from.y], [BUS_X, from.y], [BUS_X, rowY], [BOX_X, rowY]];
        const travelled = t >= 0.5 ? alongPath([...path].reverse(), 2 * t - 1) : alongPath(path, 2 * t);
        this.glow.lineStyle(2, this.era.fg, 0.9).strokePoints(travelled.map(([x, y]) => new Phaser.Math.Vector2(x, y)));
        const [x, y] = travelled.at(-1) ?? path[0];
        this.tripLabel.setText(label).setPosition(x - 4, y - 2).setVisible(true);
    }
}
//# sourceMappingURL=bus.js.map