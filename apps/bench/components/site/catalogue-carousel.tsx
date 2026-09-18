"use client";

import {
  BlossomCarousel,
  BlossomNext,
  BlossomPrev,
} from "@blossom-carousel/react";
import type { UIEvent } from "react";

import {
  onTrackKeyDown,
  pad,
  useCarousel,
} from "@/components/site/carousel-shared";
import { Cover, Note } from "@/components/site/catalogue-still";
import type { Plate } from "@/lib/site/catalogue";

function SlideCaption({
  caption,
  captioned,
}: {
  readonly caption: string | undefined;
  readonly captioned?: boolean;
}) {
  if (captioned !== true) {
    return null;
  }
  if (caption === undefined) {
    return null;
  }
  return <Note>{caption}</Note>;
}

/** The scrolling row of stills: the region, its slides, keyboard arrows.
 *
 * Native scroll is the mechanism; nothing here advances on its own. The
 * region carries the tab stop axe's scrollable-region-focusable asks for,
 * and the arrows move through the same buttons a pointer would press. */
export function CarouselTrack({
  captioned,
  current,
  frames,
  id,
  onScroll,
  size = 300,
}: {
  readonly captioned?: boolean;
  readonly current?: number;
  readonly frames: readonly Plate[];
  readonly id: string;
  readonly onScroll: (event: UIEvent<HTMLElement>) => void;
  readonly size?: number;
}) {
  return (
    <BlossomCarousel
      aria-label="Slides"
      as="section"
      className="site-carousel-track"
      id={id}
      onKeyDown={onTrackKeyDown}
      onScroll={onScroll}
      tabIndex={0}
    >
      {frames.map((frame, slide) => (
        <div
          aria-hidden={
            current === undefined || current === slide + 1 ? undefined : true
          }
          className="site-carousel-slide"
          data-blossom-slide=""
          key={frame.src}
          style={{ width: size }}
        >
          <Cover picture={frame} size={size} sizes={`${String(size)}px`} />
          <SlideCaption caption={frame.caption} captioned={captioned} />
        </div>
      ))}
    </BlossomCarousel>
  );
}

/** The design's chrome under every scrolling row: the progress rule, the mono
 * counter and the two arrows. One component so Looks, Moods and the catalogue
 * rows cannot drift into separate systems. */
export function CarouselControls({
  id,
  index,
  ratio,
  total,
}: {
  readonly id: string;
  readonly index: number;
  readonly ratio: number;
  readonly total: number;
}) {
  return (
    <div className="site-carousel-controls">
      <div className="site-progress" aria-hidden>
        <div
          className="site-progress-fill"
          style={{ width: `${String(ratio * 100)}%` }}
        />
      </div>
      <p className="type-small font-mono" style={{ color: "var(--faint)" }}>
        {`${pad(index)} / ${pad(total)}`}
      </p>
      <BlossomPrev aria-label="Previous" className="site-hit" for={id}>
        <span aria-hidden>←</span>
      </BlossomPrev>
      <BlossomNext aria-label="Next" className="site-hit" for={id}>
        <span aria-hidden>→</span>
      </BlossomNext>
    </div>
  );
}

/** A bleeding row of stills, driven by Blossom.
 *
 * Native scroll is the mechanism; the progress rule, the counter and the
 * arrows are the design's chrome rather than Blossom's defaults. Nothing
 * here advances on its own. */
export function FieldCarousel({
  captioned,
  frames,
  id,
  size = 300,
}: {
  readonly captioned?: boolean;
  readonly frames: readonly Plate[];
  readonly id: string;
  readonly size?: number;
}) {
  const { index, onScroll, ratio } = useCarousel();
  const total = frames.length;

  return (
    <div className="site-carousel" data-carousel="">
      <CarouselTrack
        captioned={captioned}
        current={index}
        frames={frames}
        id={id}
        onScroll={onScroll}
        size={size}
      />
      <CarouselControls id={id} index={index} ratio={ratio} total={total} />
    </div>
  );
}

/** The source beside its takes, with the controls on their own row below.
 *
 * The controls span the full field width, so this row's progress rule starts
 * at the same left edge as every plain carousel's. The `for`/`id` wiring
 * carries the buttons across the split, and the track's arrow keys climb to
 * the shared wrapper to find them. */
export function SourceAndTakes({
  frames,
  id,
  source,
}: {
  readonly frames: readonly Plate[];
  readonly id: string;
  readonly source: Plate;
}) {
  const { index, onScroll, ratio } = useCarousel();
  const total = frames.length;

  return (
    <div className="site-takes-stack" data-carousel="">
      <div className="site-takes">
        <div className="site-takes-source">
          <Cover picture={source} size={318} sizes="318px" />
          <Note>{source.caption ?? "the source"}</Note>
        </div>
        <CarouselTrack
          current={index}
          frames={frames}
          id={id}
          onScroll={onScroll}
        />
      </div>
      <CarouselControls id={id} index={index} ratio={ratio} total={total} />
    </div>
  );
}
