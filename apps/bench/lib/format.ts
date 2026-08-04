/**
 * Presentation-only number formatting shared by every bench-web component.
 * No domain logic lives here — costs stay integer micros until the moment
 * they are rendered (`docs/arc/bench/BRIEF.md` rule 8).
 */

/** `null` means "unknown", never "zero" (`BRIEF.md` rule 9) — callers decide
 * how to render that (an em dash, "pending", etc.), this only formats a
 * known value. */
export const formatUsd = (micros: number | null): string => {
  if (micros === null) {
    return "—";
  }
  const usd = micros / 1_000_000;
  return usd < 0.01 && usd > 0 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
};

export const formatMs = (ms: number | null): string => {
  if (ms === null) {
    return "—";
  }
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
};

export const formatDimensions = (
  width: number | null,
  height: number | null
): string => (width !== null && height !== null ? `${width}×${height}` : "—");

export const formatPercent = (ratio: number | null): string =>
  ratio === null ? "—" : `${Math.round(ratio * 100)}%`;

export const formatDateTime = (iso: string | null): string => {
  if (iso === null) {
    return "—";
  }
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export const formatRelativeToNow = (iso: string | null): string => {
  if (iso === null) {
    return "—";
  }
  const deltaMs = Date.now() - new Date(iso).getTime();
  const deltaSeconds = Math.round(deltaMs / 1000);
  if (deltaSeconds < 60) {
    return "just now";
  }
  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }
  return `${Math.round(deltaHours / 24)}d ago`;
};
