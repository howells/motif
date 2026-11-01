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

/** The rating for one image: a one to five star row and nothing else. Quality
 * in the Bench is the mean of these ratings. The automatic judge is out of the
 * product, and its stored judgments have no screen. An unrated image is an
 * empty, tappable row. The star the person chose shows at once and the server's
 * answer replaces it when it lands. */
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
    <StarRating
      disabled={setRating.isPending}
      onRate={rate}
      value={pendingStars ?? manualRating?.stars ?? null}
    />
  );
};
