"use client";

import { StarIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const STARS = [1, 2, 3, 4, 5] as const;

interface StarRatingProps {
  readonly disabled?: boolean;
  readonly onRate: (stars: number) => void;
  readonly value: number | null;
}

/** The manual 1–5 star override — a first-class judge state alongside
 * `not-run` / `inconclusive` / `scored` (`docs/arc/bench/BRIEF.md`, UI
 * section), not a bolt-on. A `<fieldset>`/`<legend>` pair, not a `div` with
 * `role="group"` — the semantic element accessibility tools expect, with the
 * browser's default chrome reset through utilities rather than an inline
 * style.
 *
 * It lives on the plate, so it uses plate tokens: a filled star is
 * `plate-ink`, an empty one `plate-muted`. Introducing the warm amber the
 * old build used would have put a hue into the image surround, which is the
 * one thing the plate exists to prevent.
 *
 * An empty star sits at 40% of `plate-muted` and 12px rather than 14px. At
 * full strength, twenty-four unrated frames put a hundred and twenty bright
 * outlines on the plate — visual static competing with the images they are
 * meant to be judging. Dim, the unrated sheet stays quiet and a rating reads
 * from across the room, which is the whole point of the mark. */
export const StarRating = ({
  disabled = false,
  onRate,
  value,
}: StarRatingProps) => (
  <fieldset className="m-0 inline-flex gap-0.5 border-0 p-0">
    <legend className="sr-only">Manual rating</legend>
    {STARS.map((star) => {
      const isFilled = value !== null && star <= value;
      return (
        <button
          aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
          className={cn(
            "cursor-pointer border-0 bg-transparent p-0 transition-colors duration-150 focus-visible:outline-plate-ink disabled:cursor-not-allowed disabled:opacity-45",
            isFilled
              ? "text-plate-ink"
              : "text-plate-muted/40 hover:text-plate-ink"
          )}
          disabled={disabled}
          key={star}
          onClick={() => {
            onRate(star);
          }}
          type="button"
        >
          <StarIcon
            className="size-3"
            fill={isFilled ? "currentColor" : "none"}
          />
        </button>
      );
    })}
  </fieldset>
);
