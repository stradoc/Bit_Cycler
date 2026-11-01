import { LESSONS } from './data/lessons.js';
import { SONG_TOURS } from './data/tours.js';
import { getProgress } from './save.js';
import { pastMemoryWall, tierOf } from './sim/progress.js';
/**
 * Plays a contract on the CPU the player owns. A concept they haven't learned
 * yet (a new game's first contract) gets its practice first, led by the
 * guide's tour of the song screen (data/tours.ts), or by its briefing if it
 * has no tour yet.
 */
export function playContract(scene, contract) {
    const tier = tierOf(getProgress());
    const data = { ...tier.options, program: contract.program, contract };
    const { seenLessons } = getProgress();
    if (!seenLessons.includes(tier.lessonId) && SONG_TOURS[tier.lessonId]) {
        // The guide shows the song screen around, then practice.
        scene.scene.start(tier.scene, { ...data, practice: true, tour: tier.lessonId });
    }
    else if (!seenLessons.includes(tier.lessonId)) {
        scene.scene.start('briefing', { lessonId: tier.lessonId, mandatory: true, then: { scene: tier.scene, data: { ...data, practice: true } } });
    }
    else if (pastMemoryWall(getProgress()) && !seenLessons.includes('memwall')) {
        // The clock outran RAM without a clock purchase (buying the pipeline can do it): explain the wall first.
        scene.scene.start('briefing', { lessonId: 'memwall', mandatory: true, then: { scene: tier.scene, data } });
    }
    else {
        scene.scene.start(tier.scene, data);
    }
}
/**
 * Right after buying something with a briefing: the briefing (no skipping),
 * then a practice of the new part (CPU parts and the cache) or back to the shop.
 * The cache's briefing builds on the memory wall's, so that one comes first if it's unread.
 */
export function briefAfterPurchase(scene, lessonId) {
    const tier = tierOf(getProgress());
    const practices = lessonId === tier.lessonId || lessonId === 'cache';
    const then = practices
        ? { scene: tier.scene, data: { ...tier.options, practice: true, returnTo: 'board' } }
        : { scene: 'shop', data: {} };
    if (lessonId === 'cache' && !getProgress().seenLessons.includes('memwall')) {
        scene.scene.start('briefing', { lessonId: 'memwall', mandatory: true, then: { scene: 'briefing', data: { lessonId, mandatory: true, then } } });
        return;
    }
    if (practices && SONG_TOURS[lessonId]) {
        scene.scene.start(then.scene, { ...then.data, tour: lessonId });
        return;
    }
    scene.scene.start('briefing', { lessonId, mandatory: true, then });
}
/** Opens a lesson (the developer screen): its tour and practice, or its briefing if it has no tour yet. */
export function openLesson(scene, lessonId) {
    const lesson = LESSONS[lessonId];
    if (lesson && SONG_TOURS[lessonId])
        scene.scene.start(lesson.scene, { practice: true, ...lesson.options, tour: lessonId });
    else
        scene.scene.start('briefing', { lessonId });
}
//# sourceMappingURL=flow.js.map