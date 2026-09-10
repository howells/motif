import { CommandLine, OptionFlag } from "@/components/site/command-line";
import { Picture } from "@/components/site/picture";
import { LOOK_ENTRIES, MOOD_ENTRIES } from "@/lib/site/content";

import styles from "@/components/site/site.module.css";

const lookNames = (acceptsMood: boolean) =>
  LOOK_ENTRIES.filter((look) => look.acceptsMood === acceptsMood)
    .map((look) => look.name)
    .join(", ");

/** One prompt under all six moods, three to a row from `lg` up. */
export function MoodsSpread() {
  return (
    <section
      aria-labelledby="moods-heading"
      className="scroll-mt-8 pt-12 sm:pt-24 lg:pt-40"
      id="moods"
    >
      <header className="grid grid-cols-1 gap-4 border-t border-(--site-ink) pt-6 pb-8 sm:pt-8 sm:pb-12 lg:grid-cols-12 lg:gap-12 lg:pb-20">
        <h2
          className={`${styles.display} text-[2.5rem] leading-none tracking-[-0.02em] sm:text-[3rem] lg:col-span-8 lg:text-[4.5rem]`}
          id="moods-heading"
        >
          Moods
        </h2>
        <p className="max-w-[28rem] text-(--site-muted) lg:col-span-4 lg:self-end">
          Add one with <OptionFlag name="mood" value="<id>" /> to set the light.
          All six use the same prompt, look and seed. The model still draws a
          different kitchen each time, so compare the light.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 sm:gap-y-14 lg:grid-cols-3 lg:gap-x-12 lg:gap-y-20">
        {MOOD_ENTRIES.map((mood) => (
          <figure className="m-0 flex min-w-0 flex-col gap-3" key={mood.id}>
            <Picture asset={mood.image} />
            <figcaption className="flex flex-col gap-2">
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span
                  className={`${styles.display} text-[1.5rem] leading-tight`}
                >
                  {mood.name}
                </span>
                <OptionFlag name="mood" value={mood.id} />
              </span>
              <span className="text-[15px] leading-[1.55]">
                {mood.description}
              </span>
              <CommandLine quiet>{mood.command}</CommandLine>
            </figcaption>
          </figure>
        ))}
      </div>

      <dl className="m-0 mt-12 grid grid-cols-1 gap-x-12 gap-y-4 border-t border-(--site-rule) pt-6 sm:mt-16 sm:grid-cols-2 lg:mt-24 lg:grid-cols-12">
        <div className="flex flex-col gap-1 lg:col-span-6">
          <dt className="text-[14px] text-(--site-muted)">
            Looks that take a mood
          </dt>
          <dd className="m-0 text-[15px] leading-[1.55]">{lookNames(true)}</dd>
        </div>
        <div className="flex flex-col gap-1 lg:col-span-6">
          <dt className="text-[14px] text-(--site-muted)">
            Looks that refuse one
          </dt>
          <dd className="m-0 text-[15px] leading-[1.55]">{lookNames(false)}</dd>
        </div>
      </dl>
    </section>
  );
}
