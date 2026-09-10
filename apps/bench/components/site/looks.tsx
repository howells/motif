import { CommandLine, OptionFlag } from "@/components/site/command-line";
import { Picture } from "@/components/site/picture";
import { LOOK_ENTRIES } from "@/lib/site/content";
import type { LookEntry } from "@/lib/site/content";

import styles from "@/components/site/site.module.css";

/** Placement on the spread, by position rather than by look, so a new look
 * falls back to a plain full-width slot. Six columns below `lg`, twelve from
 * `lg` up, where the looks pair off with one on its own every third row. */
const SLOTS = [
  "col-span-6 lg:col-span-7",
  "col-span-5 col-start-2 lg:col-span-4 lg:col-start-9 lg:self-end",
  "col-span-6 lg:col-span-6 lg:col-start-2",
  "col-span-5 lg:col-span-4 lg:col-start-9 lg:mt-40",
  "col-span-6 lg:col-span-6 lg:col-start-4",
  "col-span-5 col-start-2 lg:col-span-5 lg:col-start-1",
  "col-span-6 lg:col-span-4 lg:col-start-8 lg:mt-24",
  "col-span-5 lg:col-span-7 lg:col-start-3",
  "col-span-6 lg:col-span-4 lg:col-start-2",
  "col-span-5 col-start-2 lg:col-span-5 lg:col-start-7 lg:mt-32",
  "col-span-6 lg:col-span-6 lg:col-start-1",
  "col-span-5 lg:col-span-4 lg:col-start-9 lg:self-end",
];

function LookFigure({
  look,
  slot,
}: {
  readonly look: LookEntry;
  readonly slot: string;
}) {
  return (
    <figure className={`m-0 flex min-w-0 flex-col gap-3 ${slot}`}>
      <Picture asset={look.image} />
      <figcaption className="flex flex-col gap-2">
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span
            className={`${styles.display} text-[1.5rem] leading-tight lg:text-[1.75rem]`}
          >
            {look.name}
          </span>
          <OptionFlag name="look" value={look.id} />
        </span>
        <span className="max-w-[36rem] text-[15px] leading-[1.55]">
          {look.prompt}
        </span>
        <CommandLine quiet>{look.command}</CommandLine>
      </figcaption>
    </figure>
  );
}

export function LooksSpread() {
  return (
    <section aria-labelledby="looks-heading" className="scroll-mt-8" id="looks">
      <header className="grid grid-cols-1 gap-4 border-t border-(--site-ink) pt-6 pb-8 sm:pt-8 sm:pb-12 lg:grid-cols-12 lg:gap-12 lg:pb-20">
        <h2
          className={`${styles.display} text-[2.5rem] leading-none tracking-[-0.02em] sm:text-[3rem] lg:col-span-8 lg:text-[4.5rem]`}
          id="looks-heading"
        >
          Looks
        </h2>
        <p className="max-w-[28rem] text-(--site-muted) lg:col-span-4 lg:self-end">
          Add one to any prompt with <OptionFlag name="look" value="<id>" />. A
          look sets the medium, finish and framing, and picks its own model.
        </p>
      </header>

      <div className="grid grid-cols-6 gap-x-5 gap-y-8 sm:gap-y-14 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-24">
        {LOOK_ENTRIES.map((look, position) => (
          <LookFigure
            key={look.id}
            look={look}
            slot={SLOTS[position] ?? "col-span-6"}
          />
        ))}
      </div>
    </section>
  );
}
