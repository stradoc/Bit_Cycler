import { LESSONS } from './data/lessons.js';
import { getProgress } from './save.js';
import { pastMemoryWall, tierOf } from './sim/progress.js';
/**
 * Plays a contract on the CPU the player owns. A CPU they haven't learned yet
 * (a new game's first contract) gets TICK's tour and a practice first; the
 * memory wall, the first time the clock outruns RAM, gets its tour before the song.
 */
export function playContract(scene, contract) {
    const progress = getProgress();
    const tier = tierOf(progress);
    const data = { ...tier.options, program: contract.program, contract };
    if (!progress.seenLessons.includes(tier.lessonId)) {
        scene.scene.start(tier.scene, { ...data, practice: true, tour: [tier.lessonId] });
    }
    else if (pastMemoryWall(progress) && !progress.seenLessons.includes('memwall')) {
        // The clock outran RAM without a clock purchase (buying the pipeline can do it): TICK explains the wall, then the song.
        scene.scene.start(tier.scene, { ...data, tour: ['memwall'] });
    }
    else {
        scene.scene.start(tier.scene, data);
    }
}
/**
 * Right after buying something with a lesson: TICK's tour on the song screen,
 * then a practice of the new part (CPU parts and the cache, then the board),
 * or back to the shop (overclocking, the memory wall). The cache's lesson
 * builds on the memory wall's, so that one comes first if it's unseen.
 */
export function teachAfterPurchase(scene, lessonId) {
    const tier = tierOf(getProgress());
    const lesson = LESSONS[lessonId];
    if (!lesson) {
        scene.scene.start('shop');
        return;
    }
    const tour = lessonId === 'cache' && !getProgress().seenLessons.includes('memwall') ? ['memwall', lessonId] : [lessonId];
    if (lesson.practice) {
        scene.scene.start(tier.scene, { ...tier.options, practice: true, returnTo: 'board', tour });
    }
    else {
        scene.scene.start(tier.scene, { ...tier.options, tour, afterTour: { scene: 'shop' } });
    }
}
/**
 * Plays a lesson again (BRIEFS on the main menu, the developer screen): its
 * tour, then its practice, or back to `back` for a lesson with no practice.
 */
export function openLesson(scene, lessonId, back) {
    const lesson = LESSONS[lessonId];
    if (!lesson)
        return;
    const start = { ...lesson.options, tour: [lessonId], ...(lesson.practice ? { practice: true } : { afterTour: back }) };
    scene.scene.start(lesson.scene, start);
}
//# sourceMappingURL=flow.js.map