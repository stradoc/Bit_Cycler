import { cheatFlags } from './cheatFlags.js';
import { CHIPS, CLOCK, COOLING } from './data/economy.js';
import { TAUGHT_IDS } from './data/tours.js';
import { formatMhz, formatMoney } from './format.js';
import { activeSlot, getProgress, newGame, slotName, updateProgress } from './save.js';
import { bitsName, chipByBits, fillBoard, fitChip, ratedMhz, tierOf, withEverything, withTier, withWordBits } from './sim/progress.js';
import { THERMAL } from './sim/thermal.js';
// Testing cheats, typed into the browser's developer console (F12 -> Console):
// cheat.help() lists them. Each one changes the save and refreshes the screen.
const MENU_SCENES = ['title', 'board', 'shop', 'saves', 'dev'];
const HELP = `Bit Cycler cheats (type in this console):
  cheat.status()        what you have now
  cheat.money(5000)     set your money
  cheat.chip(32)        your CPU chip (${CHIPS.map((chip) => chip.bits).join(', ')}): sets the era; drops parts it can't run
  cheat.tier(4)         set your CPU tier (1-6): gives or removes parts (and fits a chip that runs them)
  cheat.clock(5)        clock upgrade level (0-${CLOCK.factors.length - 1}), on a chip that runs it
  cheat.cooling(2)      cooler (0 stock, 1 heatsink, 2 fan)
  cheat.cache()         own the L1 cache (false to remove)
  cheat.overclock()     own the overclocking upgrade (false to remove)
  cheat.wear(1.2)       chip's max clock after overheating (1.0-1.5)
  cheat.unlockAll()     every part, max clock, fan, overclocking, the L1 cache, $100,000
  cheat.board()         new random contracts
  cheat.lessons(true)   mark every lesson and tour seen (false: unseen again)
  cheat.autoplay()      the game plays songs for you (false to stop)
  cheat.temp(94)        set the chip's temperature mid-song
  cheat.reset()         new game (wipes the save)`;
export function installCheats(game) {
    /** Saves a change and redraws whichever menu is showing. */
    const change = (edit) => {
        updateProgress(edit);
        for (const key of MENU_SCENES)
            if (game.scene.isActive(key))
                game.scene.getScene(key).scene.restart();
        return status();
    };
    const status = () => {
        const p = getProgress();
        const tier = tierOf(p);
        return (`${slotName(activeSlot())} | ${formatMoney(p.money)} | ${bitsName(p.wordBits).toLowerCase()} | tier ${tier.number} ${tier.name} | ${formatMhz(ratedMhz(p))} (clock level ${p.clockLevel}) | ` +
            `${COOLING[p.cooling].name} | overclocking ${p.overclocking ? 'yes' : 'no'} | L1 cache ${p.cacheLevels > 0 ? 'yes' : 'no'} | ` +
            `max clock ${Math.round(p.chipMaxDial * 100)}%`);
    };
    const clampInt = (n, max) => Math.max(0, Math.min(max, Math.round(n)));
    const cheat = {
        help: () => console.log(HELP),
        status,
        money: (dollars) => change((p) => ({ ...p, money: Math.max(0, Math.round(dollars)) })),
        chip: (bits) => {
            const chip = chipByBits(bits);
            return chip ? change((p) => withWordBits(p, chip.bits)) : `no ${bits}-bit chip: try ${CHIPS.map((c) => c.bits).join(', ')}`;
        },
        tier: (tier) => change((p) => withTier(p, tier)),
        clock: (level) => change((p) => fitChip({ ...p, clockLevel: clampInt(level, CLOCK.factors.length - 1) })),
        cooling: (level) => change((p) => ({ ...p, cooling: clampInt(level, COOLING.length - 1) })),
        overclock: (on = true) => change((p) => ({ ...p, overclocking: on })),
        cache: (on = true) => change((p) => ({ ...p, cacheLevels: on ? 1 : 0 })),
        wear: (maxDial) => change((p) => ({ ...p, chipMaxDial: Math.min(THERMAL.maxDial, Math.max(1, maxDial)) })),
        unlockAll: () => change(withEverything),
        board: () => change((p) => fillBoard({ ...p, board: [] }, Math.random)),
        lessons: (read = true) => {
            updateProgress((p) => ({ ...p, seenLessons: read ? [...TAUGHT_IDS] : [] }));
            return `lessons and tours marked ${read ? 'seen' : 'unseen'} (${getProgress().seenLessons.length} seen)`;
        },
        autoplay: (on = true) => {
            cheatFlags.autoplay = on;
            return `autoplay ${on ? 'on: songs play themselves' : 'off'}`;
        },
        temp: (celsius) => {
            if (!game.scene.isActive('pipeline'))
                return 'only during a song';
            game.scene.getScene('pipeline').setTemperature(celsius);
            return `chip at ${celsius}°C`;
        },
        reset: () => {
            newGame();
            return change((p) => p);
        },
    };
    window.cheat = cheat;
    console.log('Bit Cycler: type cheat.help() for testing cheats.');
}
//# sourceMappingURL=cheats.js.map