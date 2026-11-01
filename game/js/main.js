import { installCheats } from './cheats.js';
import { keepKeyboardFocus } from './input/keyFocus.js';
import { BoardScene } from './scenes/BoardScene.js';
import { BootScene } from './scenes/BootScene.js';
import { DevScene } from './scenes/DevScene.js';
import { PipelineScene } from './scenes/PipelineScene.js';
import { SavesScene } from './scenes/SavesScene.js';
import { SettingsScene } from './scenes/SettingsScene.js';
import { ShopScene } from './scenes/ShopScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { applyEra, fitCamera, HEIGHT, isHires, loadFonts, showFps, WIDTH } from './visual/display.js';
import { currentEra, ERAS, previewEra } from './ui/eras.js';
keepKeyboardFocus();
await loadFonts();
// ?era=1..4 in the URL shows that era instead of the save's, until the page reloads (previews and testing).
const eraParam = Number(new URLSearchParams(location.search).get('era'));
if (eraParam >= 1 && eraParam <= ERAS.length)
    previewEra(eraParam - 1);
const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    // The canvas grows past 960x540 in the modern era (visual/display.ts); layout always uses 960x540.
    width: WIDTH,
    height: HEIGHT,
    // Smooth lines and sub-pixel motion where the era wants them; the retro eras snap to
    // whole pixels and get stretched with chunky pixels instead (visual/display.ts).
    antialias: true,
    roundPixels: false,
    backgroundColor: '#050a05',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // Keyboard is handled in input/keys.ts; Phaser's plugin double-fires keys within a frame.
    input: { keyboard: false },
    // The first scene starts the game: the intro, then the main menu ('title').
    scene: [BootScene, TitleScene, SettingsScene, SavesScene, DevScene, BoardScene, ShopScene, PipelineScene],
});
installCheats(game);
if (new URLSearchParams(location.search).has('fps'))
    showFps(game);
// A resized window gets a sharper or smaller canvas in the eras drawn at the screen's resolution.
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (!isHires())
            return;
        applyEra(game, currentEra());
        for (const scene of game.scene.getScenes(true))
            fitCamera(scene.cameras.main);
    }, 200);
});
// Dev shortcut: ?scene=play jumps straight into a scene, skipping the intro (?scene=title: the main menu).
const startScene = new URLSearchParams(location.search).get('scene');
if (startScene) {
    game.events.once(Phaser.Core.Events.READY, () => {
        game.scene.stop('boot');
        // ?scene=play was the old tier 1 screen: it's the pipeline scene in single-cycle mode now.
        game.scene.start(startScene === 'play' ? 'pipeline' : startScene, startScene === 'play' ? { singleCycle: true } : undefined);
    });
}
//# sourceMappingURL=main.js.map