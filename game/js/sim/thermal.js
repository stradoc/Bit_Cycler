// Clock speed, power and heat. Dynamic power grows with frequency and with
// voltage squared (P ≈ C·V²·f), and a faster clock needs more voltage, so heat
// grows faster than speed: the "power wall". The chip warms toward a steady
// temperature set by its power. When it gets too hot it stops its clock until
// it cools, like a real CPU's thermal clock modulation (real ones stop it in
// bursts of microseconds; here it's a few beats). Each overheat also wears the
// chip: real heat and voltage slowly lower the fastest clock a chip runs
// reliably at (here sped up a lot), until it's repaired.
export const THERMAL = {
    /** Temperature of an idle chip (°C). */
    ambient: 40,
    /** How far above ambient a fully busy chip settles at its rated clock (°C). */
    ratedRise: 30,
    /**
     * Cycles to close ~63% of the gap to the steady temperature (the cooler's time constant).
     * At 150% a cold chip overheats in about 28 busy beats; at 140%, about 53: within one song.
     */
    timeConstant: 15,
    /** Extra voltage needed per extra clock: +10% clock needs +4% voltage. */
    voltageSlope: 0.4,
    /** Power on a cycle where nothing issues (stall, bubble): idle hardware switches less. */
    idlePower: 0.7,
    /**
     * A new chip overheats at this temperature and stops its clock until it cools to `resumeAt` (°C).
     * A worn one overheats sooner (Chip.throttleAt).
     */
    throttleAt: 95,
    resumeAt: 80,
    /** Power while the clock is stopped: only leakage, so it cools fast. */
    haltPower: 0.2,
    /**
     * Clock dial range, as a fraction of the rated clock, and one step of it (G / H in a song).
     * Underclocking to 50% halves the tempo, time to think, at the cost of twice the CPU time.
     */
    minDial: 0.5,
    maxDial: 1.5,
    dialStep: 0.1,
    /** Each overheat lowers the chip's top clock by this much, down to its rated clock. */
    damagePerOverheat: 0.1,
};
/** Dynamic power relative to running flat out at the rated clock. */
export function relativePower(clockRatio, active, config = THERMAL) {
    const voltage = 1 + config.voltageSlope * (clockRatio - 1);
    return clockRatio * voltage * voltage * (active ? 1 : config.idlePower);
}
/** The temperature a chip settles at, running at `clockRatio` with every cycle busy. */
export function steadyTemperature(clockRatio, config = THERMAL) {
    return config.ambient + config.ratedRise * relativePower(clockRatio, true, config);
}
/** A CPU's clock and temperature, advanced one clock cycle (or one stopped beat) at a time. */
export class Chip {
    ratedMhz;
    /** The clock the player set, as a fraction of the rated clock (> 1 = overclocked). */
    dial = 1;
    /** The chip's own top clock: lowered by overheating (wear) until repaired. */
    maxDial;
    /** Whether H may go past the rated clock (the overclocking upgrade). */
    canOverclock;
    /** Times it overheated this run. */
    overheats = 0;
    config;
    temperature;
    peak;
    /** Too hot: the clock is stopped (nothing runs) until it cools to `resumeAt`. */
    halted = false;
    /** Beats spent with the clock stopped, and the time they took (µs): no cycles, but time passes. */
    haltedBeats = 0;
    haltedMicros = 0;
    /** Real time the cycles so far took, at whatever clock each one ran (µs). */
    micros = 0;
    cycles = 0;
    constructor(ratedMhz, maxDial = THERMAL.maxDial, config = THERMAL, canOverclock = true) {
        this.ratedMhz = ratedMhz;
        this.config = config;
        this.maxDial = Math.min(config.maxDial, Math.max(1, maxDial));
        this.canOverclock = canOverclock;
        this.temperature = config.ambient;
        this.peak = config.ambient;
    }
    /** The highest the dial goes: the chip's top clock, or the rated clock without the overclocking upgrade. */
    get dialCap() {
        return this.canOverclock ? this.maxDial : 1;
    }
    /** Sets the dial, kept within its range (the top shrinks as the chip wears). Returns the dial. */
    setDial(dial) {
        // Rounded to whole percent so repeated steps don't drift (0.1 isn't exact in binary).
        this.dial = Math.round(Math.min(this.dialCap, Math.max(this.config.minDial, dial)) * 100) / 100;
        return this.dial;
    }
    /** The clock as a fraction of the rated clock. While it's stopped, beats keep this tempo but nothing runs. */
    get clockRatio() {
        return this.dial;
    }
    get mhz() {
        return this.ratedMhz * this.clockRatio;
    }
    /** Real time so far, cycles plus stopped beats (µs). */
    get totalMicros() {
        return this.micros + this.haltedMicros;
    }
    /**
     * How much heat the chip takes, from 1 (new) down: a worn chip's top clock
     * heats up to its limit as fast as 150% does on a new chip (the same share
     * of the way from ambient to where it settles). Worn down to 100%, even the
     * rated clock overheats; underclocking is the way out, or a repair.
     */
    get tolerance() {
        return relativePower(this.maxDial, true, this.config) / relativePower(this.config.maxDial, true, this.config);
    }
    /** Overheats (stops its clock) at this temperature: 95°C new, lower as it wears. */
    get throttleAt() {
        const { ambient, throttleAt } = this.config;
        return ambient + (throttleAt - ambient) * this.tolerance;
    }
    /** Starts its clock again once cooled to this. */
    get resumeAt() {
        const { ambient, resumeAt } = this.config;
        return ambient + (resumeAt - ambient) * this.tolerance;
    }
    /** Moves the temperature one step toward `target`. */
    settle(target) {
        this.temperature += (target - this.temperature) / this.config.timeConstant;
        this.peak = Math.max(this.peak, this.temperature);
    }
    /** One clock cycle. `active`: an instruction issued (otherwise a stall or bubble, using less power). */
    cycle(active) {
        const { config } = this;
        this.micros += 1 / this.mhz;
        this.cycles++;
        this.settle(config.ambient + config.ratedRise * relativePower(this.clockRatio, active, config));
        this.checkOverheat();
    }
    /**
     * One beat of a memory wait that stands for `cycles` cycles: they all pass
     * (their time and their count), but the chip only takes one step toward its
     * idle temperature, as a stall would. A long wait can't cool a hot chip down.
     */
    waitBeat(cycles) {
        const { config } = this;
        this.micros += cycles / this.mhz;
        this.cycles += cycles;
        this.settle(config.ambient + config.ratedRise * relativePower(this.clockRatio, false, config));
        this.checkOverheat();
    }
    /** Too hot: stop the clock, and wear the chip. */
    checkOverheat() {
        const { config } = this;
        if (this.temperature < this.throttleAt)
            return;
        this.halted = true;
        this.overheats++;
        this.maxDial = Math.max(1, Math.round((this.maxDial - config.damagePerOverheat) * 100) / 100);
        this.setDial(this.dial);
    }
    /** One beat with the clock stopped: nothing runs and only leakage heats it, but the beat's time still passes. */
    coolBeat() {
        const { config } = this;
        this.haltedMicros += 1 / this.mhz;
        this.haltedBeats++;
        this.settle(config.ambient + config.ratedRise * config.haltPower);
        if (this.temperature <= this.resumeAt)
            this.halted = false;
    }
}
//# sourceMappingURL=thermal.js.map