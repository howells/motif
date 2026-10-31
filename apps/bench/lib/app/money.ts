/**
 * Money as the App shows it. Amounts are integer micros (millionths of a
 * dollar) everywhere; only these helpers turn them into text.
 */

const MICROS = 1_000_000;

/** `$12.43`, or `$0.030` below a dollar so a run's cost doesn't read as zero. */
export const formatUsd = (micros: number): string => {
  const usd = micros / MICROS;
  if (usd !== 0 && Math.abs(usd) < 1) {
    return `$${usd.toFixed(3)}`;
  }
  return `$${usd.toFixed(2)}`;
};

/** `$50` for a whole-dollar cap, otherwise two places. */
export const formatCap = (micros: number): string => {
  const usd = micros / MICROS;
  return Number.isInteger(usd) ? `$${usd}` : `$${usd.toFixed(2)}`;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `2026-10` → `October`. */
export const monthName = (month: string): string => {
  const index = Number(month.slice(5, 7)) - 1;
  return MONTHS[index] ?? month;
};

/** `2026-10` → `1 November`, the day the cap starts again. */
export const resetDay = (month: string): string => {
  const index = Number(month.slice(5, 7)) % 12;
  return `1 ${MONTHS[index] ?? ""}`.trim();
};

/** Seconds with one decimal under a minute, then minutes and seconds. */
export const formatSeconds = (ms: number): string => {
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60)} s`;
};
