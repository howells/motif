"use client";

import { BlossomCarousel } from "@blossom-carousel/react";
import type { BlossomCarouselHandle } from "@blossom-carousel/react";
import { useRef, useState } from "react";
import type { UIEvent } from "react";

import { onTrackKeyDown, useCarousel } from "@/components/site/carousel-shared";
import { CarouselControls } from "@/components/site/catalogue-carousel";
import { ChapterHead } from "@/components/site/chapter";
import { Plate } from "@/components/site/plate";
import { MOOD_COMMAND, MOODS } from "@/lib/site/content";

type MoodId = (typeof MOODS)[number]["id"];

/** One kitchen, one prompt, one seed, six lights.
 *
 * Holding the seed is the whole demonstration: nothing in the scene moves
 * between plates, so the only thing a reader can attribute the difference to
 * is `--mood`. The six tabs drive the carousel and the carousel drives the
 * tabs back as it scrolls, so the flag and its effect are never more than a
 * glance apart — and the row carries the catalogue's own chrome underneath.
 * The command underneath updates with the choice. */
export function Moods() {
  const [id, setId] = useState<MoodId>(MOODS[4].id);
  const handle = useRef<BlossomCarouselHandle | null>(null);
  const { index, onScroll: onProgress, ratio } = useCarousel();
  const trackId = "carousel-moods";
  const total = MOODS.length;
  const mood = MOODS.find((item) => item.id === id) ?? MOODS[0];

  function onScroll(event: UIEvent<HTMLElement>) {
    onProgress(event);
    const root = event.currentTarget;
    const max = root.scrollWidth - root.clientWidth;
    const travelled = max <= 0 ? 0 : root.scrollLeft / max;
    const slide = Math.min(
      total,
      Math.max(1, Math.round(travelled * (total - 1)) + 1)
    );
    const next = MOODS[slide - 1];
    if (next !== undefined) {
      const following = next.id;
      setId((current) => (current === following ? current : following));
    }
  }

  function choose(position: number) {
    const next = MOODS[position];
    if (next === undefined) {
      return;
    }
    setId(next.id);
    const slides = handle.current?.element?.querySelectorAll(
      "[data-blossom-slide]"
    );
    const reduced = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    slides?.[position]?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "nearest",
      inline: "start",
    });
  }

  return (
    <section className="site-chapter">
      <div className="site-gutter">
        <ChapterHead
          body="One kitchen, one prompt, one seed. Only the light changes."
          id="moods"
          title="Moods"
        />

        <div
          aria-label="Moods"
          className="flex gap-8 overflow-x-auto pt-10 md:gap-10"
          role="tablist"
        >
          {MOODS.map((item, position) => (
            <button
              aria-selected={item.id === mood.id}
              className="site-tab type-body shrink-0"
              key={item.id}
              onClick={() => {
                choose(position);
              }}
              role="tab"
              type="button"
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>

      <div className="site-strip site-carousel pt-10" data-carousel="">
        <BlossomCarousel
          aria-label="The same kitchen in six lights"
          as="section"
          className="site-carousel-track"
          id={trackId}
          onKeyDown={onTrackKeyDown}
          onScroll={onScroll}
          ref={handle}
          tabIndex={0}
        >
          {MOODS.map((item, slide) => (
            <div
              aria-hidden={index === slide + 1 ? undefined : true}
              className="site-carousel-slide"
              data-blossom-slide=""
              key={item.id}
              style={{ maxWidth: "100%", width: "100%" }}
            >
              <Plate
                ratio="1312 / 560"
                sizes="(max-width: 767px) 100vw, 1048px"
                source={item.plate}
              />
            </div>
          ))}
        </BlossomCarousel>
        <CarouselControls
          id={trackId}
          index={index}
          ratio={ratio}
          total={total}
        />
      </div>

      <div className="site-gutter">
        <code
          className="site-command type-small mt-6 inline-block font-mono whitespace-pre-wrap"
          style={{ color: "var(--ink)" }}
        >
          {MOOD_COMMAND.replace("{mood}", mood.id)}
        </code>
      </div>
    </section>
  );
}
