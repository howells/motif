/**
 * The Task registry: every job Motif does, with the Models that can do it
 * ranked best-first and tagged with the Tier each belongs to.
 *
 * Rankings are data so a default change is visible in a pull request. A Task
 * ranked from the bench's human comparisons says `rankedFrom: "bench"`; every
 * other Task is hand-ranked from published quality numbers and fal price, and
 * says so. Today no Task is bench-ranked: the bench holds two human ratings,
 * both on one model, which is not an order.
 *
 * Model ids are the short aliases used everywhere else: a key of `MODELS` or
 * of `FAL_TOOLS`. `resolveTask` in `./resolve` is the only place a Model is
 * chosen from these lists.
 */

import { MODELS } from "./models";

export const TIERS = ["fast", "balanced", "quality"] as const;

/** How far a Task trades cost and speed for quality. */
export type Tier = (typeof TIERS)[number];

export const DEFAULT_TIER: Tier = "balanced";

/** Where a Task's order came from. */
export type RankedFrom = "bench" | "hand";

export interface RankedModel {
  /** A key of `MODELS` or `FAL_TOOLS`. */
  readonly model: string;
  /** The Tier this Model is offered at. */
  readonly tier: Tier;
}

export interface TaskDefinition {
  /** One sentence: the job, in the words a caller would use. */
  readonly summary: string;
  /** What to use instead, naming the sibling Task. */
  readonly notFor: string;
  readonly rankedFrom: RankedFrom;
  /** ISO date the order was last set. */
  readonly rankedAt: string;
  /** How the order was decided, for the reviewer of the next change. */
  readonly basis: string;
  /** Best first. Order within a Tier is the order tried at that Tier. */
  readonly models: readonly RankedModel[];
}

const GENERATION_RANKED_AT = "2026-09-16";
const GENERATION_BASIS =
  "Hand-ranked. Tiers set by fal price per image (quality ≥ $0.07, balanced $0.02-$0.15 with edit quality, fast ≤ $0.04); order within a tier by Artificial Analysis text-to-image Elo, snapshot 2026-08-23, unranked models last. banana leads balanced because it is the house default the looks are tuned on.";

const GENERATION_MODELS_RANKED: readonly RankedModel[] = [
  { model: "gpt2", tier: "quality" },
  { model: "banana2", tier: "quality" },
  { model: "gpt", tier: "quality" },
  { model: "sunburst", tier: "quality" },
  { model: "gemini3", tier: "quality" },
  { model: "seedream5", tier: "quality" },
  { model: "flux2-max", tier: "quality" },
  { model: "banana", tier: "balanced" },
  { model: "flare", tier: "balanced" },
  { model: "qwen3", tier: "balanced" },
  { model: "seedream4", tier: "balanced" },
  { model: "flux2-flex", tier: "balanced" },
  { model: "ideogram4", tier: "balanced" },
  { model: "grok-image", tier: "balanced" },
  { model: "recraft4", tier: "balanced" },
  { model: "flux2-pro", tier: "balanced" },
  { model: "seedream45", tier: "balanced" },
  { model: "flux2-turbo", tier: "fast" },
  { model: "flux2-dev", tier: "fast" },
  { model: "flux-fast", tier: "fast" },
  { model: "seedream5-lite", tier: "fast" },
  { model: "gemini", tier: "fast" },
  { model: "qwen", tier: "fast" },
  { model: "ideogram", tier: "fast" },
  { model: "recraft", tier: "fast" },
  { model: "flux", tier: "fast" },
];

/**
 * Every Task with a Model today. MOT-50 places the remaining fal tools; the
 * new-Task issues (relight, restyle, mesh, try-on) add their own entries. A
 * Task is absent here until it has at least one Model.
 */
export const TASKS = {
  cutout: {
    basis:
      "Hand-ranked from fal price and output quality on product photos; the video Model is the one video background remover fal offers.",
    models: [
      { model: "bria-rmbg", tier: "quality" },
      { model: "birefnet", tier: "balanced" },
      { model: "rembg", tier: "fast" },
      { model: "bria-video-rmbg", tier: "balanced" },
    ],
    notFor:
      "Taking one object out and filling the gap (erase), or masking a named thing (segment).",
    rankedAt: "2026-09-16",
    rankedFrom: "hand",
    summary:
      "Remove the background behind the main subject of an image or video.",
  },
  generate: {
    basis: GENERATION_BASIS,
    models: GENERATION_MODELS_RANKED,
    notFor:
      "Variations of an image you already have (vary), or a consistent set of images (series run).",
    rankedAt: GENERATION_RANKED_AT,
    rankedFrom: "hand",
    summary:
      "Make an image from a prompt, or change an image you pass as a reference.",
  },
  upscale: {
    basis:
      "Hand-ranked. Topaz for fidelity at the quality tier, Clarity as the balanced default it already was, Crystal as the fast pick; SeedVR upscales video.",
    models: [
      { model: "topaz-image", tier: "quality" },
      { model: "clarity", tier: "balanced" },
      { model: "crystal", tier: "fast" },
      { model: "seedvr-upscale", tier: "balanced" },
      { model: "topaz-video", tier: "balanced" },
    ],
    notFor:
      "Fixing noise, softness or colour without changing the size (restore).",
    rankedAt: "2026-09-16",
    rankedFrom: "hand",
    summary: "Make an image or video larger without losing detail.",
  },
  vary: {
    basis: GENERATION_BASIS,
    models: GENERATION_MODELS_RANKED.filter(
      ({ model }) => MODELS[model]?.supportsEdit === true
    ),
    notFor:
      "A specific change to an image described in words (generate with a reference), or a set of different scenes in one style (series run).",
    rankedAt: GENERATION_RANKED_AT,
    rankedFrom: "hand",
    summary: "Make variations of an image you already have.",
  },
} as const satisfies Record<string, TaskDefinition>;

/** A Task that has at least one Model. */
export type TaskId = keyof typeof TASKS;

export const TASK_IDS: readonly TaskId[] = Object.keys(TASKS).filter(isTaskId);

export function isTaskId(value: string): value is TaskId {
  return Object.hasOwn(TASKS, value);
}
