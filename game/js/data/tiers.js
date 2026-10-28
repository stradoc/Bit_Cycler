// The CPU tiers playable so far. The shop will unlock these; for now the
// title screen switches between them with T.
export const TIERS = [
    { number: 1, name: 'SINGLE-CYCLE', lessonId: 'tier1', scene: 'play' },
    { number: 2, name: 'PIPELINE', lessonId: 'tier2', scene: 'pipeline' },
];
export function tierByNumber(number) {
    return TIERS.find((tier) => tier.number === number) ?? TIERS[0];
}
//# sourceMappingURL=tiers.js.map