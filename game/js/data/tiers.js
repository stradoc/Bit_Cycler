export const TIERS = [
    { number: 1, name: 'SINGLE-CYCLE', lessonId: 'tier1', scene: 'play' },
    { number: 2, name: 'PIPELINE', lessonId: 'tier2', scene: 'pipeline' },
    { number: 3, name: 'FORWARDING', lessonId: 'tier3', scene: 'pipeline', options: { forwarding: true } },
    { number: 4, name: 'BRANCH PREDICTION', lessonId: 'tier4', scene: 'pipeline', options: { forwarding: true, guessing: true } },
    {
        number: 5, name: '1-BIT PREDICTOR', lessonId: 'tier5', scene: 'pipeline',
        options: { forwarding: true, guessing: true, predictor: '1-bit', program: 'SUM GRID' },
    },
    {
        number: 6, name: '2-BIT PREDICTOR', lessonId: 'tier6', scene: 'pipeline',
        options: { forwarding: true, guessing: true, predictor: '2-bit', program: 'SUM GRID' },
    },
];
export function tierByNumber(number) {
    return TIERS.find((tier) => tier.number === number) ?? TIERS[0];
}
//# sourceMappingURL=tiers.js.map