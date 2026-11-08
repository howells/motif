/** The `sizes` attribute for a picture `desk` and `phone` viewport widths
 * wide, in percent: `imageSizes(92, 100)` is
 * `"(width >= 64rem) 92vw, 100vw"`. The breakpoint is the page's own, where
 * the desktop composition takes over from the phone's. */
export function imageSizes(desk: number, phone: number): string {
  return `(width >= 64rem) ${String(desk)}vw, ${String(phone)}vw`;
}
