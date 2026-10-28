import { TitleScene } from './scenes/TitleScene.js';
new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: 480,
    height: 270,
    pixelArt: true,
    backgroundColor: '#050a05',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [TitleScene],
});
//# sourceMappingURL=main.js.map