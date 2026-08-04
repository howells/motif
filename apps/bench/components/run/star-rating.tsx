"use client";

const STARS = [1, 2, 3, 4, 5] as const;

const VISUALLY_HIDDEN_STYLE = {
  height: 1,
  overflow: "hidden",
  position: "absolute" as const,
  width: 1,
};

interface StarRatingProps {
  readonly disabled?: boolean;
  readonly onRate: (stars: number) => void;
  readonly value: number | null;
}

/** The manual 1–5 star override — a first-class judge state alongside
 * `not-run` / `inconclusive` / `scored` (`docs/arc/bench/BRIEF.md`, UI
 * section), not a bolt-on. A `<fieldset>`/`<legend>` pair, not a `div` with
 * `role="group"` — the semantic element accessibility tools expect, with
 * default browser chrome reset via inline style. */
export const StarRating = ({
  value,
  onRate,
  disabled = false,
}: StarRatingProps) => (
  <fieldset
    className="star-rating"
    style={{ border: "none", margin: 0, padding: 0 }}
  >
    <legend style={VISUALLY_HIDDEN_STYLE}>Manual rating</legend>
    {STARS.map((star) => (
      <button
        aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
        className={value !== null && star <= value ? "filled" : ""}
        disabled={disabled}
        key={star}
        onClick={() => {
          onRate(star);
        }}
        type="button"
      >
        {value !== null && star <= value ? "★" : "☆"}
      </button>
    ))}
  </fieldset>
);
