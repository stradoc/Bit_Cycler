import { cheatFlags } from './cheatFlags.ts';
import { CLOCK, COOLING } from './data/economy.ts';
import { LESSONS } from './data/lessons.ts';
import { formatMhz, formatMoney } from './format.ts';
import { getProgress, newGame, updateProgress } from './save.ts';
import { getSettings, updateSettings } from './settings.ts';
import { fillBoard, ratedMhz, tierOf, withTier, type Progress } from './sim/progress.ts';
import { THERMAL } from './sim/thermal.ts';

// Testing cheats, typed into the browser's developer console (F12 -> Console):
// cheat.help() lists them. Each one changes the save and refreshes the screen.

const MENU_SCENES = ['title', 'board', 'shop'];

const HELP = `Bit Cycler cheats (type in this console):
  cheat.status()        what you have now
  cheat.money(5000)     set your money
  cheat.tier(4)         set your CPU tier (1-6): gives or removes parts
  cheat.clock(5)        clock upgrade level (0-${CLOCK.factors.length - 1})
  cheat.cooling(2)      cooler (0 stock, 1 heatsink, 2 fan)
  cheat.cache()         own the L1 cache (false to remove)
  cheat.overclock()     own the overclocking upgrade (false to remove)
  cheat.wear(1.2)       chip's max clock after overheating (1.0-1.5)
  cheat.unlockAll()     every part, max clock, fan, overclocking, $100,000
  cheat.board()         new random contracts
  cheat.lessons(true)   mark every briefing read (false: unread again)
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
      `${formatMoney(p.money)} | tier ${tier.number} ${tier.name} | ${formatMhz(ratedMhz(p))} (clock level ${p.clockLevel}) | ` +
      `${COOLING[p.cooling].name} | overclocking ${p.overclocking ? 'yes' : 'no'} | L1 cache ${p.cacheLevels > 0 ? 'yes' : 'no'} | ` +
      `max clock ${Math.round(p.chipMaxDial * 100)}%`
    );
  };
  const clampInt = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));

  const cheat = {
    help: () => console.log(HELP),
    status,
    money: (dollars: number) => change((p) => ({ ...p, money: Math.max(0, Math.round(dollars)) })),
    tier: (tier: number) => change((p) => withTier(p, tier)),
    clock: (level: number) => change((p) => ({ ...p, clockLevel: clampInt(level, CLOCK.factors.length - 1) })),
    cooling: (level: number) => change((p) => ({ ...p, cooling: clampInt(level, COOLING.length - 1) })),
    overclock: (on = true) => change((p) => ({ ...p, overclocking: on })),
    cache: (on = true) => change((p) => ({ ...p, cacheLevels: on ? 1 : 0 })),
    wear: (maxDial: number) => change((p) => ({ ...p, chipMaxDial: Math.min(THERMAL.maxDial, Math.max(1, maxDial)) })),
    unlockAll: () =>
      change((p) => ({
        ...withTier(p, 6),
        money: 100_000,
        clockLevel: CLOCK.factors.length - 1,
        cooling: COOLING.length - 1,
        cacheLevels: 1,
        overclocking: true,
        chipMaxDial: THERMAL.maxDial,
      })),
    board: () => change((p) => fillBoard({ ...p, board: [] }, Math.random)),
    lessons: (read = true) => {
      updateSettings({ seenLessons: read ? Object.keys(LESSONS) : [] });
      return `briefings marked ${read ? 'read' : 'unread'} (${getSettings().seenLessons.length} read)`;
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
