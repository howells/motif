import { ChapterHead } from "@/components/site/chapter";
import { Plate } from "@/components/site/plate";
import { LOOKS } from "@/lib/site/content";

/** Three looks at three widths.
 *
 * Paper drew these as a strip running off the right edge, which reads as
 * "there are more of these". There are exactly three, so they are laid out to
 * fit instead: the same 840/420/400 proportions, scaled to the measure. A
 * horizontal scroller here would have promised a fourth card that does not
 * exist, and would have been unreachable by keyboard besides. */
export function Looks() {
  return (
    <section className="site-chapter site-gutter">
      <ChapterHead
        body="Add one to any prompt with --look. A look sets the medium, the finish and the framing."
        id="looks"
        title="Looks"
      />

      <div className="flex flex-col gap-10 pt-20 md:flex-row md:gap-6">
        {LOOKS.map((look) => (
          <figure
            className="m-0 flex flex-col gap-3"
            key={look.flag}
            style={{ flex: `${look.ratio.split(" / ")[0]} 1 0` }}
          >
            <Plate
              ratio={look.ratio}
              sizes="(max-width: 767px) 100vw, (max-width: 1200px) 45vw, 660px"
              source={look.plate}
            />
            <figcaption className="flex flex-col gap-1.5">
              <span className="flex flex-wrap items-baseline gap-3">
                <span className="type-title">{look.name}</span>
                <code className="type-mono" style={{ color: "var(--faint)" }}>
                  {look.flag}
                </code>
              </span>
              <span
                className="type-small max-w-[52ch]"
                style={{ color: "var(--muted)" }}
              >
                {look.body}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
