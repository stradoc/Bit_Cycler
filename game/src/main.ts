import { installCheats } from './cheats.ts';
import { keepKeyboardFocus } from './input/keyFocus.ts';
import { BoardScene } from './scenes/BoardScene.ts';
import { BriefingScene } from './scenes/BriefingScene.ts';
import { PipelineScene } from './scenes/PipelineScene.ts';
import { ShopScene } from './scenes/ShopScene.ts';
import { TitleScene } from './scenes/TitleScene.ts';
import { applyEra, fitCamera, HEIGHT, isHires, loadFonts, showFps, WIDTH } from './visual/display.ts';
import { currentEra } from './visual/terminal.ts';

keepKeyboardFocus();
await loadFonts();

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
  scene: [TitleScene, BoardScene, ShopScene, BriefingScene, PipelineScene],
});

installCheats(game);
if (new URLSearchParams(location.search).has('fps')) showFps(game);

// A resized window gets a sharper or smaller canvas in the eras drawn at the screen's resolution.
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!isHires()) return;
    applyEra(game, currentEra());
    for (const scene of game.scene.getScenes(true)) fitCamera(scene.cameras.main);
  }, 200);
});

// Dev shortcut: ?scene=play jumps straight into a scene.
const startScene = new URLSearchParams(location.search).get('scene');
if (startScene) {
  game.events.once(Phaser.Core.Events.READY, () => {
    game.scene.stop('title');
    // ?scene=play was the old tier 1 screen: it's the pipeline scene in single-cycle mode now.
    game.scene.start(startScene === 'play' ? 'pipeline' : startScene, startScene === 'play' ? { singleCycle: true } : undefined);
  });
}
