// Text bar charts for the results screen, in plain ASCII so every monospace font draws them.

/** A bar `width` characters wide: '#' for `value` out of `max`, '.' for the rest. */
export function bar(value: number, max: number, width: number): string {
  const filled = max <= 0 ? 0 : Math.max(value > 0 ? 1 : 0, Math.min(width, Math.round((value / max) * width)));
  return '#'.repeat(filled) + '.'.repeat(width - filled);
}

/**
 * Where a job's time lands against its deadline: '|' marks the deadline,
 * two thirds of the way along; '#' fills up to the job's time. A job far past
 * the deadline runs off the end ('>').
 */
export function deadlineBar(seconds: number, deadline: number, width: number): string {
  const mark = Math.round((width * 2) / 3);
  const filled = Math.min(width, Math.max(seconds > 0 ? 1 : 0, Math.round((seconds / deadline) * mark)));
  let out = '';
  for (let i = 0; i < width; i++) out += i === mark ? '|' : i < filled ? '#' : '.';
  return `[${out}]${seconds / deadline > 1.5 ? '>' : ''}`;
}
