"use client";

import Image from "next/image";

import { formatDimensions, formatMs, formatUsd } from "@/lib/format";
import type {
  JudgmentRecord,
  ManualRatingRecord,
  SampleRecord,
} from "@/lib/runs/types";

import { ErrorCard } from "./error-card";
import { JudgePanel } from "./judge-panel";

interface SampleCardProps {
  readonly contended: boolean;
  readonly judgment: JudgmentRecord | undefined;
  readonly manualRating: ManualRatingRecord | undefined;
  readonly onOpen: () => void;
  readonly runId: string;
  readonly runJudgingInFlight: boolean;
  readonly sample: SampleRecord;
}

/** One model's one sample: thumbnail, provenance badges, timing/cost, and
 * its judge panel. Thumbnails use `next/image` with `sizes` (grid, not full
 * res — see `lightbox.tsx` for why full res stays `unoptimized` instead). */
export const SampleCard = ({
  sample,
  contended,
  judgment,
  manualRating,
  onOpen,
  runId,
  runJudgingInFlight,
}: SampleCardProps) => (
  <div className="sample-card">
    <div className="thumb-wrap">
      {sample.status === "completed" && sample.imageUrl !== null ? (
        <button
          onClick={onOpen}
          style={{
            all: "unset",
            cursor: "zoom-in",
            display: "block",
            height: "100%",
            width: "100%",
          }}
          type="button"
        >
          <Image
            alt={`${sample.modelName ?? sample.modelAlias}, sample ${sample.sampleIndex}`}
            fill
            sizes="(min-width: 900px) 220px, 45vw"
            src={sample.imageUrl}
            style={{ objectFit: "cover" }}
          />
        </button>
      ) : sample.status === "failed" ? (
        <ErrorCard errorCode={sample.errorCode} />
      ) : (
        <div
          style={{
            alignItems: "center",
            color: "var(--text-faint)",
            display: "flex",
            fontSize: 12,
            height: "100%",
            justifyContent: "center",
          }}
        >
          generating…
        </div>
      )}
      <div className="thumb-badges">
        {contended ? <span className="badge badge-warn">contended</span> : null}
        {sample.queuePolled ? (
          <span className="badge badge-warn">queue ±3s</span>
        ) : null}
      </div>
    </div>
    <div className="body">
      <div className="model-name">{sample.modelName ?? sample.modelAlias}</div>
      <div className="stat-row">
        <span>{formatMs(sample.providerMs)}</span>
        <span>{formatDimensions(sample.width, sample.height)}</span>
        <span>
          {formatUsd(sample.costRefinedMicros ?? sample.costEstimatedMicros)}
        </span>
      </div>
      {sample.droppedParams.length > 0 ? (
        <div className="footnote">
          dropped: {sample.droppedParams.join(", ")}
        </div>
      ) : null}
      {sample.coercedParams.length > 0 ? (
        <div className="footnote">
          coerced: {sample.coercedParams.map((entry) => entry.param).join(", ")}
        </div>
      ) : null}
      {sample.status === "completed" ? (
        <JudgePanel
          judgment={judgment}
          manualRating={manualRating}
          runId={runId}
          sampleId={sample.id}
          showJudgingIndicator={runJudgingInFlight}
        />
      ) : null}
    </div>
  </div>
);
