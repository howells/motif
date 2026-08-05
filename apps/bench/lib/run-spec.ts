/**
 * The composer's draft state — everything the top bar and the models popover
 * edit between runs, plus the pure helpers that turn it into a
 * `RunSpecInput`.
 *
 * Presentation-layer only: no run creation, no persistence, no engine
 * selection. `lib/runs/*` still owns all of that.
 */
import { BENCH_ROUTES } from "@motif/bench-core";

import type { BenchAspect } from "@/lib/aspect";
import type { RunSpecInput } from "@/lib/runs/types";

export const DEFAULT_MAX_COST_USD = 2;

/** How many models a first run selects. The shell spec
 * (`docs/design/specs/design-bench-shell.md`) fixes this at the five
 * cheapest so pressing Run is a decision the user does not have to make
 * before they have seen the tool work once. */
export const DEFAULT_MODEL_COUNT = 5;

export const DEFAULT_PROMPT =
  "A well-lit modern living room with a gray sofa, a wooden coffee table, and large windows showing a garden.";

/** The `DEFAULT_MODEL_COUNT` cheapest aliases, by worst-case cost per image
 * — the same number the dry run prices, so the summary line and this
 * selection can never disagree about which models are "cheapest". */
export const cheapestModelAliases = (count: number): string[] =>
  [...BENCH_ROUTES]
    .sort(
      (left, right) =>
        left.pricing.estimatedCostUsd - right.pricing.estimatedCostUsd
    )
    .slice(0, count)
    .map((route) => route.alias);

/** The editable half of a run. Kept separate from `RunSpecInput` because the
 * seed is two pieces of state in the UI (a toggle and a value) and one
 * nullable field on the wire. */
export interface RunDraft {
  readonly aspect: BenchAspect;
  readonly concurrency: number;
  readonly maxEstimatedCostUsd: number;
  readonly models: ReadonlySet<string>;
  readonly outputFormat: RunSpecInput["outputFormat"];
  readonly prompt: string;
  readonly resolution: RunSpecInput["resolution"];
  readonly samplesPerModel: number;
  readonly seed: number;
  readonly seedEnabled: boolean;
}

/** One `onPatch({ aspect: "3:2" })` instead of nine `onXChange` props. The
 * draft has nine fields and every one of them is edited from the same
 * popover; nine setters threaded through two components was the shape that
 * made the old composer hard to read. */
export type RunDraftPatch = Partial<RunDraft>;

export const initialRunDraft = (): RunDraft => ({
  aspect: "1:1",
  concurrency: 1,
  maxEstimatedCostUsd: DEFAULT_MAX_COST_USD,
  models: new Set(cheapestModelAliases(DEFAULT_MODEL_COUNT)),
  // null = each model's own default. Standardising on one format is opt-in:
  // making it the default would silently change what every past run meant.
  outputFormat: null,
  prompt: DEFAULT_PROMPT,
  resolution: "1K",
  samplesPerModel: 1,
  seed: 42,
  seedEnabled: false,
});

export const specFromDraft = (draft: RunDraft): RunSpecInput => ({
  aspect: draft.aspect,
  concurrency: draft.concurrency,
  // The auto-judge was removed from the product path (2026-08-05); quality
  // comes from manual star ratings. Nothing in the UI can set this true.
  judgeAfter: false,
  maxEstimatedCostUsd: draft.maxEstimatedCostUsd,
  models: [...draft.models].toSorted(),
  outputFormat: draft.outputFormat,
  prompt: draft.prompt.trim(),
  resolution: draft.resolution,
  samplesPerModel: draft.samplesPerModel,
  seed: draft.seedEnabled ? draft.seed : null,
});

export const toggleModel = (
  models: ReadonlySet<string>,
  alias: string
): Set<string> => {
  const next = new Set(models);
  if (next.has(alias)) {
    next.delete(alias);
  } else {
    next.add(alias);
  }
  return next;
};
