import type { Entry } from '../data/glossary.ts';
import type { Era } from '../ui/eras.ts';
import { eraText } from '../ui/widgets.ts';
import { LANE_X0, LANES_W, PANEL_X, REPLAY_SPEEDS, type Clickable, type Hoverable } from './layout.ts';

/** What the replay's controls ask the song for. */
export type ReplayActions = {
  /** One speed slower (-1) or faster (+1). */
  readonly speed: (step: -1 | 1) => void;
  readonly pause: () => void;
  readonly resume: () => void;
  /** Whether things can still be explained (not once the results are up). */
  readonly playing: () => boolean;
};

/**
 * A replay's controls and click-to-learn: the speed and pause line where the
 * song's menu hint is, an outline around whatever the pointer is over, and a box
 * explaining what something is when it's clicked (pausing the replay). In a
 * song (not a replay), clickable() leaves things as they are.
 */
export class ReplayControls {
  private readonly scene: Phaser.Scene;
  private readonly era: Era;
  private readonly watching: boolean;
  private readonly actions: ReplayActions;
  /** The clickable thing under the pointer, outlined by `hoverBox`. */
  private hovered: Hoverable | null = null;
  private hoverBox: Phaser.GameObjects.Rectangle | undefined;
  private speedValue: Phaser.GameObjects.Text | undefined;
  private speedText: Phaser.GameObjects.Text | undefined;
  private info: { box: Phaser.GameObjects.Container; frame: Phaser.GameObjects.Rectangle; title: Phaser.GameObjects.Text; body: Phaser.GameObjects.Text; hint: Phaser.GameObjects.Text } | undefined;

  constructor(scene: Phaser.Scene, era: Era, watching: boolean, actions: ReplayActions) {
    this.scene = scene;
    this.era = era;
    this.watching = watching;
    this.actions = actions;
  }

  /** In replays, hovering `target` outlines it and clicking it pauses and explains what it is. */
  readonly clickable: Clickable = (target, entry) => {
    if (!this.watching) return target;
    target
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.explain(entry()))
      .on('pointerover', () => (this.hovered = target))
      .on('pointerout', () => {
        if (this.hovered === target) this.hovered = null;
      });
    return target;
  };

  private text(x: number, y: number, content: string, size: number): Phaser.GameObjects.Text {
    return eraText(this.scene, this.era, x, y, content, size);
  }

  /** Draws the controls (last, over everything else). */
  draw(speedIndex: number, paused: boolean): void {
    const { fg, bg } = this.era;
    // [<] 2x [>]   SPEED   [SPACE] PAUSE
    this.text(PANEL_X, 498, '[<]', 15).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.actions.speed(-1));
    this.speedValue = this.text(PANEL_X + 54, 498, '', 15).setOrigin(0.5, 0);
    this.text(PANEL_X + 80, 498, '[>]', 15).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.actions.speed(1));
    this.speedText = this.text(PANEL_X + 124, 498, '', 15);
    this.text(PANEL_X, 520, 'CLICK ANYTHING TO LEARN WHAT IT IS   [ESC] MENU', 13).setAlpha(0.6);

    this.hoverBox = this.scene.add.rectangle(0, 0, 10, 10, fg, 0.12).setStrokeStyle(1.5, fg, 1).setDepth(640).setVisible(false);
    // Positions inside the box are set in explain(), once the text is known.
    const frame = this.scene.add.rectangle(0, 0, LANES_W - 8, 200, bg).setOrigin(0.5, 0).setStrokeStyle(2, fg);
    const title = this.text(0, 0, '', 17).setOrigin(0.5).setFontStyle('bold');
    const body = this.text(0, 0, '', 15).setOrigin(0.5, 0).setAlign('center').setLineSpacing(6).setWordWrapWidth(LANES_W - 40);
    const hint = this.text(0, 0, 'CLICK OR PRESS SPACE TO CONTINUE', 13).setOrigin(0.5).setAlpha(0.6);
    const box = this.scene.add.container(LANE_X0 + LANES_W / 2, 70, [frame, title, body, hint]).setDepth(650).setVisible(false);
    this.info = { box, frame, title, body, hint };
    frame.setInteractive().on('pointerdown', () => this.actions.resume());
    // A click on empty space also resumes.
    this.scene.input.on('pointerdown', (_pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.actions.resume();
    });
    this.render(speedIndex, paused);
  }

  /** Shows the speed, and whether Space pauses or resumes. */
  render(speedIndex: number, paused: boolean): void {
    this.speedValue?.setText(`${REPLAY_SPEEDS[speedIndex]}x`);
    this.speedText?.setText(`SPEED   [SPACE] ${paused ? 'RESUME' : 'PAUSE'}`);
  }

  /** Every frame: outlines whatever the pointer is over, following it if it moves (falling notes). */
  updateHover(): void {
    const target = this.hovered;
    if (!target?.active || !target.visible) {
      this.hovered = null;
      this.hoverBox?.setVisible(false);
      return;
    }
    const bounds = target.getBounds();
    this.hoverBox?.setPosition(bounds.centerX, bounds.centerY).setSize(bounds.width + 10, bounds.height + 6).setVisible(true);
  }

  private explain(entry: Entry): void {
    const { info } = this;
    if (!info || !this.actions.playing()) return;
    this.actions.pause();
    info.title.setText(entry.title);
    info.body.setText(entry.body);
    // Grow the box to fit the text: title, body, then the hint, top to bottom.
    info.title.setY(26);
    info.body.setY(48);
    info.hint.setY(info.body.y + info.body.height + 22);
    info.frame.setSize(LANES_W - 8, info.hint.y + 22);
    info.box.setVisible(true);
  }

  /** The explanation goes (resuming, or the song ending). */
  hideInfo(): void {
    this.info?.box.setVisible(false);
  }
}
