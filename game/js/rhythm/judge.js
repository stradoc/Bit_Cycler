export const NORMAL_WINDOWS = { perfect: 0.045, good: 0.1, early: 0.15 };
export const RELAXED_WINDOWS = { perfect: 0.08, good: 0.18, early: 0.25 };
export function judge(offsetSeconds, windows) {
    const distance = Math.abs(offsetSeconds);
    if (distance <= windows.perfect)
        return 'PERFECT';
    if (distance <= windows.good)
        return 'GOOD';
    return 'MISS';
}
//# sourceMappingURL=judge.js.map