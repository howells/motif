import { Appendix } from "@/components/site/appendix";
import { Chapter, chapterNumber } from "@/components/site/chapter";
import { CommandLine } from "@/components/site/command-line";
import { newsreader } from "@/components/site/fonts";
import { LooksSpread } from "@/components/site/looks";
import { CAPABILITIES, CAPABILITY_GROUPS, SITE } from "@/lib/site/content";

import styles from "@/components/site/site.module.css";

/** The public page, set like a printed specimen: warm paper, a large serif
 * title, the looks as the opening spread, then every capability as a
 * numbered chapter. */

const PARTS = (() => {
  let next = 0;
  return CAPABILITY_GROUPS.flatMap((group) => {
    const chapters = CAPABILITIES.filter(
      (capability) => capability.group === group.id
    ).map((capability) => {
      const chapter = { capability, index: next };
      next += 1;
      return chapter;
    });
    return chapters.length === 0 ? [] : [{ chapters, group }];
  });
})();

const CHAPTER_COUNT = PARTS.reduce(
  (sum, part) => sum + part.chapters.length,
  0
);

const chapterRange = (first: number, last: number) =>
  first === last
    ? `Chapter ${chapterNumber(first)}`
    : `Chapters ${chapterNumber(first)} to ${chapterNumber(last)}`;

const CONTENTS = [
  { href: "#looks", number: "", title: "Looks" },
  ...PARTS.map((part) => ({
    href: `#${part.group.id}`,
    number: chapterNumber(part.chapters[0]?.index ?? 0),
    title: part.group.title,
  })),
  {
    href: "#agents",
    number: chapterNumber(CHAPTER_COUNT),
    title: "For agents",
  },
];

export function MotifSite() {
  return (
    <main
      className={`${newsreader.variable} ${styles.root} min-h-dvh overflow-x-clip`}
    >
      <div className="mx-auto max-w-[88rem] px-5 sm:px-10 lg:px-16">
        <header className="grid grid-cols-1 gap-10 pt-10 pb-10 sm:gap-12 sm:pt-14 sm:pb-16 lg:grid-cols-12 lg:pt-28 lg:pb-28">
          <div className="flex flex-col gap-5 sm:gap-6 lg:col-span-8">
            <h1
              className={`${styles.display} text-[3rem] leading-[0.95] tracking-[-0.025em] lg:text-[6rem]`}
            >
              {SITE.name}
            </h1>
            <p className="max-w-[32rem] text-[1.1875rem] leading-[1.5] lg:text-[1.375rem]">
              {SITE.summary}
            </p>
            <div className="flex flex-col gap-1 pt-1 sm:pt-2">
              <span className="text-[14px] text-(--site-muted)">Install</span>
              <CommandLine>{SITE.install}</CommandLine>
            </div>
          </div>

          <nav aria-label="Contents" className="lg:col-span-4 lg:self-end">
            <ol className="m-0 list-none border-t border-(--site-rule) p-0">
              {CONTENTS.map((entry) => (
                <li className="border-b border-(--site-rule)" key={entry.href}>
                  <a
                    className="flex min-h-11 items-center justify-between gap-4 text-(--site-accent) no-underline hover:underline"
                    href={entry.href}
                  >
                    <span>{entry.title}</span>
                    <span
                      className={`${styles.display} text-[1.125rem] text-(--site-muted)`}
                    >
                      {entry.number}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </header>

        <LooksSpread />

        {PARTS.map((part) => {
          const first = part.chapters[0]?.index ?? 0;
          const last = part.chapters.at(-1)?.index ?? first;
          return (
            <section
              aria-labelledby={`${part.group.id}-heading`}
              className="scroll-mt-8 pt-12 sm:pt-24 lg:pt-40"
              id={part.group.id}
              key={part.group.id}
            >
              <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-(--site-ink) pt-6 pb-2 sm:pt-8 sm:pb-4 lg:grid lg:grid-cols-12 lg:gap-12">
                <h2
                  className={`${styles.display} text-[2.5rem] leading-none tracking-[-0.02em] sm:text-[3rem] lg:col-span-8 lg:text-[4.5rem]`}
                  id={`${part.group.id}-heading`}
                >
                  {part.group.title}
                </h2>
                <p className="text-[15px] text-(--site-muted) sm:text-[17px] lg:col-span-4 lg:self-end">
                  {chapterRange(first, last)}
                </p>
              </header>
              {part.chapters.map(({ capability, index }) => (
                <Chapter
                  capability={capability}
                  index={index}
                  key={capability.id}
                />
              ))}
            </section>
          );
        })}

        <div className="pt-12 sm:pt-24 lg:pt-40">
          <Appendix number={chapterNumber(CHAPTER_COUNT)} />
        </div>

        <footer className="flex flex-col gap-1 border-t border-(--site-rule) pt-8 pb-16 sm:pt-10 sm:pb-24">
          <span className="text-[14px] text-(--site-muted)">Install</span>
          <CommandLine>{SITE.install}</CommandLine>
        </footer>
      </div>
    </main>
  );
}
