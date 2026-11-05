import { cssColor } from '../ui/eras.js';
import { textBase } from './display.js';
/**
 * Draws syntax-highlighted code: one Text per token (Phaser text has a single
 * color), laid out side by side in a container.
 */
export function codeLine(scene, x, y, parts, colors, { size = 16, maxWidth, center = false, originY = 0.5 } = {}) {
    const texts = parts.map((token) => scene.add
        .text(0, 0, token.text, {
        ...textBase(),
        fontSize: `${size}px`,
        fontStyle: token.kind === 'op' ? 'bold' : '',
        color: cssColor(colors[token.kind]),
    })
        .setOrigin(0, originY));
    const layout = () => {
        let cursor = 0;
        for (const text of texts) {
            text.x = cursor;
            cursor += text.width;
        }
        return cursor;
    };
    let width = layout();
    for (let s = size - 1; maxWidth !== undefined && width > maxWidth && s >= 10; s--) {
        for (const text of texts)
            text.setFontSize(s);
        width = layout();
    }
    if (center)
        for (const text of texts)
            text.x -= width / 2;
    return scene.add.container(x, y, texts);
}
//# sourceMappingURL=codeLine.js.map