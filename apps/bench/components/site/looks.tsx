"use client";

import { useEffect, useRef, useState } from "react";

import { ChapterHead } from "@/components/site/chapter";
import { Plate } from "@/components/site/plate";
import { LOOKS } from "@/lib/site/content";

/** How far a press of one of the strip's controls moves it: roughly a card,
 * so a press always changes what is fully in view. */
const STEP = 460;

/** Three looks, at the sizes the board draws them.
 *
 * The strip keeps its left gutter and runs off the right edge, so the third
 * card is cut and the row reads as continuing. The controls move the row
 * rather than scrolling it, which is what keeps it reachable: a scrolling
 * region has to be focusable in its own right, and the only way to do that is
 * to put a tab stop on a piece of layout. Moving it means the two buttons are
 * the whole mechanism, and they are ordinary buttons.
 *
 * Below the strip's breakpoint the cards stack at their own proportions,
 * where nothing is cut and nothing needs moving. */
export function Looks() {
  const row = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(0);

  /* The listener is built inside the effect so it has one identity for the
     life of the component: a handler rebuilt each render would re-subscribe
     on every render. */
  useEffect(() => {
    const node = row.current;
    const frame = node?.parentElement;
    const measure = () => {
      if (!node || !frame) {
        return;
      }
      setLimit(Math.max(0, node.scrollWidth - frame.clientWidth));
    };
    measure();
    globalThis.addEventListener("resize", measure);
    return () => {
      globalThis.removeEventListener("resize", measure);
    };
  }, []);

  function move(direction: 1 | -1) {
    setOffset((current) =>
      Math.min(limit, Math.max(0, current + direction * STEP))
    );
  }

  return (
    <section className="site-chapter">
      <div className="site-gutter">
        <ChapterHead
          body="Add one to any prompt with --look. A look sets the medium, the finish and the framing."
          id="looks"
          title="Looks"
        >
          <span className="hidden gap-5 pt-4 md:flex">
            <button
              aria-label="Back through the looks"
              className="site-step type-small"
              disabled={offset <= 0}
              onClick={() => {
                move(-1);
              }}
              type="button"
            >
              Back
            </button>
            <button
              aria-label="Forward through the looks"
              className="site-step type-small"
              disabled={offset >= limit}
              onClick={() => {
                move(1);
              }}
              type="button"
            >
              Forward
            </button>
          </span>
        </ChapterHead>
      </div>

      <div className="site-strip pt-20">
        <div
          className="site-strip-row flex flex-col gap-10 md:flex-row md:gap-6"
          ref={row}
          style={{ transform: `translateX(${-offset}px)` }}
        >
          {LOOKS.map((look) => (
            <figure
              className="m-0 flex shrink-0 flex-col gap-3"
              key={look.flag}
              style={{ maxWidth: "100%", width: `${look.width}px` }}
            >
              <Plate
                ratio={look.ratio}
                sizes="(max-width: 767px) 100vw, 840px"
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
                  className="type-small max-w-[560px]"
                  style={{ color: "var(--muted)" }}
                >
                  {look.body}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
