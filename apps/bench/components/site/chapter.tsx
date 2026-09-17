import type { ReactNode } from "react";

/** A chapter opening: the title at display size with its standfirst set
 * against it. The two sit on one baseline at desktop and stack on a phone,
 * which is the only difference between the two layouts.
 *
 * Neither column is pinned. `max-width` gives the standfirst its measure and
 * nothing stops it narrowing below that, so the longest heading on the page
 * ("Every command", whose shortest line is one 64px word) can take the room
 * it needs at 768 instead of pushing the standfirst off the screen. */
export function ChapterHead({
  body,
  children,
  id,
  title,
}: {
  readonly body: string;
  /** Sits under the standfirst, for a chapter that carries a control. */
  readonly children?: ReactNode;
  readonly id?: string;
  readonly title: string;
}) {
  return (
    <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end md:gap-16">
      <h2 className="type-title" id={id}>
        {title}
      </h2>
      <div className="flex min-w-0 flex-col md:mb-2.5">
        <p
          className="type-body max-w-[420px]"
          style={{ color: "var(--muted)" }}
        >
          {body}
        </p>
        {children}
      </div>
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
