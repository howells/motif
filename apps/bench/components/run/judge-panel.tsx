"use client";

import { useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
 * state switch is a plain early-return chain instead of a nested ternary.
 *
 * `not judged` is spelled out rather than shown as an em dash or a zero
 * (`docs/design/specs/design-bench.md`, States) — those read as "scored
 * badly", which is a different and wrong claim. `inconclusive` is a real
 * outcome, not an error, so it carries `--color-warn` and puts its reason in
 * a tooltip instead of shouting the code inline. */
const JudgeState = ({
  judgment,
  showJudgingIndicator,
}: {
  readonly judgment: JudgmentRecord | undefined;
  readonly showJudgingIndicator: boolean;
}) => {
  // Nothing at all when no judgment exists. The auto-judge is out of the
  // product path (2026-08-05), so a "not judged" placeholder would now print
  // on every frame of every run for ever — twenty-four repetitions of a word
  // about a feature the tool no longer has. The star row below is the
  // unrated state, and it says so by being empty and interactive.
  if (judgment === undefined) {
    return showJudgingIndicator ? (
      <span className="text-plate-muted">judging…</span>
    ) : null;
  }

  if (judgment.status === "inconclusive") {
    return (
      <Tooltip>
        <TooltipTrigger className="cursor-help text-warn underline decoration-dotted underline-offset-2">
          inconclusive
        </TooltipTrigger>
        <TooltipContent>
          The judge could not reach a verdict for this sample
          {judgment.errorCode === null ? "" : ` (${judgment.errorCode})`}. It is
          an outcome, not a failed generation — the image above is fine.
        </TooltipContent>
      </Tooltip>
    );
  }

  if (judgment.status === "not-run") {
    return <span className="text-plate-muted">not judged</span>;
  }

  const critique = judgment.critique ?? "";
  // A comparative judgment answers a different question from an absolute one
  // ("which of these is better?" rather than "is this good?"), so it reads as
  // a position in the field rather than a level word — the number beside it
  // is the Bradley-Terry strength, where 1.00 is the field's average. Falls
  // back to the absolute level word whenever no rank data exists.
  const label =
    judgment.rank === null ? (
      <span className="text-plate-muted">
        {judgment.overallLevel} {judgment.overall?.toFixed(2)}
      </span>
    ) : (
      <span className="text-plate-muted">
        #{judgment.rank} of {judgment.rankedCount} ·{" "}
        {judgment.overall?.toFixed(2)}
      </span>
    );

  return critique.length === 0 ? (
    label
  ) : (
    <Tooltip>
      <TooltipTrigger className="cursor-help">{label}</TooltipTrigger>
      <TooltipContent>{critique}</TooltipContent>
    </Tooltip>
  );
};

/** Judge states are first-class UI states, not afterthoughts
 * (`docs/arc/bench/BRIEF.md`, UI section): `not-run`, `inconclusive`,
 * `scored`, and manual-override (labelled "manual") — each still renders
 * distinctly for the historical runs that carry judgments. The judge line
 * disappears entirely when there is none, so a tool whose quality signal is
 * now the star row does not print a word about judging on every frame.
 *
 * Where it does still render, it renders in `plate-muted` rather than
 * `plate-ink`. It was the brightest thing in the caption after the alias,
 * which made a retired feature's rank the loudest number under every picture;
 * it is history, so it reads as history. */
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

  const hasJudgeLine = judgment !== undefined || showJudgingIndicator;

  return (
    <div className="flex flex-col gap-1.5">
      {hasJudgeLine ? (
        <span className="text-[11px]">
          <JudgeState
            judgment={judgment}
            showJudgingIndicator={showJudgingIndicator}
          />
        </span>
      ) : null}
      <span className="flex items-center gap-2">
        <StarRating
          disabled={setRating.isPending}
          onRate={rate}
          value={pendingStars ?? manualRating?.stars ?? null}
        />
        {manualRating ? (
          <span className="text-[11px] text-plate-muted">manual</span>
        ) : null}
      </span>
    </div>
  );
};
