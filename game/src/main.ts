import { installCheats } from './cheats.ts';
import { keepKeyboardFocus } from './input/keyFocus.ts';
import { BoardScene } from './scenes/BoardScene.ts';
import { BootScene } from './scenes/BootScene.ts';
import { BriefingScene } from './scenes/BriefingScene.ts';
import { DevScene } from './scenes/DevScene.ts';
import { PipelineScene } from './scenes/PipelineScene.ts';
import { SavesScene } from './scenes/SavesScene.ts';
import { SettingsScene } from './scenes/SettingsScene.ts';
import { ShopScene } from './scenes/ShopScene.ts';
import { TitleScene } from './scenes/TitleScene.ts';
import { updateSettings } from './settings.ts';
import { applyEra, fitCamera, HEIGHT, isHires, loadFonts, showFps, WIDTH } from './visual/display.ts';
import { currentEra, ERAS } from './ui/eras.ts';

keepKeyboardFocus();
await loadFonts();

// ?era=1..4 in the URL overrides the saved era (handy for previews).
const eraParam = Number(new URLSearchParams(location.search).get('era'));
if (eraParam >= 1 && eraParam <= ERAS.length) updateSettings({ eraIndex: eraParam - 1 });

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
  scene: [BootScene, TitleScene, SettingsScene, SavesScene, DevScene, BoardScene, ShopScene, BriefingScene, PipelineScene],
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

// Dev shortcut: ?scene=play jumps straight into a scene, skipping the intro (?scene=title: the main menu).
const startScene = new URLSearchParams(location.search).get('scene');
if (startScene) {
  game.events.once(Phaser.Core.Events.READY, () => {
    game.scene.stop('boot');
    // ?scene=play was the old tier 1 screen: it's the pipeline scene in single-cycle mode now.
    game.scene.start(startScene === 'play' ? 'pipeline' : startScene, startScene === 'play' ? { singleCycle: true } : undefined);
  });
}
