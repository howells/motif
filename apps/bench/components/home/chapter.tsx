import type { ReactNode } from "react";

import { Cell, Grid } from "@/components/home/grid";
import type { Chapter } from "@/lib/site/home/types";

/** A chapter: the rule, its title and one-line intro, then its entries spaced
 * by the entry gap. A chapter on the mount keeps the chapter gap below its
 * last entry too, so the darker ground closes as it opens. The chapter's own
 * layout component passes each entry in as a child, built from `Grid`,
 * `Cell`, `Figure` and `CommandLink`. */
export function ChapterSection({
  chapter,
  children,
}: {
  readonly chapter: Chapter;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${chapter.id}-title`}
      className={`home-chapter ${chapter.tone === "mount" ? "home-mount pb-(--home-chapter-gap)" : ""}`}
      id={chapter.id}
    >
      <Grid className="home-chapter-head">
        <Cell desk={{ span: 8, start: 1 }}>
          <h2 className="home-chapter-title" id={`${chapter.id}-title`}>
            {chapter.title}
          </h2>
        </Cell>
        <Cell desk={{ span: 4, start: 9 }}>
          <p className="home-text">{chapter.intro}</p>
        </Cell>
      </Grid>
      <div className="home-entries">{children}</div>
    </section>
  );
}

/** An entry's headline, in the display face. */
export function Headline({ children }: { readonly children: ReactNode }) {
  return <h3 className="home-headline">{children}</h3>;
}

/** Any other words on the page: Inter at 14/24. */
export function Text({ children }: { readonly children: ReactNode }) {
  return <p className="home-text">{children}</p>;
}
