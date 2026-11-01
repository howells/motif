import { Plate } from "@/components/site/plate";
import { HOME, HOME_LOOKS } from "@/lib/site/content";

/** Six Looks in a plain row that runs off the right edge. It scrolls
 * sideways, takes the arrow keys once focused, and has no counter or arrows:
 * the cut-off picture is what says there is more. */
export function HomeLooks() {
  return (
    <section aria-labelledby="home-looks" className="home-section">
      <div className="home-gutter">
        <h2 className="type-body" id="home-looks">
          {HOME.looksTitle}
        </h2>
      </div>
      <ul
        aria-labelledby="home-looks"
        className="home-strip home-looks m-0 list-none pt-4 md:pt-8"
      >
        {HOME_LOOKS.map((look, position) => (
          <li className="w-60 shrink-0 md:w-[360px]" key={look.flag}>
            <figure className="m-0 flex flex-col gap-2 md:gap-3">
              <Plate
                eager={position === 0}
                ratio="4 / 5"
                sizes="(max-width: 767px) 240px, 360px"
                source={look.plate}
              />
              <figcaption>
                <code className="type-small text-muted font-mono">
                  {look.flag}
                </code>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
