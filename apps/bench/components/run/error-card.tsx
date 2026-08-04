import type { SampleErrorCode } from "@/lib/runs/types";

/** Rendered by error code from the closed vocabulary
 * (`docs/arc/bench/BRIEF.md`, UI section) — provider text never reaches this
 * component because it never reaches the store (`BRIEF.md` rule 2). */
const ERROR_COPY: Record<SampleErrorCode, string> = {
  DOWNLOAD_FAILED:
    "The image URL returned by the provider could not be downloaded.",
  HTTP_4XX: "The provider rejected the request (client error).",
  HTTP_5XX: "The provider failed to serve the request (server error).",
  INTERRUPTED: "The attempt was interrupted before it finished.",
  NO_IMAGE: "The provider responded without returning an image.",
  RATE_LIMITED: "The provider rate-limited this request.",
  SAFETY: "The provider's safety filter blocked this generation.",
  TIMEOUT: "The attempt exceeded the run's timeout budget.",
};

export const ErrorCard = ({
  errorCode,
}: {
  errorCode: SampleErrorCode | null;
}) => (
  <div style={{ padding: "10px 12px" }}>
    <span className="badge badge-bad">{errorCode ?? "UNKNOWN"}</span>
    <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-dim)" }}>
      {errorCode
        ? ERROR_COPY[errorCode]
        : "This attempt failed for an unrecorded reason."}
    </p>
  </div>
);
