import { eraText } from '../ui/widgets.js';
/** A part of the song screen. */
export class Part {
    view;
    scene;
    era;
    constructor(view) {
        this.view = view;
        this.scene = view.scene;
        this.era = view.era;
    }
    /** Text in the era's font and color, its top-left corner at (x, y). */
    text(x, y, content, size = 16) {
        return eraText(this.scene, this.era, x, y, content, size);
    }
}
//# sourceMappingURL=view.js.map