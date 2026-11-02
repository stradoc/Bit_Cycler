import { GROUP_STYLES, MOTIONS, recipeFor, styleFor, timed, type Group, type MotionName, type Recipe } from '../data/motions.ts';
import { getSettings } from '../settings.ts';
import { alongPath, type Point } from '../song/layout.ts';
import { baseEra, ERAS, previewEra } from '../ui/eras.ts';
import { ListMenu } from '../ui/list.ts';
import { Screen } from '../ui/screen.ts';
import { MotionPlayer } from '../visual/motion.ts';

// The motion lab (developer screen, or ?scene=motions): every animation in
// data/motions.ts played on a sample in this era, over and over, so a new or
// changed recipe can be seen next to the others before it goes in the game.
// It plays them with its own player on its own clock, so it can freeze one at
// any moment: ?scene=motions&motion=note-flush&at=300 (with &era=N) holds that
// recipe 300 ms in, for screenshots.

/** The groups in the order the lab shows them, and their names. */
const GROUPS: readonly { readonly group: Group; readonly name: string }[] = [
  { group: 'song', name: 'THE SONG' },
  { group: 'tick', name: 'TICK' },
  { group: 'screen', name: 'SCREENS' },
];

/** The beat recipes fitted to the beat are shown at: 75 BPM, a tier 1 song's tempo. */
const BEAT_MS = 800;
/** A rest between passes, and how many passes a loop shows before starting again. */
const REST_MS = 600;
const LOOP_PASSES = 3;
/** Where the sample stands, where a 'goal' track sends it, and the wire a `progress` follows. */
const STAGE = { x: 640, y: 250 };
const GOAL = { x: STAGE.x + 120, y: STAGE.y + 60 };
const WIRE: readonly Point[] = [[480, 330], [600, 330], [600, 170], [800, 170]];

const groupOf = (name: MotionName): Group => (MOTIONS[name] as Recipe).group ?? 'screen';

export class MotionsScene extends Screen {
  private menu!: ListMenu;
  private groupIndex = 0;
  private names: MotionName[] = [];
  private sample!: Phaser.GameObjects.Container;
  private wire!: Phaser.GameObjects.Graphics;
  private dot!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private clock!: Phaser.GameObjects.Text;
  /** The lab's own player and clock: real time since the recipe was chosen, or held at `frozen` ms. */
  private readonly player = new MotionPlayer();
  private started = 0;
  private frozen: number | undefined;

  constructor() {
    super('motions');
  }

  init(): void {
    this.frozen = undefined;
  }

  create(data?: { group?: number; selected?: number; frozen?: number }): void {
    this.setUp();
    this.header('MOTION LAB', `EVERY ANIMATION, IN THE ${this.era.name} ERA`);
    const params = new URLSearchParams(location.search);
    const asked = params.get('motion') as MotionName | null;
    const askedAt = Number(params.get('at'));
    this.groupIndex = data?.group ?? (asked && asked in MOTIONS ? GROUPS.findIndex(({ group }) => group === groupOf(asked)) : 0);
    this.frozen = data?.frozen ?? (asked && params.has('at') && Number.isFinite(askedAt) ? askedAt : undefined);
    this.menu = new ListMenu(this, this.era, { x: 40, top: 100, width: 300, rowHeight: 20, size: 14, heading: 16 });
    this.wire = this.add.graphics();
    this.dot = this.textAt(0, 0, 'x5=7', 14).setOrigin(1, 1);
    const box = this.add.rectangle(0, 0, 130, 26, this.era.bg).setStrokeStyle(1, this.era.fg, 0.8);
    this.sample = this.add.container(STAGE.x, STAGE.y, [box, this.textAt(0, 0, 'add x5, x1, x2', 14).setOrigin(0.5)]);
    this.info = this.textAt(400, 360, '', 13).setLineSpacing(4).setAlpha(0.85);
    this.clock = this.textAt(400, 430, '', 13);
    this.aboutLine().setText('A SAMPLE PLAYS THE CHOSEN ANIMATION AS IT LOOKS IN THIS ERA. [E] SHOWS THE NEXT ERA.');
    this.hints('[UP/DOWN] CHOOSE', '[LEFT/RIGHT] GROUP', '[SPACE] FREEZE', '[,] [.] STEP', '[E] ERA', '[Q] BACK');
    this.showGroup(data?.selected ?? (asked ? this.namesOf(this.groupIndex).indexOf(asked) : 0));
  }

  private namesOf(index: number): MotionName[] {
    return (Object.keys(MOTIONS) as MotionName[]).filter((name) => groupOf(name) === GROUPS[index].group);
  }

  private showGroup(selected: number): void {
    this.names = this.namesOf(this.groupIndex);
    const heading = `< ${GROUPS[this.groupIndex].name} >`;
    this.menu.setRows(this.names.map((name, i) => ({ label: name.toUpperCase(), group: i === 0 ? heading : undefined })), Math.max(0, selected));
    this.restart();
  }

  /** The chosen recipe from its start, and what it is. */
  private restart(): void {
    this.started = performance.now();
    const name = this.names[this.menu.selected];
    const recipe = timed(recipeFor(name, this.era.motion), { beatMs: BEAT_MS });
    const reduced = getSettings().reducedMotion;
    const style = styleFor(this.era.motion, recipe, reduced).style;
    const props = Object.keys(recipe.tracks).join(', ').toUpperCase();
    const own = GROUP_STYLES[recipe.group ?? 'screen'] ? ` (THE SAME IN EVERY ERA)` : ' (THIS ERA\'S WAY)';
    this.info.setText(
      [
        `MOVES ${props}  ${recipe.duration} MS${recipe.beats ? ` (${recipe.beats} OF A ${BEAT_MS} MS BEAT)` : ''}${recipe.loop ? `  LOOPS (${recipe.loop.toUpperCase()})` : ''}`,
        `STYLE: ${style.toUpperCase()}${reduced && !recipe.essential ? ' (REDUCED MOTION IS ON)' : own}  EASE: ${(recipe.ease ?? 'out').toUpperCase()}`,
      ].join('\n'),
    );
  }

  /** The chosen recipe as this era plays it, and how long the lab shows it for (a loop: a few passes). */
  private chosen(): { name: MotionName; recipe: Recipe; length: number } | undefined {
    const name = this.names[this.menu.selected];
    if (!name) return undefined;
    const recipe = timed(recipeFor(name, this.era.motion), { beatMs: BEAT_MS });
    return { name, recipe, length: (recipe.delay ?? 0) + recipe.duration * (recipe.loop ? LOOP_PASSES : 1) };
  }

  update(): void {
    super.update();
    const chosen = this.chosen();
    if (!chosen) return;
    const { name, recipe, length } = chosen;
    const t = this.frozen ?? (performance.now() - this.started) % (length + REST_MS);
    // Every frame from the start: the sample back where it rests, the recipe played from 0 and sampled at t (so it can be frozen or stepped back).
    this.sample.setPosition(STAGE.x, STAGE.y).setAlpha(1).setScale(1).setAngle(0);
    const mover = { progress: 0 };
    const along = 'progress' in recipe.tracks;
    this.player.clear();
    this.player.play(name, along ? mover : this.sample, { goal: GOAL, beatMs: BEAT_MS, now: 0 });
    this.player.update(t);
    this.sample.setVisible(!along);
    this.wire.clear().setVisible(along);
    this.dot.setVisible(along);
    if (along) {
      this.wire.lineStyle(1, this.era.fg, 0.3).strokePoints(WIRE.map(([x, y]) => new Phaser.Math.Vector2(x, y)));
      const travelled = alongPath(WIRE, mover.progress);
      this.wire.lineStyle(2, this.era.fg, 0.9).strokePoints(travelled.map(([x, y]) => new Phaser.Math.Vector2(x, y)));
      const [x, y] = travelled.at(-1) ?? WIRE[0];
      this.dot.setPosition(x - 4, y - 2);
    }
    const bar = Math.round(20 * Math.min(1, t / Math.max(1, length)));
    this.clock.setText(`${this.frozen !== undefined ? 'FROZEN' : 'PLAYING'}  ${Math.round(t)} / ${length} MS  [${'#'.repeat(bar)}${'.'.repeat(20 - bar)}]`);
  }

  protected onKey(key: string): boolean | void {
    if (this.menu.busy) return true;
    const chosen = this.chosen();
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      this.cue('move');
      this.menu.move(key === 'ArrowUp' ? -1 : 1);
      this.frozen = this.frozen === undefined ? undefined : 0;
      this.restart();
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      this.cue('move');
      this.groupIndex = (this.groupIndex + (key === 'ArrowLeft' ? GROUPS.length - 1 : 1)) % GROUPS.length;
      this.showGroup(0);
    } else if (key === ' ') {
      this.frozen = this.frozen === undefined && chosen ? (performance.now() - this.started) % (chosen.length + REST_MS) : undefined;
      if (this.frozen === undefined) this.restart();
    } else if ((key === ',' || key === '.') && chosen) {
      // A twentieth of the recipe a step, from wherever it is.
      const step = chosen.recipe.duration / 20;
      this.frozen = Math.max(0, (this.frozen ?? 0) + (key === ',' ? -step : step));
    } else if (key === 'E') {
      // The next era, for this session only (like ?era=N); the lab is drawn again in it.
      previewEra((ERAS.indexOf(baseEra()) + 1) % ERAS.length);
      this.scene.restart({ group: this.groupIndex, selected: this.menu.selected, frozen: this.frozen });
    } else if (key === 'Escape' || key === 'Q') {
      this.back('dev');
    } else return false;
    return true;
  }
}
