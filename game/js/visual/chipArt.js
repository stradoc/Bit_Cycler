import { CLOCK, COOLING } from '../data/economy.js';
import { formatMhz } from '../format.js';
import { ratedMhz, tierOf } from '../sim/progress.js';
import { THERMAL } from '../sim/thermal.js';
// ASCII art of the player's chip for the shop: the cooler on top, the die
// showing the parts owned, the clock underneath, and cracks from overheating.
// Plain ASCII so every monospace font draws it.
const WIDTH = 28; // inside the package
/** Pads (or trims) a die row to the package width, centered. */
function row(content) {
    const text = content.slice(0, WIDTH);
    const left = Math.floor((WIDTH - text.length) / 2);
    return ` -|${' '.repeat(left)}${text}${' '.repeat(WIDTH - text.length - left)}|- `;
}
function cooler(level) {
    if (level === 2) {
        return [
            '        .------------.        ',
            '       /  \\   |   /  \\       ',
            '      |  --- (@) ---  |      ',
            '       \\  /   |   \\  /       ',
            '        \'------------\'        ',
        ];
    }
    if (level === 1) {
        return ['   | | | | | | | | | | | |    ', '   |_|_|_|_|_|_|_|_|_|_|_|    ', '   =======================    '];
    }
    return [];
}
/** The die: what's inside depends on the parts owned. */
function die(progress) {
    const tier = tierOf(progress).number;
    const lines = [];
    if (tier === 1) {
        lines.push('', '[ SINGLE-CYCLE CORE ]', '  one long step  ', '');
    }
    else {
        lines.push('', '[IF]>[ID]>[EX]>[ME]>[WB]');
        lines.push(tier >= 3 ? '      ^----FWD---\'    ' : '');
        lines.push(tier >= 4 ? `[BRANCH ${tier >= 6 ? '2-BIT' : tier === 5 ? '1-BIT' : 'GUESS'}]` : '');
    }
    if (progress.overclocking)
        lines.push('~ OC ~');
    else
        lines.push('');
    return lines;
}
/** Each 10% of wear adds a crack; deterministic, so the art doesn't flicker. */
function crack(lines, steps) {
    const marks = ['x', '/', '\\', 'x'];
    return lines.map((line, i) => {
        if (i === 0 || i === lines.length - 1 || steps === 0)
            return line;
        const chars = [...line];
        for (let k = 0; k < steps; k++) {
            const at = 4 + ((i * 7 + k * 11) % (WIDTH - 2));
            if (chars[at] === ' ' && (i + k) % 2 === 0)
                chars[at] = marks[(i + k) % marks.length];
        }
        return chars.join('');
    });
}
/** The chip as lines of text, top to bottom. */
export function chipArt(progress) {
    const pins = `   ${'| '.repeat(WIDTH / 2)}   `;
    const wear = Math.round((THERMAL.maxDial - progress.chipMaxDial) / THERMAL.damagePerOverheat);
    const body = crack([` .${'-'.repeat(WIDTH + 2)}. `, ...die(progress).map(row), ` '${'-'.repeat(WIDTH + 2)}' `], wear);
    const clock = `<> ${formatMhz(ratedMhz(progress))}  CLK ${progress.clockLevel + 1}/${CLOCK.factors.length}`;
    return [
        ...cooler(progress.cooling),
        pins,
        ...body,
        pins,
        '',
        `${COOLING[progress.cooling].name}`,
        clock,
        ...(wear > 0 ? [`CRACKED: MAX CLOCK ${Math.round(progress.chipMaxDial * 100)}%`] : []),
    ];
}
//# sourceMappingURL=chipArt.js.map