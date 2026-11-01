/**
 * Presentation-only number formatting shared by every bench-web component.
 * No domain logic lives here — costs stay integer micros until the moment
 * they are rendered (`docs/arc/bench/BRIEF.md` rule 8).
 */

/** `null` means "unknown", never "zero" (`BRIEF.md` rule 9), so it reads as
 * "Unknown" rather than as `$0.00`. */
export const formatUsd = (micros: number | null): string => {
  if (micros === null) {
    return "Unknown";
  }
  const usd = micros / 1_000_000;
  return usd < 0.01 && usd > 0
    ? `$${usd.toFixed(4).replace(/0$/u, "")}`
    : `$${usd.toFixed(2)}`;
};

export const formatMs = (ms: number | null): string => {
  if (ms === null) {
    return "Unknown";
  }
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
};

export const formatDimensions = (
  width: number | null,
  height: number | null
): string =>
  width !== null && height !== null ? `${width} × ${height}` : "Unknown";

export const formatPercent = (ratio: number | null): string =>
  ratio === null ? "Unknown" : `${Math.round(ratio * 100)}%`;

export const formatDateTime = (iso: string | null): string => {
  if (iso === null) {
    return "Unknown";
  }
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export const formatRelativeToNow = (iso: string | null): string => {
  if (iso === null) {
    return "Unknown";
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

/** Whole seconds with a thin space before the unit (`16 s`), and milliseconds
 * below a second. The unit is the one the Bench reads everywhere. */
export const formatSeconds = (ms: number | null): string => {
  if (ms === null) {
    return "No data";
  }
  return ms >= 1000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms)} ms`;
};

const pad = (value: number): string => String(value).padStart(2, "0");

const startOfDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** When a run was made, the way a person says it: `Today, 10:24`,
 * `Yesterday, 16:08`, then `12 Oct, 10:24`. */
export const formatRunDate = (iso: string, now: Date = new Date()): string => {
  const at = new Date(iso);
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) {
    return `Today, ${time}`;
  }
  if (days === 1) {
    return `Yesterday, ${time}`;
  }
  const day = at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  return `${day}, ${time}`;
};
