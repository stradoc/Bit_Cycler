import { cheatFlags } from './cheatFlags.ts';
import { CACHE_UPGRADES, CHIPS, CLOCK, COOLING, MEMORY_PARTS } from './data/economy.ts';
import { TAUGHT_IDS } from './data/tours.ts';
import { formatMhz, formatMoney } from './format.ts';
import { activeSlot, getProgress, newGame, slotName, updateProgress } from './save.ts';
import { bitsName, chipByBits, fillBoard, fitChip, ratedMhz, tierOf, withEverything, withTier, withWordBits, type Progress } from './sim/progress.ts';
import { THERMAL } from './sim/thermal.ts';
import { endDay } from './sim/workday.ts';

// Testing cheats, typed into the browser's developer console (F12 -> Console):
// cheat.help() lists them. Each one changes the save and refreshes the screen.

const MENU_SCENES = ['title', 'board', 'shop', 'saves', 'dev'];

const HELP = `Bit Cycler cheats (type in this console):
  cheat.status()        what you have now
  cheat.money(5000)     set your money
  cheat.chip(32)        your CPU chip (${CHIPS.map((chip) => chip.bits).join(', ')}): sets the era; drops parts it can't run
  cheat.tier(4)         set your CPU tier (1-7): gives or removes parts (and fits a chip that runs them)
  cheat.clock(5)        clock upgrade level (0-${CLOCK.factors.length - 1}), on a chip that runs it
  cheat.cooling(2)      cooler (0 stock, 1 heatsink, 2 fan)
  cheat.cache(3)        own the caches: 1 the L1, 2 with the L2, 3 with the L3 too (no number: the L1; 0 or false: none)
  cheat.l1('ways')      the L1 with these upgrades: 'lines', 'ways', 'blocks' (none: the first one); keeps the L2 and L3
  cheat.overclock()     own the overclocking upgrade (false to remove)
  cheat.deep('on')      the deep pipeline: 'on', 'off' (owned) or 'none'
  cheat.wear(1.2)       chip's max clock after overheating (1.0-1.5)
  cheat.unlockAll()     every part, max clock, fan, overclocking, every cache and the L1's upgrades, $100,000
  cheat.board()         new random contracts
  cheat.time(6)         hours of today's workday already used (0-8; past 8 the day is over)
  cheat.endDay()        log off: the next morning, with new offers
  cheat.lessons(true)   mark every lesson and tour seen (false: unseen again, practice's tips too)
  cheat.autoplay()      the game plays songs for you (false to stop)
  cheat.temp(94)        set the chip's temperature mid-song
  cheat.reset()         new game (wipes the save)`;

export function installCheats(game: Phaser.Game): void {
  /** Saves a change and redraws whichever menu is showing. */
  const change = (edit: (progress: Progress) => Progress): string => {
    updateProgress(edit);
    for (const key of MENU_SCENES) if (game.scene.isActive(key)) game.scene.getScene(key).scene.restart();
    return status();
  };
  const status = (): string => {
    const p = getProgress();
    const tier = tierOf(p);
    return (
      `${slotName(activeSlot())} | ${formatMoney(p.money)} | ${bitsName(p.wordBits).toLowerCase()} | tier ${tier.number} ${tier.name} | ${formatMhz(ratedMhz(p))} (clock level ${p.clockLevel}) | ` +
      `${COOLING[p.cooling].name} | overclocking ${p.overclocking ? 'yes' : 'no'} | deep pipeline ${p.deepPipeline} | caches ${p.cacheLevels > 0 ? MEMORY_PARTS.slice(0, p.cacheLevels).map((part) => part.id.toUpperCase()).join(' ') : 'none'} | ` +
      `max clock ${Math.round(p.chipMaxDial * 100)}%`
    );
  };
  const clampInt = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));

  const cheat = {
    help: () => console.log(HELP),
    status,
    money: (dollars: number) => change((p) => ({ ...p, money: Math.max(0, Math.round(dollars)) })),
    chip: (bits: number) => {
      const chip = chipByBits(bits);
      return chip ? change((p) => withWordBits(p, chip.bits)) : `no ${bits}-bit chip: try ${CHIPS.map((c) => c.bits).join(', ')}`;
    },
    tier: (tier: number) => change((p) => withTier(p, tier)),
    clock: (level: number) => change((p) => fitChip({ ...p, clockLevel: clampInt(level, CLOCK.factors.length - 1) })),
    cooling: (level: number) => change((p) => ({ ...p, cooling: clampInt(level, COOLING.length - 1) })),
    overclock: (on = true) => change((p) => ({ ...p, overclocking: on })),
    deep: (state: 'none' | 'off' | 'on' = 'on') => change((p) => ({ ...p, deepPipeline: ['none', 'off', 'on'].includes(state) ? state : 'on' })),
    cache: (levels: number | boolean = 1) => change((p) => ({ ...p, cacheLevels: clampInt(levels === true ? 1 : Number(levels), MEMORY_PARTS.length) })),
    l1: (...upgrades: string[]) => {
      const ids = CACHE_UPGRADES.filter((upgrade) => upgrades.includes(upgrade.id)).map((upgrade) => upgrade.id);
      return change((p) => ({ ...p, cacheLevels: Math.max(1, p.cacheLevels), cacheUpgrades: ids }));
    },
    wear: (maxDial: number) => change((p) => ({ ...p, chipMaxDial: Math.min(THERMAL.maxDial, Math.max(1, maxDial)) })),
    unlockAll: () => change(withEverything),
    board: () => change((p) => fillBoard({ ...p, board: [] }, Math.random)),
    time: (hours: number) => change((p) => ({ ...p, worked: Math.max(0, Math.min(24, hours)) * 3600 })),
    endDay: () => change((p) => endDay(p, Math.random).progress),
    lessons: (read = true) => {
      updateProgress((p) => (read ? { ...p, seenLessons: [...TAUGHT_IDS] } : { ...p, seenLessons: [], seenTips: [] }));
      return `lessons and tours marked ${read ? 'seen' : 'unseen'} (${getProgress().seenLessons.length} seen)`;
    },
    autoplay: (on = true) => {
      cheatFlags.autoplay = on;
      return `autoplay ${on ? 'on: songs play themselves' : 'off'}`;
    },
    temp: (celsius: number) => {
      if (!game.scene.isActive('pipeline')) return 'only during a song';
      (game.scene.getScene('pipeline') as Phaser.Scene & { setTemperature(c: number): void }).setTemperature(celsius);
      return `chip at ${celsius}°C`;
    },
    reset: () => {
      newGame();
      return change((p) => p);
    },
  };
  (window as unknown as { cheat: typeof cheat }).cheat = cheat;
  console.log('Bit Cycler: type cheat.help() for testing cheats.');
}
