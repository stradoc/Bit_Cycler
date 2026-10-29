import { getProgress } from './save.ts';
import { getSettings } from './settings.ts';
import { tierOf, type Contract } from './sim/progress.ts';

/**
 * Plays a contract on the CPU the player owns. A concept they haven't learned
 * yet (a new game's first contract) gets its briefing and practice first.
 */
export function playContract(scene: Phaser.Scene, contract: Contract): void {
  const tier = tierOf(getProgress());
  const data = { ...tier.options, program: contract.program, contract };
  const { seenLessons } = getSettings();
  if (!seenLessons.includes(tier.lessonId)) {
    scene.scene.start('briefing', { lessonId: tier.lessonId, mandatory: true, then: { scene: tier.scene, data: { ...data, practice: true } } });
  } else {
    scene.scene.start(tier.scene, data);
  }
}

/**
 * Right after buying something with a briefing: the briefing (no skipping),
 * then a practice of the new part (CPU parts) or back to the shop.
 */
export function briefAfterPurchase(scene: Phaser.Scene, lessonId: string): void {
  const tier = tierOf(getProgress());
  const isPart = lessonId === tier.lessonId;
  const then = isPart
    ? { scene: tier.scene, data: { ...tier.options, practice: true, returnTo: 'board' } }
    : { scene: 'shop', data: {} };
  scene.scene.start('briefing', { lessonId, mandatory: true, then });
}
