import { eraText } from '../ui/widgets.js';
/** Things fading out on the real clock, then destroyed (so slow frames can't leave them stuck on screen). */
export class Fades {
    fading = [];
    add(parts, duration) {
        this.fading.push({ parts, start: performance.now(), duration });
    }
    update(now) {
        this.fading = this.fading.filter(({ parts, start, duration }) => {
            const t = (now - start) / duration;
            if (t >= 1) {
                for (const part of parts)
                    part.destroy();
                return false;
            }
            for (const part of parts)
                part.setAlpha(1 - t);
            return true;
        });
    }
}
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