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
 * It is a *surface*, not a card: it fills its scroll frame edge to edge and
 * the frames tile against each other on a 1px gutter rather than sitting in
 * bordered boxes. The frame around it is a `ScrollFrame` owned by the run
 * pane, so this component sets no height and no overflow of its own.
 *
 * Frames are square, uniform, and start at 240px. A contact sheet is uniform
 * *small* frames — the point is scanning many at once, and full size belongs
 * in the lightbox, which is one click away.
 *
 * The track is `auto-fill` with `minmax(240px, 1fr)`. The rule this replaces
 * was "`auto-fill` with a fixed track, never `auto-fit` with `1fr`", on the
 * grounds that `1fr` stretches the columns when there are few samples and
 * turns a two-model smoke run into a slideshow. That is true of **`auto-fit`**
 * — it collapses the empty tracks, so two samples inherit the whole width. It
 * is not true of `auto-fill`, which *keeps* the empty tracks: two samples
 * still occupy two columns of four and the bed stays honestly part-empty.
 *
 * Holding the track at exactly 240px instead left a quarter of the plate — a
 * 225px column of unused near-black down the right-hand edge at 1440px — with
 * no way to read it as a margin. `1fr` spends that on the images, which are
 * the thing the plate exists to show. */
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
      <p className="bg-plate px-4 py-10 text-[13px] text-plate-muted">
        No samples yet. Frames appear here as each model is dispatched.
      </p>
    );
  }

  return (
    <div className="bg-plate p-4">
      {/* Tracks from 160px on a phone (so the sheet still lands 2-up in a
          358px column as the spec requires) and from 240px above `sm`, 1px
          gutter, packed from the start. `auto-fill` fixes the column *count*
          from the minimum; `1fr` then spends the remainder on the frames
          rather than leaving it dark at the edge. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] justify-start gap-px sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
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
