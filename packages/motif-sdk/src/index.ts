/**
 * Motif SDK: task-first image work over fal.ai.
 *
 * Callers name a task and a tier; Motif picks the model. The per-model registry
 * and the fal client stay internal.
 *
 * @example
 * ```typescript
 * import { createMotif } from "@howells/motif-sdk";
 *
 * const motif = createMotif();
 * ```
 */

export type { Result, ResultAsync } from "neverthrow";

// ─── Result Types (re-exported from neverthrow) ─────────────────
export { err, ok } from "neverthrow";
// ─── Sizing ──────────────────────────────────────────────────────
export {
  ASPECT_RATIOS,
  FORMAT_PRESETS,
  ImageSizeBoundsError,
  RESOLUTIONS,
} from "./aspects";
export {
  CREATIVE_FIELDS,
  CREATIVE_TAXONOMY,
  type CreativeDirection,
  type CreativeField,
  type CreativeOption,
  CreativeOptionError,
  type CreativeOptionErrorDetails,
  type CreativePromptResult,
  type EnrichPromptOptions,
  enrichPrompt,
  getLook,
  LOOKS,
  type LookId,
  type LookOption,
  type MoodId,
  sanitizePrompt,
  validateCreativeDirection,
} from "./creative";
export { ACCOUNT_LOCKED, isFalAccountLocked } from "./errors";
export { INVALID_OPTION } from "./task-plan-shared";
export {
  type PromptWarning,
  type PromptWarningRule,
  promptWarnings,
} from "./prompt-warnings";
export {
  getFalKeyFromEnv,
  getOpenAiKeyFromEnv,
  type MotifEnv,
  motifEnvSchema,
  parseMotifEnv,
} from "./env";
export { MotifError } from "./server";
export { formatCost, sumCosts } from "./tool-cost";
export type { OutputDimensions, ResolvedCost } from "./tool-cost";

// ─── Tasks ───────────────────────────────────────────────────────
export {
  DEFAULT_TIER,
  isTaskId,
  type RankedFrom,
  type RankedModel,
  TASK_IDS,
  TASKS,
  type TaskDefinition,
  type TaskId,
  type TaskMode,
  type Tier,
  TIERS,
} from "./tasks";
export {
  type Blocker,
  type Capability,
  type ChosenBy,
  modelProfile,
  type ModelProfile,
  NO_MODEL_AVAILABLE,
  resolveTask,
  type TaskEnvironment,
  type TaskRequest,
  type TaskResolution,
  type TaskResolved,
  type TaskUnresolved,
  tierChangesChoice,
  type Unblocker,
} from "./resolve";
export {
  createMotif,
  type FalFetch,
  type MotifClient,
  type MotifClientConfig,
  type PlanOptions,
  type TaskFile,
  type TaskFunction,
  type TaskInput,
  type TaskOutput,
  type TaskPlan,
} from "./task-client";

// ─── Types ───────────────────────────────────────────────────────
export type {
  AspectRatio,
  CustomImageSize,
  ImageSizeBounds,
  Resolution,
} from "./types";
