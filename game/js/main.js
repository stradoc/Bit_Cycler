import { keepKeyboardFocus } from './input/keyFocus.js';
import { BriefingScene } from './scenes/BriefingScene.js';
import { PlayScene } from './scenes/PlayScene.js';
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
    scene: [TitleScene, BriefingScene, PlayScene],
});
// Dev shortcut: ?scene=play jumps straight into a scene.
const startScene = new URLSearchParams(location.search).get('scene');
if (startScene) {
    game.events.once(Phaser.Core.Events.READY, () => {
        game.scene.stop('title');
        game.scene.start(startScene);
    });
}
//# sourceMappingURL=main.js.map