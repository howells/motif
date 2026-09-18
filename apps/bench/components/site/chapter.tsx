import type { ReactNode } from "react";

/** A chapter opening, in the catalogue's own anatomy: the name in its 264px
 * rail, the standfirst in the field beside it, and the count pushed to the
 * right edge. Every chapter on the page uses this one, so a chapter head
 * above a band and a chapter head above a carousel sit on the same lanes.
 *
 * `.site-band-chapter` carries the gutter, the air and the hairline, so a
 * caller must not wrap this in `.site-gutter`. */
export function ChapterHead({
  body,
  children,
  count,
  id,
  title,
}: {
  readonly body: string;
  /** Sits under the standfirst, for a chapter that carries a control. */
  readonly children?: ReactNode;
  readonly count?: string;
  readonly id?: string;
  readonly title: string;
}) {
  return (
    <div className="site-band-chapter">
      <h2 className="type-title site-chapter-name" id={id}>
        {title}
      </h2>
      <div className="site-chapter-standfirst">
        <p className="type-body">{body}</p>
        {children}
      </div>
      {count === undefined ? null : (
        <p className="type-small site-chapter-count">{count}</p>
      )}
    </div>
  );
}

/** The label above a demo or a column. Small, recessive, and never a heading:
 * it names the thing below it rather than dividing the document. */
export function Label({ children }: { readonly children: ReactNode }) {
  return (
    <span className="type-small" style={{ color: "var(--faint)" }}>
      {children}
    </span>
  );
}

/** Something you could type, shown as a block you could copy. */
export function Command({ children }: { readonly children: string }) {
  return (
    <code
      className="site-command type-small block font-mono whitespace-pre-wrap"
      style={{ color: "var(--ink)" }}
    >
      {children}
    </code>
  );
}
