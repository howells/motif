import { CommandLine } from "@/components/site/command-line";
import { Picture } from "@/components/site/demo";
import { LOOK_ENTRIES } from "@/lib/site/content";
import type { Asset, LookEntry } from "@/lib/site/content";

import styles from "@/components/site/site.module.css";

/** Placement on the spread, by position rather than by look, so a sixth image
 * falls back to a plain full-width slot. Six columns below `lg`, twelve from
 * `lg` up. */
const SLOTS = [
  "col-span-6 lg:col-span-7",
  "col-span-5 col-start-2 lg:col-span-4 lg:col-start-9 lg:self-end",
  "col-span-6 lg:col-span-6 lg:col-start-2",
  "col-span-5 lg:col-span-4 lg:col-start-9 lg:mt-40",
  "col-span-6 lg:col-span-6 lg:col-start-4",
];

function LookFlag({ id }: { readonly id: string }) {
  return (
    <code className="font-mono text-[13px] whitespace-nowrap text-(--site-muted)">
      --look {id}
    </code>
  );
}

function LookFigure({
  image,
  look,
  slot,
}: {
  readonly image: Asset;
  readonly look: LookEntry;
  readonly slot: string;
}) {
  return (
    <figure className={`m-0 flex flex-col gap-3 ${slot}`}>
      <Picture asset={image} />
      <figcaption className="flex flex-col gap-2">
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span
            className={`${styles.display} text-[1.5rem] leading-tight lg:text-[1.75rem]`}
          >
            {look.name}
          </span>
          <LookFlag id={look.id} />
        </span>
        {look.prompt === undefined ? null : (
          <span className="max-w-[36rem] text-[15px] leading-[1.55]">
            {look.prompt}
          </span>
        )}
        {look.command === undefined ? null : (
          <CommandLine quiet>{look.command}</CommandLine>
        )}
      </figcaption>
    </figure>
  );
}

export function LooksSpread() {
  const withImages = LOOK_ENTRIES.flatMap((look) =>
    look.image === undefined ? [] : [{ image: look.image, look }]
  );
  const withoutImages = LOOK_ENTRIES.filter((look) => look.image === undefined);

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
          Add one to any prompt with <LookFlag id="<id>" />. A look sets the
          medium, finish and framing, and picks its own model and aspect ratio.
        </p>
      </header>

      <div className="grid grid-cols-6 gap-x-5 gap-y-8 sm:gap-y-14 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-24">
        {withImages.map(({ image, look }, position) => (
          <LookFigure
            image={image}
            key={look.id}
            look={look}
            slot={SLOTS[position] ?? "col-span-6"}
          />
        ))}
      </div>

      {withoutImages.length === 0 ? null : (
        <div className="grid grid-cols-1 gap-4 pt-14 sm:gap-8 sm:pt-20 lg:grid-cols-12 lg:gap-12 lg:pt-32">
          <h3
            className={`${styles.display} text-[1.75rem] leading-tight sm:text-[2rem] lg:col-span-4 lg:text-[2.5rem]`}
          >
            More looks
          </h3>
          <dl className="m-0 grid grid-cols-1 gap-x-12 sm:grid-cols-2 lg:col-span-8">
            {withoutImages.map((look) => (
              <div
                className="flex flex-col gap-1 border-t border-(--site-rule) py-4 sm:py-5"
                key={look.id}
              >
                <dt className="flex flex-wrap items-baseline gap-x-3">
                  <span
                    className={`${styles.display} text-[1.375rem] leading-tight`}
                  >
                    {look.name}
                  </span>
                  <LookFlag id={look.id} />
                </dt>
                <dd className="m-0 text-[15px] leading-[1.55] text-(--site-muted)">
                  {look.description}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
