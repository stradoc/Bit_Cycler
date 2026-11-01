import { LESSONS } from './data/lessons.ts';
import { getProgress } from './save.ts';
import { pastMemoryWall, tierOf, type Contract } from './sim/progress.ts';
import type { SongStart } from './song/setup.ts';

// How the game moves between the board, TICK's lessons and the song. Every
// lesson is TICK's tour of the song screen (data/tours.ts): it plays the first
// time its idea comes up, then a practice for a new kind of CPU, or straight
// on for the others. Any lesson plays again from BRIEFS on the main menu.

/** Where to go next: a screen, and what it starts with. */
export type Next = { readonly scene: string; readonly data?: object };

/**
 * Plays a contract on the CPU the player owns. A CPU they haven't learned yet
 * (a new game's first contract) gets TICK's tour and a practice first; the
 * memory wall, the first time the clock outruns RAM, gets its tour before the song.
 */
export function playContract(scene: Phaser.Scene, contract: Contract): void {
  const progress = getProgress();
  const tier = tierOf(progress);
  const data = { ...tier.options, program: contract.program, contract } satisfies SongStart;
  if (!progress.seenLessons.includes(tier.lessonId)) {
    scene.scene.start(tier.scene, { ...data, practice: true, tour: [tier.lessonId] } satisfies SongStart);
  } else if (pastMemoryWall(progress) && !progress.seenLessons.includes('memwall')) {
    // The clock outran RAM without a clock purchase (buying the pipeline can do it): TICK explains the wall, then the song.
    scene.scene.start(tier.scene, { ...data, tour: ['memwall'] } satisfies SongStart);
  } else {
    scene.scene.start(tier.scene, data);
  }
}

/**
 * Right after buying something with a lesson: TICK's tour on the song screen,
 * then a practice of the new part (CPU parts and the cache, then the board),
 * or back to the shop (overclocking, the memory wall). The cache's lesson
 * builds on the memory wall's, so that one comes first if it's unseen.
 */
export function teachAfterPurchase(scene: Phaser.Scene, lessonId: string): void {
  const tier = tierOf(getProgress());
  const lesson = LESSONS[lessonId];
  if (!lesson) {
    scene.scene.start('shop');
    return;
  }
  const tour = lessonId === 'cache' && !getProgress().seenLessons.includes('memwall') ? ['memwall', lessonId] : [lessonId];
  if (lesson.practice) {
    scene.scene.start(tier.scene, { ...tier.options, practice: true, returnTo: 'board', tour } satisfies SongStart);
  } else {
    scene.scene.start(tier.scene, { ...tier.options, tour, afterTour: { scene: 'shop' } } satisfies SongStart);
  }
}

/**
 * Plays a lesson again (BRIEFS on the main menu, the developer screen): its
 * tour, then its practice, or back to `back` for a lesson with no practice.
 */
export function openLesson(scene: Phaser.Scene, lessonId: string, back: Next): void {
  const lesson = LESSONS[lessonId];
  if (!lesson) return;
  const start: SongStart = { ...lesson.options, tour: [lessonId], ...(lesson.practice ? { practice: true } : { afterTour: back }) };
  scene.scene.start(lesson.scene, start);
}
