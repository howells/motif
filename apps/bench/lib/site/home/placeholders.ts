import placeholders from "./placeholders.json";

/** Each homepage photograph's placeholder, twelve pixels wide, by its
 * site-relative `src`. Written by `scripts/home-placeholders.mjs`. Read on
 * the server, so the map never ships to the page. */
const PLACEHOLDERS = new Map(Object.entries(placeholders));

/** The photograph's placeholder as a CSS `url()`, or `undefined` for a
 * cut-out on a transparent ground, which gets none. */
export function placeholderOf(src: string): string | undefined {
  const found = PLACEHOLDERS.get(src);
  return found === undefined ? undefined : `url(${found})`;
}
