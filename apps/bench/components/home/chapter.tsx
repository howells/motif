import type { ReactNode } from "react";

import { CommandLink } from "@/components/home/command";
import { Responsive } from "@/components/home/figure";
import { Cell, Grid } from "@/components/home/grid";
import type { Chapter, Entry } from "@/lib/site/home/types";

/** A chapter: the rule, its title and one-line intro, then its entries spaced
 * by the entry gap. A chapter on the mount keeps the chapter gap below its
 * last entry too, so the darker ground closes as it opens. The chapter's own
 * layout component passes each entry in as a child, built from `Grid`,
 * `Cell`, `Figure`, `Words` and `WideWords`. */
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
function Text({ children }: { readonly children: ReactNode }) {
  return <p className="home-text">{children}</p>;
}

/** An entry's headline and line. Only a row of plates goes without them, and
 * it never sets its words through `Words` or `WideWords`. */
function wordsOf(entry: Entry): { body: string; headline: string } {
  const { body, headline } = entry;
  if (body === undefined || headline === undefined) {
    throw new Error(`Entry "${entry.id}" needs a headline and a body`);
  }
  return { body, headline };
}

/** The entry's headline. */
export function EntryHeadline({ entry }: { readonly entry: Entry }) {
  return <Headline>{wordsOf(entry).headline}</Headline>;
}

/** The entry's line, with the phone's own where it has one. */
export function EntryBody({ entry }: { readonly entry: Entry }) {
  return (
    <Text>
      <Responsive desk={wordsOf(entry).body} phone={entry.phone?.body} />
    </Text>
  );
}

/** The entry's command, with the phone's shorter one where it has one. */
export function EntryCommand({ entry }: { readonly entry: Entry }) {
  const phone = entry.phone?.command;
  if (phone === undefined) {
    return <CommandLink command={entry.command} />;
  }
  return (
    <>
      <span className="hidden lg:inline">
        <CommandLink command={entry.command} />
      </span>
      <span className="lg:hidden">
        <CommandLink command={phone} />
      </span>
    </>
  );
}

/** Headline, line and command stacked in one column: beside a picture, or
 * under one. */
export function Words({ entry }: { readonly entry: Entry }) {
  return (
    <div className="flex flex-col gap-2">
      <EntryHeadline entry={entry} />
      <EntryBody entry={entry} />
      <div className="pt-2">
        <EntryCommand entry={entry} />
      </div>
    </div>
  );
}

/** Under a picture as wide as the page or nearly: the headline across six
 * columns, the line and command across the four beside it. Stacked on a
 * phone. */
export function WideWords({ entry }: { readonly entry: Entry }) {
  return (
    <Grid className="items-start gap-y-2">
      <Cell desk={{ span: 6, start: 1 }}>
        <EntryHeadline entry={entry} />
      </Cell>
      <Cell
        className="flex flex-col gap-4 lg:pt-2"
        desk={{ span: 4, start: 7 }}
      >
        <EntryBody entry={entry} />
        <div>
          <EntryCommand entry={entry} />
        </div>
      </Cell>
    </Grid>
  );
}
