import { getProgress } from './save.ts';
import { pastMemoryWall, tierOf, type Contract } from './sim/progress.ts';

/**
 * Plays a contract on the CPU the player owns. A concept they haven't learned
 * yet (a new game's first contract) gets its briefing and practice first.
 */
export function playContract(scene: Phaser.Scene, contract: Contract): void {
  const tier = tierOf(getProgress());
  const data = { ...tier.options, program: contract.program, contract };
  const { seenLessons } = getProgress();
  if (!seenLessons.includes(tier.lessonId)) {
    scene.scene.start('briefing', { lessonId: tier.lessonId, mandatory: true, then: { scene: tier.scene, data: { ...data, practice: true } } });
  } else if (pastMemoryWall(getProgress()) && !seenLessons.includes('memwall')) {
    // The clock outran RAM without a clock purchase (buying the pipeline can do it): explain the wall first.
    scene.scene.start('briefing', { lessonId: 'memwall', mandatory: true, then: { scene: tier.scene, data } });
  } else {
    scene.scene.start(tier.scene, data);
  }
}

/**
 * Right after buying something with a briefing: the briefing (no skipping),
 * then a practice of the new part (CPU parts and the cache) or back to the shop.
 * The cache's briefing builds on the memory wall's, so that one comes first if it's unread.
 */
export function briefAfterPurchase(scene: Phaser.Scene, lessonId: string): void {
  const tier = tierOf(getProgress());
  const practices = lessonId === tier.lessonId || lessonId === 'cache';
  const then = practices
    ? { scene: tier.scene, data: { ...tier.options, practice: true, returnTo: 'board' } }
    : { scene: 'shop', data: {} };
  if (lessonId === 'cache' && !getProgress().seenLessons.includes('memwall')) {
    scene.scene.start('briefing', { lessonId: 'memwall', mandatory: true, then: { scene: 'briefing', data: { lessonId, mandatory: true, then } } });
    return;
  }
  scene.scene.start('briefing', { lessonId, mandatory: true, then });
}
