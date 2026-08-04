"use client";

import { useState } from "react";

import type {
  JudgmentRecord,
  ManualRatingRecord,
  RunSummary,
  SampleRecord,
} from "@/lib/runs/types";

import { Lightbox } from "./lightbox";
import { SampleCard } from "./sample-card";

interface ImageGridProps {
  readonly judgments: readonly JudgmentRecord[];
  readonly manualRatings: readonly ManualRatingRecord[];
  readonly run: RunSummary;
  readonly samples: readonly SampleRecord[];
}

export const ImageGrid = ({
  samples,
  judgments,
  manualRatings,
  run,
}: ImageGridProps) => {
  const [openSampleId, setOpenSampleId] = useState<string | null>(null);
  const judgmentBySample = new Map(
    judgments.map((entry) => [entry.sampleId, entry])
  );
  const ratingBySample = new Map(
    manualRatings.map((entry) => [entry.sampleId, entry])
  );
  const openSample =
    samples.find((sample) => sample.id === openSampleId) ?? null;

  if (samples.length === 0) {
    return <div className="empty-state">No samples yet.</div>;
  }

  return (
    <>
      <div className="image-grid">
        {samples.map((sample) => (
          <SampleCard
            contended={run.concurrency > 1}
            judgment={judgmentBySample.get(sample.id)}
            key={sample.id}
            manualRating={ratingBySample.get(sample.id)}
            onOpen={() => {
              setOpenSampleId(sample.id);
            }}
            runId={run.id}
            runJudgingInFlight={run.judgingStatus === "running"}
            sample={sample}
          />
        ))}
      </div>
      {openSample ? (
        <Lightbox
          onClose={() => {
            setOpenSampleId(null);
          }}
          sample={openSample}
        />
      ) : null}
    </>
  );
};
