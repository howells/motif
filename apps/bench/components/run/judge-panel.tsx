"use client";

import { useState } from "react";

import { useSetManualRating } from "@/lib/queries";
import type { ManualRatingRecord } from "@/lib/runs/types";

import { StarRating } from "./star-rating";

interface JudgePanelProps {
  readonly manualRating: ManualRatingRecord | undefined;
  readonly runId: string;
  readonly sampleId: string;
}

/** The quality control for one frame: a 1–5 star row, and nothing else.
 *
 * This used to also print the auto-judge's verdict — `#6 of 18 · 0.88`, or a
 * level word, or `inconclusive`, or `not judged`. The auto-judge was retired
 * (2026-08-05) and quality is manual stars now, but historical runs still
 * carry judgment rows, so that display kept rendering: a removed feature
 * leaking back into the UI under all twenty-four frames of every old run, and
 * a Bradley-Terry strength score is not a number anyone can act on.
 *
 * The rows are still in the store and still reachable — nothing here deletes
 * data. They simply have no UI, because the feature that produced them has
 * none. The unrated state is the empty, interactive star row, which says
 * "rate this" by being exactly that. */
export const JudgePanel = ({
  manualRating,
  runId,
  sampleId,
}: JudgePanelProps) => {
  const setRating = useSetManualRating(runId);
  const [pendingStars, setPendingStars] = useState<number | null>(null);

  const rate = (stars: number) => {
    setPendingStars(stars);
    setRating.mutate(
      { sampleId, stars },
      {
        onSettled: () => {
          setPendingStars(null);
        },
      }
    );
  };

  return (
    <span className="flex items-center gap-2">
      <StarRating
        disabled={setRating.isPending}
        onRate={rate}
        value={pendingStars ?? manualRating?.stars ?? null}
      />
    </span>
  );
};
