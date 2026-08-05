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
}: {
  readonly errorCode: SampleErrorCode | null;
}) => (
  <div className="flex h-full flex-col items-center justify-center gap-2 bg-plate px-4 py-6 text-center">
    <span className="font-mono text-[11px] tracking-[0.06em] text-bad">
      {errorCode ?? "UNKNOWN"}
    </span>
    <p className="max-w-[30ch] text-[11px] leading-[1.5] text-plate-ink">
      {errorCode
        ? ERROR_COPY[errorCode]
        : "This attempt failed for an unrecorded reason."}
    </p>
  </div>
);
