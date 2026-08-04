"use client";

import { useState } from "react";

import { useSetManualRating } from "@/lib/queries";
import type { JudgmentRecord, ManualRatingRecord } from "@/lib/runs/types";

import { StarRating } from "./star-rating";

interface JudgePanelProps {
  readonly judgment: JudgmentRecord | undefined;
  readonly manualRating: ManualRatingRecord | undefined;
  readonly runId: string;
  readonly sampleId: string;
  readonly showJudgingIndicator: boolean;
}

/** The four judge states, each rendered explicitly — `not-run`,
 * `inconclusive`, `scored`, and (via the "judging…" indicator) the
 * in-flight state between them. Split out of `JudgePanel` itself so the
 * state switch is a plain early-return chain instead of a nested ternary. */
const JudgeStateBadge = ({
  judgment,
  showJudgingIndicator,
}: {
  readonly judgment: JudgmentRecord | undefined;
  readonly showJudgingIndicator: boolean;
}) => {
  if (judgment === undefined) {
    return showJudgingIndicator ? (
      <span className="badge badge-warn">judging…</span>
    ) : (
      <span className="badge">not-run</span>
    );
  }

  if (judgment.status === "inconclusive") {
    return (
      <span className="badge badge-warn">
        inconclusive · {judgment.errorCode}
      </span>
    );
  }

  const hasCritique =
    judgment.critique !== null && judgment.critique.length > 0;
  return (
    <>
      <span className={`judge-level judge-level-${judgment.overallLevel}`}>
        {judgment.overallLevel} ({judgment.overall?.toFixed(2)})
      </span>
      {hasCritique ? (
        <span className="footnote">{judgment.critique}</span>
      ) : null}
    </>
  );
};

/** Judge states are first-class UI states, not afterthoughts
 * (`docs/arc/bench/BRIEF.md`, UI section): `not-run`, `inconclusive`,
 * `scored`, and manual-override (labelled "manual") — every one of the four
 * renders here, never collapsed into a single "no score" blank. A manual
 * star rating is layered on top of whatever the judge state is; it does not
 * replace the judge's own verdict. */
export const JudgePanel = ({
  judgment,
  manualRating,
  runId,
  sampleId,
  showJudgingIndicator,
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
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <JudgeStateBadge
        judgment={judgment}
        showJudgingIndicator={showJudgingIndicator}
      />

      <div style={{ alignItems: "center", display: "flex", gap: 6 }}>
        <StarRating
          disabled={setRating.isPending}
          onRate={rate}
          value={pendingStars ?? manualRating?.stars ?? null}
        />
        {manualRating ? <span className="badge">manual</span> : null}
      </div>
    </div>
  );
};
