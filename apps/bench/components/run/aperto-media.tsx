"use client";

import type { ApertoImageItem, ApertoMediaItem } from "@patternmode/aperto";
import Image from "next/image";

import type { SampleRecord } from "@/lib/runs/types";

/**
 * Aperto media construction and the single image renderer both variants share.
 *
 * Aperto has no `size` prop — it discriminates with `variant: "thumbnail" |
 * "expanded"` and hands the choice to `renderImage`. The flicker this module
 * exists to prevent is not about layout size at all: it is about the *source
 * URL*. The thumbnail and the expanded view must resolve to the byte-identical
 * resource, or the browser has nothing cached when the frame expands and has to
 * fetch again mid-transition.
 *
 * Before this, the two views deliberately disagreed: thumbnails went through
 * the Next optimizer with `sizes="(width < 40rem) 50vw, 360px"`, while the
 * lightbox set `unoptimized`. Different URLs, so every expansion was a fresh
 * network fetch — the flicker.
 *
 * Both are now `unoptimized`, which resolves the disagreement in the only
 * direction this tool permits. `docs/arc/bench/BRIEF.md` requires the full-res
 * view to bypass the optimizer because it re-encodes, and re-encoded pixels are
 * exactly what a viewer must not be shown when judging image quality. Serving
 * the optimizer's output to the thumbnails meant the contact sheet — the
 * primary comparison surface, where most looking actually happens — was showing
 * re-encoded images the whole time. Same-source is a flicker fix and a
 * correctness fix in one move.
 */

/** Frames are square and `object-cover`; the expanded view is the untouched
 * image. Both draw from the same fetched resource. */
export const renderBenchImage = ({
  item,
  variant,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  item: ApertoImageItem;
  variant: "expanded" | "thumbnail";
}) => (
  <Image
    {...props}
    alt={item.alt}
    className={
      variant === "thumbnail"
        ? "rounded-frame object-cover"
        : "h-auto max-h-[calc(100dvh-9rem)] w-auto max-w-full rounded-frame object-contain"
    }
    height={item.height ?? 1024}
    // Load eagerly in both variants. A lazily-loaded thumbnail that has not
    // entered the viewport has nothing decoded for the expanded view to reuse,
    // which reintroduces the flicker from the other direction.
    loading="eager"
    src={item.src}
    // The single line that removes the flicker: identical `src` resolution in
    // both variants, so expanding reuses the decoded image instead of
    // refetching. Also keeps the optimizer away from pixels under comparison.
    unoptimized
    width={item.width ?? 1024}
  />
);

/** Only completed samples carry an image; failures and in-flight frames render
 * their own states outside Aperto, so they are excluded here. An index into
 * this array is what `Aperto.Thumbnail` takes, so the mapping back to a sample
 * has to be derived from the same filter — see `apertoIndexBySampleId`. */
export const toApertoMedia = (
  samples: readonly SampleRecord[]
): ApertoMediaItem[] =>
  samples
    .filter((sample) => sample.status === "completed" && sample.imageUrl)
    .map((sample) => ({
      alt: `${sample.modelName ?? sample.modelAlias}, sample ${sample.sampleIndex}`,
      height: sample.height ?? 1024,
      id: sample.id,
      src: sample.imageUrl as string,
      title: sample.modelName ?? sample.modelAlias,
      type: "image" as const,
      width: sample.width ?? 1024,
    }));

/** Sample id → index in the media array. The grid renders every sample
 * including failures, but Aperto only knows about the completed ones, so the
 * two sequences diverge and a frame cannot use its grid position as its index. */
export const apertoIndexBySampleId = (
  samples: readonly SampleRecord[]
): Map<string, number> => {
  const map = new Map<string, number>();
  let index = 0;
  for (const sample of samples) {
    if (sample.status === "completed" && sample.imageUrl) {
      map.set(sample.id, index);
      index += 1;
    }
  }
  return map;
};
