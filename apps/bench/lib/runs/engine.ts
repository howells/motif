/**
 * The seam `repository.ts` selects at the composition root, independently of
 * store selection (`db-store.ts`'s header). `mock-engine.ts`'s
 * `mockRunEngine` and `live-engine.ts`'s `createLiveEngine()` are the two
 * implementations; `db-store.ts` (the only store that can run either one —
 * `mock-store.ts` stays hardcoded mock, see its own header) calls
 * `engine.buildAttempt`/`engine.buildJudgment` instead of reaching into
 * either engine module directly, and persists `engine.isMock` verbatim on
 * the run row.
 *
 * This is the fix for the bug this phase exists to close: `isMock` used to
 * be a literal (`false` in `db-store.ts`, hardcoded independent of what
 * actually generated the samples). Routing every store write through
 * `engine.isMock` makes it structurally impossible for a store to persist a
 * value that disagrees with which engine actually ran — there is no second
 * place left to (re)hardcode it wrong.
 *
 * Pure types only, zero I/O — safe to import from anywhere, including a
 * zero-env `next build`.
 */
import type { AlignmentOk } from "@motif/bench-core";
import type { QualityLevel, RoomJudgeLevels } from "@motif/bench-core/judge";
import type {
  PairCriterionWinners,
  PairStrength,
  PairWinner,
} from "@motif/bench-core/rank-judge";

import type { JudgeErrorCodeValue, SampleErrorCode } from "./types";

export interface EngineAttemptInput {
  readonly alignment: AlignmentOk;
  /** Reserved-phase cost estimate for this one attempt — the live engine has
   * no better number to report as `costRefinedMicros` (fal's response
   * carries no per-request price; see `live-engine.ts`), so it echoes this
   * back on success. */
  readonly costEstimatedMicros: number;
  readonly runId: string;
  readonly sampleIndex: number;
}

export interface EngineAttempt {
  readonly bytes: number;
  readonly contentType: string;
  readonly costRefinedMicros: number | null;
  readonly downloadMs: number | null;
  readonly droppedParams: readonly string[];
  readonly errorCode: SampleErrorCode | null;
  /** `null` for the mock engine (there is no fal request). */
  readonly falRequestId: string | null;
  readonly height: number | null;
  /** Absolute on-disk path to the downloaded image. `null` for the mock
   * engine (nothing is written to disk — `mock-image` route synthesizes an
   * SVG on every request instead) and for a failed live attempt. */
  readonly imagePath: string | null;
  readonly ok: boolean;
  readonly providerMs: number | null;
  readonly queuePolled: boolean;
  readonly seedReturned: number | null;
  readonly totalMs: number;
  readonly width: number | null;
}

export interface EngineJudgmentInput {
  /** Consumed only by the mock engine's own deterministic quality-bias hash
   * (`mock-engine.ts`'s `modelQualityBias`) — the live engine never forwards
   * this anywhere a real judge model, prompt, or span could see it. Blind
   * judging (`docs/arc/bench/BRIEF.md` rule 1 / `@motif/bench-core/judge`'s
   * own contract) is enforced by `judgeSample` itself having no field to
   * carry an alias through; this input field existing on the shared seam
   * does not weaken that. */
  readonly alias: string;
  /** `null` when the underlying sample has no image on disk (mock samples,
   * or a live sample whose generation failed) — the live engine reports
   * `IMAGE_READ_FAILED` in that case rather than calling a judge model. */
  readonly imagePath: string | null;
  readonly prompt: string;
  readonly sampleId: string;
}

export interface EngineJudgment {
  /** `bench_judgments.cost_micros` — integer micros, `null` when the judge
   * provider reports no per-call price (the mock engine always; the live
   * engine too, since `JudgeModelClient.generateJudgeText` returns only text
   * and fal's `any-llm/vision` reports no billing field — see
   * `live-engine.ts`). Distinct from `0`: unknown cost is not free cost
   * (`docs/arc/bench/BRIEF.md` rule 9). */
  readonly costMicros: number | null;
  readonly critique: string | null;
  readonly errorCode: JudgeErrorCodeValue | null;
  readonly levels: RoomJudgeLevels | null;
  readonly overall: number | null;
  readonly overallLevel: QualityLevel | null;
  readonly status: "inconclusive" | "scored";
}

export interface EnginePairJudgmentInput {
  readonly imageUrlA: string;
  readonly imageUrlB: string;
  readonly prompt: string;
}

export interface EnginePairJudgment {
  readonly criteria: PairCriterionWinners | null;
  readonly critique: string | null;
  readonly errorCode: JudgeErrorCodeValue | null;
  readonly overall: PairWinner | null;
  readonly status: "inconclusive" | "judged";
  readonly strength: PairStrength | null;
}

/**
 * The comparative-judging capability, `null` on an engine that cannot do it
 * (the mock engine writes no image to disk, so it has nothing to upload and
 * nothing for a vision model to compare — `mock-engine.ts`'s synthetic
 * verdicts stay on the absolute path). Presence of this object is what the
 * judging driver branches on; there is no separate boolean to keep in sync.
 *
 * The upload step is split out from `judgePair` deliberately: a sample takes
 * part in K comparisons, and re-uploading the same bytes K times would be K−1
 * wasted round trips. The driver calls `toJudgeableImageUrl` once per sample
 * and reuses the URL across every pair that sample appears in.
 */
export interface ComparativeJudge {
  readonly modelLabel: string;
  judgePair: (input: EnginePairJudgmentInput) => Promise<EnginePairJudgment>;
  /** Local image path → an absolute https URL the vision endpoint can fetch.
   * Never a `data:` URI (`docs/arc/bench/BRIEF.md` rule 1). */
  toJudgeableImageUrl: (imagePath: string) => Promise<string>;
}

/**
 * The composition-root injection seam. `isMock` is read-only data, not a
 * derived guess — each implementation states it once, at its own
 * definition, and every store persists that value verbatim.
 */
export interface RunEngine {
  /** `null` when this engine cannot judge comparatively — see
   * `ComparativeJudge`. */
  readonly comparativeJudge: ComparativeJudge | null;
  readonly isMock: boolean;
  /** Recorded as `bench_judgments.judge_model` when a run's own completion
   * auto-triggers judging (`db-store.ts`'s `finalizeRunIfDone`) — distinct
   * per engine so an auto-judged live run is never mislabeled with the mock
   * judge's identifier, or vice versa. The manually-triggered "Judge this
   * run" endpoint has its own separate default (`validation.ts`'s
   * `JudgeRunInputSchema`), unaffected by this field. */
  readonly judgeModelLabel: string;
  buildAttempt: (input: EngineAttemptInput) => Promise<EngineAttempt>;
  buildJudgment: (input: EngineJudgmentInput) => Promise<EngineJudgment>;
}
