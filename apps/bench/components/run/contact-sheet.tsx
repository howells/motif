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
 * It is a *surface*, not a card: it bleeds to the shell's edge (`-mx-4`
 * cancels the page gutter) and the frames tile against each other on a 1px
 * gutter rather than sitting in bordered boxes.
 *
 * Frames are a fixed 240px square and do not flex. A contact sheet is
 * uniform *small* frames — the point is scanning many at once, and full size
 * belongs in the lightbox, which is one click away. That means `auto-fill`
 * with a fixed track, never `auto-fit` with `1fr`: the latter stretches the
 * columns when there are few samples, turning a two-model smoke run into a
 * slideshow. A part-empty bed at two samples is honest, and the bed is what
 * the plate is. */
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
  // The dropped/coerced lines are per-model, so one frame carries them and its
  // neighbour does not — which staggers the annotation blocks and pulls the
  // lattice out of alignment. Decided once for the whole sheet: if any sample
  // has them, every annotation reserves the line.
  const anyDrops = samples.some((sample) => sample.droppedParams.length > 0);
  const anyCoerces = samples.some((sample) => sample.coercedParams.length > 0);

  if (samples.length === 0) {
    return (
      <p className="-mx-4 bg-plate p-4 py-10 text-center text-[13px] text-plate-muted sm:-mx-6">
        No samples yet. Frames appear here as each model is dispatched.
      </p>
    );
  }

  return (
    <div className="-mx-4 bg-plate p-4 sm:-mx-6">
      {/* Fixed 240px tracks (160px on a phone, so the sheet still lands 2-up
          in a 358px column as the spec requires), 1px gutter, packed from the
          start. `auto-fill` keeps the track width constant no matter how few
          samples there are. */}
      <div className="grid grid-cols-[repeat(auto-fill,160px)] justify-start gap-px sm:grid-cols-[repeat(auto-fill,240px)]">
        {samples.map((sample) => (
          <SampleFrame
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
