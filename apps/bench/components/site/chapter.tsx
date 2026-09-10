import { CommandLine } from "@/components/site/command-line";
import { DemoView } from "@/components/site/demo";
import type { Capability } from "@/lib/site/content";

import styles from "@/components/site/site.module.css";

export const chapterNumber = (index: number) =>
  String(index + 1).padStart(2, "0");

/** One capability as a numbered chapter. Text and images swap sides on
 * alternate chapters from `lg` up; below that they stack, text first, with
 * the number set beside the title to save height. */
export function Chapter({
  capability,
  index,
}: {
  readonly capability: Capability;
  readonly index: number;
}) {
  const textSide = index % 2 === 1 ? "lg:order-last" : "";

  return (
    <article
      aria-labelledby={`${capability.id}-title`}
      className="grid scroll-mt-8 grid-cols-1 gap-5 border-t border-(--site-rule) py-8 sm:gap-10 sm:py-14 lg:grid-cols-12 lg:gap-12 lg:py-24"
      id={capability.id}
    >
      <div className={`flex flex-col gap-4 sm:gap-5 lg:col-span-4 ${textSide}`}>
        <div className="flex items-baseline gap-4 lg:flex-col lg:items-start lg:gap-5">
          <p
            className={`${styles.display} shrink-0 text-[2rem] leading-none text-(--site-accent) sm:text-[2.5rem] lg:text-[3.5rem]`}
          >
            {chapterNumber(index)}
          </p>
          <h3
            className={`${styles.display} text-[1.75rem] leading-[1.1] tracking-[-0.01em] sm:text-[2rem] lg:text-[2.5rem]`}
            id={`${capability.id}-title`}
          >
            {capability.title}
          </h3>
        </div>
        <p className="max-w-[34rem]">{capability.caption}</p>
        <div className="border-t border-(--site-rule) pt-4">
          <CommandLine>{capability.command}</CommandLine>
        </div>
        {capability.tool === undefined &&
        capability.relatesTo === undefined ? null : (
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-[14px]">
            {capability.tool === undefined ? null : (
              <>
                <dt className="text-(--site-muted)">fal tool</dt>
                <dd className="m-0 font-mono text-[13px]">{capability.tool}</dd>
              </>
            )}
            {capability.relatesTo === undefined ? null : (
              <>
                <dt className="text-(--site-muted)">Related command</dt>
                <dd className="m-0 font-mono text-[13px]">
                  {capability.relatesTo}
                </dd>
              </>
            )}
          </dl>
        )}
        {capability.notes === undefined ? null : (
          <p className="max-w-[34rem] text-[15px] leading-[1.6] text-(--site-muted)">
            {capability.notes}
          </p>
        )}
      </div>
      <div className="lg:col-span-8">
        <DemoView demo={capability.demo} />
      </div>
    </article>
  );
}
