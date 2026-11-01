"use client";

import { StarIcon } from "lucide-react";

const STARS = [1, 2, 3, 4, 5] as const;

interface StarRatingProps {
  readonly disabled?: boolean;
  readonly onRate: (stars: number) => void;
  readonly value: number | null;
}

/** The manual one to five star rating, the Bench's only measure of quality.
 * A `<fieldset>` and `<legend>`, so assistive technology reads it as one
 * group. Each star is one control tall, a touch target on a phone, with a
 * 20px mark: filled in ink up to the rating, an ink outline after it. */
export const StarRating = ({
  disabled = false,
  onRate,
  value,
}: StarRatingProps) => (
  <fieldset className="m-0 inline-flex border-0 p-0">
    <legend className="sr-only">Your rating</legend>
    {STARS.map((star) => {
      const isFilled = value !== null && star <= value;
      return (
        <button
          aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
          aria-pressed={isFilled}
          className="size-control text-ink flex shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={disabled}
          key={star}
          onClick={() => {
            onRate(star);
          }}
          type="button"
        >
          <StarIcon
            className="size-5"
            fill={isFilled ? "currentColor" : "none"}
            strokeWidth={1.5}
          />
        </button>
      );
    })}
  </fieldset>
);
