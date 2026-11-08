import type { ReactNode } from "react";

import type { Span } from "@/components/home/span";
import { spanStyle } from "@/components/home/span";

/** The page grid: 12 columns from 64rem up, 4 below, with the page's margins
 * outside them. Children fill the content columns unless they are a `Cell`.
 * `row` makes it a row of pictures: an image line and a caption line, with
 * every picture ending on the image line. */
export function Grid({
  children,
  className,
  row,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly row?: boolean;
}) {
  return (
    <div
      className={`home-grid ${row === true ? "home-row" : ""} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/** A block of whole columns on the grid. `className` styles the block's
 * contents (flex, gaps); the outer box only places it. In a row it sits on
 * the image line and ends there. */
export function Cell({
  children,
  className,
  desk,
  phone,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly desk?: Span;
  readonly phone?: Span;
}) {
  return (
    <div className="home-cell" style={spanStyle(desk, phone)}>
      <div className={className}>{children}</div>
    </div>
  );
}
