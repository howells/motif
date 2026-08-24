/**
 * Rendering spend for a human.
 *
 * Per-run figures use the SDK's `formatCost`, which prints "metered" where a
 * cost is unknown. Totals need the same honesty one level up: a sum that
 * silently drops the metered runs reads as the whole bill, so it is printed
 * alongside a count of what it could not include.
 */

/**
 * A running total and the runs it could not price, e.g. `$1.23 + 4 metered`.
 * With nothing unknown it is just the figure.
 */
export function formatTotal(known: number, unknown: number): string {
  const total = `$${known.toFixed(2)}`;
  return unknown === 0 ? total : `${total} + ${unknown} metered`;
}
