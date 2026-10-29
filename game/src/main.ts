import { installCheats } from './cheats.ts';
import { keepKeyboardFocus } from './input/keyFocus.ts';
import { BoardScene } from './scenes/BoardScene.ts';
import { BriefingScene } from './scenes/BriefingScene.ts';
import { PipelineScene } from './scenes/PipelineScene.ts';
import { ShopScene } from './scenes/ShopScene.ts';
import { TitleScene } from './scenes/TitleScene.ts';

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
