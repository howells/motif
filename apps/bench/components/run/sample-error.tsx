"use client";

import { Button } from "@/components/ui/button";
import { useRetrySamples } from "@/lib/queries";
import type { SampleErrorCode } from "@/lib/runs/types";

/** Rendered by error code from the closed vocabulary
 * (`docs/arc/bench/BRIEF.md`, UI section) — provider text never reaches this
 * component because it never reaches the store (`BRIEF.md` rule 2). */
const ERROR_COPY: Record<SampleErrorCode, string> = {
  DOWNLOAD_FAILED:
    "The image URL returned by the provider could not be downloaded.",
  HTTP_4XX: "The provider rejected the request.",
  HTTP_5XX: "The provider failed to serve the request.",
  INTERRUPTED: "The attempt was interrupted before it finished.",
  NO_IMAGE: "The provider responded without returning an image.",
  RATE_LIMITED: "The provider rate-limited this request.",
  SAFETY: "The provider's safety filter blocked this generation.",
  TIMEOUT: "The attempt exceeded the run's timeout budget.",
};

/** A failed frame keeps the plate — it stays part of the contact sheet
 * rather than becoming a card that breaks the lattice
 * (`docs/design/specs/design-bench.md`, States: "frame fills
 * `--color-plate`, error code in mono `--color-bad`, one plain sentence").
 * The sentence is ours, keyed off the closed error vocabulary; provider
 * strings never appear. */
export const SampleError = ({
  errorCode,
  retryable,
  runId,
  sampleId,
}: {
  readonly errorCode: SampleErrorCode | null;
  /** False while the parent run is still generating — `planRetry` refuses a
   * retry on a `running` run (a pending sample is in the air, and
   * re-dispatching it would pay for the same image twice), so the frame
   * hides the control rather than offering one that is guaranteed to be
   * declined. */
  readonly retryable: boolean;
  readonly runId: string;
  readonly sampleId: string;
}) => {
  // The mutation lives here rather than in `SampleFrame` so each failed
  // frame owns its own pending state: retrying one rate-limited model does
  // not put every other failed frame into "Retrying…" at the same time.
  // Same shape `JudgePanel` already uses for its per-sample rating.
  const retry = useRetrySamples(runId);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-plate px-4 py-6 text-center">
      <span className="font-mono text-[11px] text-bad">
        {errorCode ?? "UNKNOWN"}
      </span>
      <p className="max-w-[30ch] text-[11px] leading-[1.5] text-plate-ink">
        {errorCode
          ? ERROR_COPY[errorCode]
          : "This attempt failed for an unrecorded reason."}
      </p>
      {/* The retry sits *in* the failed frame rather than only in a bar above
          the sheet, because a rate-limited model is usually spotted while
          scanning the sheet, and the frame you are looking at is the one you
          want to re-run. Never accent-filled: the shell spec allows two
          accent elements on screen and neither of them is this. */}
      {retryable ? (
        <Button
          className="mt-1 h-7 px-2.5 text-[11px]"
          disabled={retry.isPending}
          onClick={() => {
            retry.mutate([sampleId]);
          }}
          size="sm"
          variant="plate"
        >
          {retry.isPending ? "Retrying…" : "Retry"}
        </Button>
      ) : null}
      {/* A refusal from `retry.ts`'s closed set, already worded for a human
          by the API. Shown rather than swallowed: a button that returns to
          its resting label with nothing else happening is the "started: true
          while doing nothing" failure in miniature. */}
      {retry.error === null ? null : (
        <p className="max-w-[30ch] text-[11px] leading-[1.5] text-bad">
          {retry.error.message}
        </p>
      )}
    </div>
  );
};
