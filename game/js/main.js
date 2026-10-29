import { installCheats } from './cheats.js';
import { keepKeyboardFocus } from './input/keyFocus.js';
import { BoardScene } from './scenes/BoardScene.js';
import { BriefingScene } from './scenes/BriefingScene.js';
import { PipelineScene } from './scenes/PipelineScene.js';
import { ShopScene } from './scenes/ShopScene.js';
import { TitleScene } from './scenes/TitleScene.js';
keepKeyboardFocus();
const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: 960,
    height: 540,
    pixelArt: true,
    backgroundColor: '#050a05',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // Keyboard is handled in input/keys.ts; Phaser's plugin double-fires keys within a frame.
    input: { keyboard: false },
    scene: [TitleScene, BoardScene, ShopScene, BriefingScene, PipelineScene],
});
installCheats(game);
// Dev shortcut: ?scene=play jumps straight into a scene.
const startScene = new URLSearchParams(location.search).get('scene');
if (startScene) {
    game.events.once(Phaser.Core.Events.READY, () => {
        game.scene.stop('title');
        // ?scene=play was the old tier 1 screen: it's the pipeline scene in single-cycle mode now.
        game.scene.start(startScene === 'play' ? 'pipeline' : startScene, startScene === 'play' ? { singleCycle: true } : undefined);
    });
}
//# sourceMappingURL=main.js.map