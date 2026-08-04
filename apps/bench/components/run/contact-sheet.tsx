"use client";

import { useState } from "react";

import type {
  JudgmentRecord,
  ManualRatingRecord,
  RunSummary,
  SampleRecord,
} from "@/lib/runs/types";

import { Lightbox } from "./lightbox";
import { SampleFrame } from "./sample-frame";

/** The run's requested aspect as a Tailwind ratio class, written out as
 * literal class names so Tailwind's scanner can see them. Frames are held at
 * this ratio from `pending` through `completed`, so an image landing never
 * moves the sheet. */
const ASPECT_CLASS: Record<string, string> = {
  "1:1": "aspect-square",
  "2:3": "aspect-[2/3]",
  "3:2": "aspect-[3/2]",
  "3:4": "aspect-[3/4]",
  "4:3": "aspect-[4/3]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-[16/9]",
};

interface ContactSheetProps {
  readonly judgments: readonly JudgmentRecord[];
  readonly manualRatings: readonly ManualRatingRecord[];
  readonly run: RunSummary;
  readonly samples: readonly SampleRecord[];
}

/** The one dark surface in the app, and the one deliberate departure from
 * the house theme (`docs/design/specs/design-bench.md`): image quality
 * cannot be judged against warm white, because a bright, slightly-yellow
 * surround shifts both perceived contrast and colour temperature — exactly
 * the judgement this page asks for. The plate is near-achromatic for the
 * same reason: any hue in the surround biases the comparison.
 *
 * It is a *surface*, not a card. It bleeds to the shell's edge (`-mx-4`
 * cancels the page gutter) and the frames tile against each other on
 * hairline `plate-edge` rules rather than sitting in bordered boxes. */
export const ContactSheet = ({
  judgments,
  manualRatings,
  run,
  samples,
}: ContactSheetProps) => {
  const [openSampleId, setOpenSampleId] = useState<string | null>(null);
  const judgmentBySample = new Map(
    judgments.map((entry) => [entry.sampleId, entry])
  );
  const ratingBySample = new Map(
    manualRatings.map((entry) => [entry.sampleId, entry])
  );
  const openSample =
    samples.find((sample) => sample.id === openSampleId) ?? null;
  const aspectClassName = ASPECT_CLASS[run.aspect] ?? "aspect-square";
  // The dropped/coerced lines are per-model, so one frame carries them and its
  // neighbour does not — which staggers the annotation blocks and pulls the
  // lattice out of alignment. Decided once for the whole sheet: if any sample
  // has them, every annotation reserves the line.
  const anyDrops = samples.some((sample) => sample.droppedParams.length > 0);
  const anyCoerces = samples.some((sample) => sample.coercedParams.length > 0);

  if (samples.length === 0) {
    return (
      <p className="-mx-4 bg-plate px-4 py-10 text-center text-[13px] text-plate-muted sm:-mx-6 sm:px-6">
        No samples yet. Frames appear here as each model is dispatched.
      </p>
    );
  }

  return (
    <div className="-mx-4 bg-plate sm:-mx-6">
      {/* `auto-fit`, not a fixed column count. A fixed grid leaves the plate
          half-empty on a two-model smoke run — a large dead dark region that
          reads as broken rather than as a surface. With `auto-fit` the tracks
          collapse to the number of samples and the frames grow to fill the
          row, so there is no empty plate at any count, and the fewer models
          you ran the larger you get to look at each one. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        {samples.map((sample) => (
          <SampleFrame
            aspectClassName={aspectClassName}
            contended={run.concurrency > 1}
            judgment={judgmentBySample.get(sample.id)}
            key={sample.id}
            manualRating={ratingBySample.get(sample.id)}
            onOpen={() => {
              setOpenSampleId(sample.id);
            }}
            reserveCoercesLine={anyCoerces}
            reserveDropsLine={anyDrops}
            runId={run.id}
            runJudgingInFlight={run.judgingStatus === "running"}
            sample={sample}
          />
        ))}
      </div>
      <Lightbox
        onClose={() => {
          setOpenSampleId(null);
        }}
        sample={openSample}
      />
    </div>
  );
};
