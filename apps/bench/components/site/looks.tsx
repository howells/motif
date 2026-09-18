"use client";

import { BlossomCarousel } from "@blossom-carousel/react";

import { onTrackKeyDown, useCarousel } from "@/components/site/carousel-shared";
import { CarouselControls } from "@/components/site/catalogue-carousel";
import { ChapterHead } from "@/components/site/chapter";
import { Plate } from "@/components/site/plate";
import { LOOKS } from "@/lib/site/content";

/** Three looks, at the sizes the board draws them.
 *
 * The strip keeps its left gutter and runs off the right edge, so the third
 * card is cut and the row reads as continuing. Blossom drives the row and the
 * catalogue's own chrome sits under it — the progress rule, the mono counter
 * and the two arrows — so this reads as the same system as every catalogue
 * carousel rather than new furniture. Nothing advances on its own; the arrows
 * move back and forward, and the track takes arrow keys. */
export function Looks() {
  const { index, onScroll, ratio } = useCarousel();
  const id = "carousel-looks";
  const total = LOOKS.length;

  return (
    <section className="site-chapter">
      <div className="site-gutter">
        <ChapterHead
          body="Add one to any prompt with --look. A look sets the medium, the finish and the framing."
          id="looks"
          title="Looks"
        />
      </div>

      <div className="site-strip site-carousel pt-20" data-carousel="">
        <BlossomCarousel
          aria-label="Looks"
          as="section"
          className="site-carousel-track"
          id={id}
          onKeyDown={onTrackKeyDown}
          onScroll={onScroll}
          tabIndex={0}
        >
          {LOOKS.map((look, slide) => (
            <div
              aria-hidden={index === slide + 1 ? undefined : true}
              className="site-carousel-slide"
              data-blossom-slide=""
              key={look.flag}
              style={{ maxWidth: "100%", width: `${look.width}px` }}
            >
              <figure
                className="m-0 flex shrink-0 flex-col gap-3"
                style={{ maxWidth: "100%", width: `${look.width}px` }}
              >
                <Plate
                  eager={slide === 0}
                  ratio={look.ratio}
                  sizes="(max-width: 767px) 100vw, 840px"
                  source={look.plate}
                />
                <figcaption className="flex flex-col gap-1.5">
                  <code
                    className="type-small font-mono"
                    style={{ color: "var(--faint)" }}
                  >
                    {look.flag}
                  </code>
                  <span
                    className="type-small max-w-[560px]"
                    style={{ color: "var(--muted)" }}
                  >
                    {look.body}
                  </span>
                </figcaption>
              </figure>
            </div>
          ))}
        </BlossomCarousel>
        <CarouselControls id={id} index={index} ratio={ratio} total={total} />
      </div>
    </section>
  );
}
