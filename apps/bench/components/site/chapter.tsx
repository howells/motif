import type { ReactNode } from "react";

/** A chapter opening: the title at display size with its standfirst set
 * against it. The two sit on one baseline at desktop and stack on a phone,
 * which is the only difference between the two layouts. */
export function ChapterHead({
  body,
  id,
  title,
}: {
  readonly body: string;
  readonly id?: string;
  readonly title: string;
}) {
  return (
    <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end md:gap-16">
      <h2 className="type-display" id={id}>
        {title}
      </h2>
      <p
        className="type-body max-w-[38ch] md:mb-2.5 md:shrink-0"
        style={{ color: "var(--muted)" }}
      >
        {body}
      </p>
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
      className="site-command type-mono block whitespace-pre-wrap"
      style={{ color: "var(--ink)" }}
    >
      {children}
    </code>
  );
}
