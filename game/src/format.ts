// Big numbers and long times in plain words, for the contract board and results.

const SCALES: readonly [number, string][] = [
  [1e15, 'QUADRILLION'],
  [1e12, 'TRILLION'],
  [1e9, 'BILLION'],
  [1e6, 'MILLION'],
  [1e3, 'THOUSAND'],
];

/** 2400000000 -> "2.4 BILLION"; small numbers as they are. */
export function formatCount(n: number): string {
  for (const [scale, word] of SCALES) {
    if (n >= scale) return `${trim(n / scale)} ${word}`;
  }
  return String(Math.round(n));
}

const DURATIONS: readonly [number, string][] = [
  [365.25 * 86400, 'YEARS'],
  [86400, 'DAYS'],
  [3600, 'HOURS'],
  [60, 'MINUTES'],
  [1, 'SECONDS'],
  [1e-3, 'MS'],
  [1e-6, 'µs'],
];

/** 1e10 seconds -> "317 YEARS"; 0.004 -> "4 MS". */
export function formatDuration(seconds: number): string {
  for (const [unit, word] of DURATIONS) {
    if (seconds >= unit) {
      const value = seconds / unit;
      // Thousands of years read better as a count: "3.2 THOUSAND YEARS".
      const amount = value >= 1000 ? formatCount(value) : trim(value);
      // "1 MINUTE", not "1 MINUTES" (MS and µs stay as they are).
      return `${amount} ${amount === '1' && word.length > 2 ? word.slice(0, -1) : word}`;
    }
  }
  return `${trim(seconds * 1e9)} ns`;
}

/** 4 -> "4 MHz", 2000 -> "2 GHz". */
export function formatMhz(mhz: number): string {
  return mhz >= 1000 ? `${trim(mhz / 1000)} GHz` : `${trim(mhz)} MHz`;
}

/** 1240 -> "$1,240". */
export function formatMoney(dollars: number): string {
  return `$${Math.round(dollars).toLocaleString('en-US')}`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** When a save was made, in local time: "OCT 30 14:02". */
export function formatSavedAt(ms: number): string {
  const date = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${MONTHS[date.getMonth()]} ${date.getDate()} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** Up to 3 significant figures, without trailing zeros: 2.40 -> "2.4", 317.2 -> "317". */
function trim(value: number): string {
  return String(Number(value.toPrecision(value >= 100 ? String(Math.round(value)).length : 2)));
}
