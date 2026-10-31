// The standard sizes, places and color roles every screen uses, so they all
// look like one program: the main menu's layout, applied everywhere. Change a
// size or a position here and every screen follows.
/** Text sizes (layout pixels). */
export const TEXT = {
    /** A screen's name at the top. */
    title: 24,
    /** The line under it: a path or a short description. */
    subtitle: 13,
    /** Rows, cards and most text. */
    body: 15,
    /** Smaller notes and labels. */
    small: 13,
    /** The key hints at the bottom. */
    hint: 13,
};
/** Where the standard parts of a screen go (layout y, the screen being 960 x 540). */
export const LAYOUT = {
    title: 34,
    subtitle: 64,
    /** A line about the chosen item. */
    about: 470,
    /** Warnings and results of actions. */
    message: 496,
    /** The key hints. */
    hints: 522,
    /** Left and right margins for text aligned to the edges. */
    left: 30,
    right: 930,
};
/** How visible secondary text is. */
export const ALPHA = { subtitle: 0.6, about: 0.85, hint: 0.55, dim: 0.45 };
/** What each of an era's colors is for. */
export function colorsOf(era) {
    return {
        text: era.fg,
        dim: era.dim,
        accent: era.accent,
        /** Something to notice: a warning, a result to read. */
        warn: era.fire[1],
        /** Something gone wrong. */
        danger: era.fire[2],
        background: era.bg,
    };
}
//# sourceMappingURL=theme.js.map