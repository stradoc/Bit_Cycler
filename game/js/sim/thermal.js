// Clock speed, power and heat. Dynamic power grows with frequency and with
// voltage squared (P ≈ C·V²·f), and a faster clock needs more voltage, so heat
// grows faster than speed: the "power wall". The chip warms toward a steady
// temperature set by its power, and throttles back to its rated clock when
// it gets too hot, like a real CPU. Each overheat also wears the chip: real
// heat and voltage slowly lower the fastest clock a chip runs reliably at
// (here sped up a lot), until it's repaired.
export const THERMAL = {
    /** Temperature of an idle chip (°C). */
    ambient: 40,
    /** How far above ambient a fully busy chip settles at its rated clock (°C). */
    ratedRise: 30,
    /** Cycles to close ~63% of the gap to the steady temperature (the cooler's time constant). */
    timeConstant: 25,
    /** Extra voltage needed per extra clock: +10% clock needs +4% voltage. */
    voltageSlope: 0.4,
    /** Power on a cycle where nothing issues (stall, bubble): idle hardware switches less. */
    idlePower: 0.7,
    /** Throttle at this temperature, and run at full clock again once cooled to `resumeAt` (°C). */
    throttleAt: 95,
    resumeAt: 80,
    /**
     * Clock dial range, as a fraction of the rated clock, and one step of it (G / H in a song).
     * Underclocking to 50% halves the tempo, time to think, at the cost of twice the CPU time.
     */
    minDial: 0.5,
    maxDial: 1.5,
    dialStep: 0.1,
    /** Each overheat lowers the chip's maximum clock by this much, down to its rated clock. */
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
/** A CPU's clock and temperature, advanced one clock cycle at a time. */
export class Chip {
    ratedMhz;
    /** The clock the player set, as a fraction of the rated clock (> 1 = overclocked). */
    dial = 1;
    /** The highest the dial goes: lowered by overheating (wear) until repaired. */
    maxDial;
    /** Times it reached the throttle temperature this run. */
    overheats = 0;
    config;
    temperature;
    peak;
    /** Too hot: running at the rated clock until it cools to `resumeAt`. */
    throttled = false;
    throttledCycles = 0;
    /** Real time the cycles so far took, at whatever clock each one ran (µs). */
    micros = 0;
    cycles = 0;
    constructor(ratedMhz, maxDial = THERMAL.maxDial, config = THERMAL) {
        this.ratedMhz = ratedMhz;
        this.config = config;
        this.maxDial = Math.min(config.maxDial, Math.max(1, maxDial));
        this.temperature = config.ambient;
        this.peak = config.ambient;
    }
    /** Sets the dial, kept within its range (the maximum shrinks as the chip wears). Returns the dial. */
    setDial(dial) {
        // Rounded to whole percent so repeated steps don't drift (0.1 isn't exact in binary).
        this.dial = Math.round(Math.min(this.maxDial, Math.max(this.config.minDial, dial)) * 100) / 100;
        return this.dial;
    }
    /** The clock right now, as a fraction of the rated clock. Throttling drops an overclock back to rated. */
    get clockRatio() {
        return this.throttled ? Math.min(1, this.dial) : this.dial;
    }
    get mhz() {
        return this.ratedMhz * this.clockRatio;
    }
    /** One clock cycle. `active`: an instruction issued (otherwise a stall or bubble, using less power). */
    cycle(active) {
        const { config } = this;
        this.micros += 1 / this.mhz;
        this.cycles++;
        if (this.throttled)
            this.throttledCycles++;
        const target = config.ambient + config.ratedRise * relativePower(this.clockRatio, active, config);
        this.temperature += (target - this.temperature) / config.timeConstant;
        this.peak = Math.max(this.peak, this.temperature);
        if (!this.throttled && this.temperature >= config.throttleAt) {
            this.throttled = true;
            this.overheats++;
            this.maxDial = Math.max(1, Math.round((this.maxDial - config.damagePerOverheat) * 100) / 100);
            this.setDial(this.dial);
        }
        else if (this.throttled && this.temperature <= config.resumeAt)
            this.throttled = false;
    }
}
//# sourceMappingURL=thermal.js.map