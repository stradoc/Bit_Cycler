import { cssColor } from './terminal.js';
import { bevel, isClassic, isDos, palette } from './bevel.js';
import { textBase } from './display.js';
/**
 * A titled frame around a panel section, like a window on a terminal: a thin
 * border with the title set into its top edge (on the classic desktop, a
 * sunken white field). Returns the title, so callers can make it clickable.
 */
export function panelBox(scene, x, y, width, height, title, era) {
    if (isClassic(era))
        bevel(scene.add.graphics().fillStyle(palette(era).field).fillRect(x, y, width, height), era, x, y, width, height, false);
    // DOS: a double-line box.
    else if (isDos(era))
        scene.add.graphics().lineStyle(1, era.accent, 0.9).strokeRect(x, y, width, height).strokeRect(x + 3, y + 3, width - 6, height - 6);
    else
        scene.add.rectangle(x, y, width, height).setOrigin(0).setStrokeStyle(1, era.accent, 0.45);
    return scene.add
        .text(x + 10, y, ` ${title} `, {
        ...textBase(),
        fontSize: '13px',
        color: cssColor(era.accent),
        backgroundColor: cssColor(era.bg), // hides the border behind the title
    })
        .setOrigin(0, 0.5)
        // Opaque and above the box's contents, so nothing moving inside (the sliding listing) shows through it.
        .setDepth(5);
}
//# sourceMappingURL=panelBox.js.map