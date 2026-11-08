import type { CSSProperties } from "react";

/** Inline style that sets the page's own custom properties. */
export type CustomProperties = CSSProperties &
  Readonly<Record<`--${string}`, string>>;

/** Where a cell sits: whole columns from `start`, or across the screen edge
 * to edge (`"bleed"`). Columns count from 1; the desktop grid has 12 and the
 * phone grid 4. */
export type Span = { readonly span: number; readonly start: number } | "bleed";

function track(span: Span): string {
  return span === "bleed"
    ? "bleed"
    : `${String(span.start + 1)} / span ${String(span.span)}`;
}

/** The custom properties `.home-cell` reads for its columns. Omitted spans
 * fill the content width. */
export function spanStyle(desk?: Span, phone?: Span): CustomProperties {
  return {
    ...(desk === undefined ? {} : { "--desk": track(desk) }),
    ...(phone === undefined ? {} : { "--phone": track(phone) }),
  };
}
