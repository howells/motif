/**
 * Model choice: the one place a Model is chosen, for the CLI and the SDK.
 *
 * `resolveTask` is pure. It takes the Task, what the request needs, and the
 * environment (which provider keys exist, any pinned Models), and returns the
 * chosen Model or a structured `NO_MODEL_AVAILABLE`. It never reads the prompt
 * and does no I/O.
 *
 * Precedence: an explicit Model, then a Look's Model, then a pin from config,
 * then the Task's ranking. A fixed Model (any of the first three) must still be
 * able to do what the request asks, and an explicit one that cannot fails
 * rather than being swapped for something else.
 *
 * The ranking is filtered by what the request needs before the Tier is
 * applied. A Model whose provider key is missing is skipped. At the chosen
 * Tier the first qualifying Model tagged with that Tier wins; if none is
 * tagged with it, the nearest Tier is tried, so a Task with one Model accepts
 * every Tier.
 */

import { getLook } from "./creative";
import { MODELS } from "./models";
import type { RankedFrom, TaskId, Tier } from "./tasks";
import { DEFAULT_TIER, TASKS } from "./tasks";
import { FAL_TOOLS, isFalToolId } from "./tools";
import type { ModelConfig } from "./types";

/** Something a request needs that not every Model can honour. */
export type Capability =
  | "aspect"
  | "count"
  | "image"
  | "mask"
  | "negativePrompt"
  | "outputFormat"
  | "references"
  | "seed"
  | "transparency"
  | "video";

/** What the request needs. Only the fields that narrow the choice. */
export interface TaskRequest {
  /** Explicit Model id, e.g. from `--model`. Overrides everything. */
  readonly model?: string;
  /** Look id. A Look fixes the Model, so `tier` has no effect with one. */
  readonly look?: string;
  readonly tier?: Tier;
  /** Transparent output wanted. */
  readonly transparent?: boolean;
  /** Number of reference images passed in. */
  readonly references?: number;
  /** A mask image is passed in. */
  readonly mask?: boolean;
  /** An aspect ratio is asked for, e.g. `"3:2"`. */
  readonly aspect?: string;
  /** Number of outputs wanted. */
  readonly count?: number;
  readonly seed?: boolean;
  readonly negativePrompt?: boolean;
  readonly outputFormat?: boolean;
  /** The kind of Source passed in. Absent for a text-only request. */
  readonly source?: "image" | "video";
}

export interface TaskEnvironment {
  /** Names of the provider key variables that are set, e.g. `["FAL_KEY"]`. */
  readonly keys: readonly string[];
  /** Models pinned per Task in config (`tasks.<task>.model`). */
  readonly pins?: Readonly<Partial<Record<TaskId, string>>>;
}

/** Which rule fixed the Model. */
export type ChosenBy = "look" | "model" | "pin" | "ranking";

export type Blocker = Capability | "key" | "unknown-model";

export type Unblocker = "key" | "model" | "option";

export const NO_MODEL_AVAILABLE = "NO_MODEL_AVAILABLE";

export interface TaskResolved {
  readonly ok: true;
  readonly task: TaskId;
  readonly model: string;
  readonly tier: Tier;
  readonly rankedFrom: RankedFrom;
  readonly chosenBy: ChosenBy;
}

export interface TaskUnresolved {
  readonly ok: false;
  readonly error: typeof NO_MODEL_AVAILABLE;
  readonly task: TaskId;
  /** The capability, or missing key, that stopped the best candidate. */
  readonly blockedBy: Blocker;
  /** What would unblock it: name a Model, set a key, drop the option. */
  readonly unblockedBy: readonly Unblocker[];
  /** The key variable that would unblock a Model, when one would. */
  readonly missingKey?: string;
  readonly message: string;
}

export type TaskResolution = TaskResolved | TaskUnresolved;

// ─── Model profiles ────────────────────────────────────────────────────

const FAL_KEY = "FAL_KEY";

interface ModelProfile {
  readonly capabilities: ReadonlySet<Capability>;
  /** Capabilities reachable only when this key variable is set. */
  readonly keyedCapabilities: ReadonlyMap<Capability, string>;
  /** Key variables the Model needs for any request. */
  readonly keys: readonly string[];
  readonly maxReferences: number;
}

function generationProfile(config: ModelConfig): ModelProfile {
  const capabilities = new Set<Capability>(["image"]);
  const keyed = new Map<Capability, string>();
  if (config.supportsBackground === true) {
    capabilities.add("transparency");
  } else if (config.transparencyRoute !== undefined) {
    keyed.set("transparency", config.transparencyRoute.apiKeyEnv);
  }
  if (config.supportsEdit) {
    capabilities.add("references");
  }
  if (config.supportsMaskImage === true) {
    capabilities.add("mask");
  }
  if ((config.sizeMode ?? "aspect_ratio") !== "none") {
    capabilities.add("aspect");
  }
  if (config.supportsNumImages) {
    capabilities.add("count");
  }
  if (config.supportsSeed === true) {
    capabilities.add("seed");
  }
  if (config.supportsNegativePrompt === true) {
    capabilities.add("negativePrompt");
  }
  if (config.supportsOutputFormat === true) {
    capabilities.add("outputFormat");
  }
  return {
    capabilities,
    keyedCapabilities: keyed,
    keys: [FAL_KEY],
    maxReferences: config.supportsEdit ? (config.maxReferenceImages ?? 1) : 0,
  };
}

function toolProfile(inputKind: "image" | "images" | "video"): ModelProfile {
  return {
    capabilities: new Set<Capability>([
      inputKind === "video" ? "video" : "image",
    ]),
    keyedCapabilities: new Map(),
    keys: [FAL_KEY],
    maxReferences: 0,
  };
}

/** The profile for a Model id, or undefined when no registry knows it. */
export function modelProfile(model: string): ModelProfile | undefined {
  const config = MODELS[model];
  if (config !== undefined) {
    return generationProfile(config);
  }
  if (isFalToolId(model)) {
    return toolProfile(FAL_TOOLS[model].inputKind);
  }
  return undefined;
}

// ─── Requirements ──────────────────────────────────────────────────────

function requirements(request: TaskRequest): Capability[] {
  const needed: Capability[] = [];
  if (request.source !== undefined) {
    needed.push(request.source);
  }
  if (request.transparent === true) {
    needed.push("transparency");
  }
  if ((request.references ?? 0) > 0) {
    needed.push("references");
  }
  if (request.mask === true) {
    needed.push("mask");
  }
  if (request.aspect !== undefined) {
    needed.push("aspect");
  }
  if ((request.count ?? 1) > 1) {
    needed.push("count");
  }
  if (request.seed === true) {
    needed.push("seed");
  }
  if (request.negativePrompt === true) {
    needed.push("negativePrompt");
  }
  if (request.outputFormat === true) {
    needed.push("outputFormat");
  }
  return needed;
}

type Check =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly blockedBy: Capability | "key";
      readonly missingKey?: string;
    };

function check(
  profile: ModelProfile,
  needed: readonly Capability[],
  request: TaskRequest,
  keys: readonly string[]
): Check {
  for (const key of profile.keys) {
    if (!keys.includes(key)) {
      return { blockedBy: "key", missingKey: key, ok: false };
    }
  }
  for (const capability of needed) {
    if (profile.capabilities.has(capability)) {
      if (
        capability === "references" &&
        (request.references ?? 0) > profile.maxReferences
      ) {
        return { blockedBy: "references", ok: false };
      }
      continue;
    }
    const key = profile.keyedCapabilities.get(capability);
    if (key === undefined) {
      return { blockedBy: capability, ok: false };
    }
    if (!keys.includes(key)) {
      return { blockedBy: "key", missingKey: key, ok: false };
    }
  }
  return { ok: true };
}

// ─── Resolution ────────────────────────────────────────────────────────

const TIER_ORDER: Readonly<Record<Tier, readonly Tier[]>> = {
  balanced: ["balanced", "quality", "fast"],
  fast: ["fast", "balanced", "quality"],
  quality: ["quality", "balanced", "fast"],
};

function describeBlock(blockedBy: Blocker, missingKey?: string): string {
  if (blockedBy === "key") {
    return `needs ${missingKey ?? "a provider key"}`;
  }
  if (blockedBy === "unknown-model") {
    return "is not a Model for this Task";
  }
  return `cannot do ${blockedBy}`;
}

function unresolved(
  task: TaskId,
  blockedBy: Blocker,
  unblockedBy: readonly Unblocker[],
  message: string,
  missingKey?: string
): TaskUnresolved {
  const base: TaskUnresolved = {
    blockedBy,
    error: NO_MODEL_AVAILABLE,
    message,
    ok: false,
    task,
    unblockedBy,
  };
  if (missingKey === undefined) {
    return base;
  }
  return { ...base, missingKey };
}

function resolved(
  task: TaskId,
  model: string,
  tier: Tier,
  chosenBy: ChosenBy
): TaskResolved {
  return {
    chosenBy,
    model,
    ok: true,
    rankedFrom: TASKS[task].rankedFrom,
    task,
    tier,
  };
}

/**
 * Choose the Model for a Task. Pure: no I/O, and the prompt is never read.
 *
 * `request.look` must already be a valid Look id; an unknown one is treated as
 * no Look, because Look validation belongs to the creative layer.
 */
export function resolveTask(
  task: TaskId,
  request: TaskRequest,
  environment: TaskEnvironment
): TaskResolution {
  const needed = requirements(request);
  const fixed = fixedModel(task, request, environment);
  if (fixed !== undefined) {
    return resolveFixed(task, fixed, request, needed, environment.keys);
  }
  return resolveRanked(task, request, needed, environment.keys);
}

function resolveFixed(
  task: TaskId,
  fixed: { readonly chosenBy: ChosenBy; readonly model: string },
  request: TaskRequest,
  needed: readonly Capability[],
  keys: readonly string[]
): TaskResolution {
  const { chosenBy, model } = fixed;
  const tier = request.tier ?? DEFAULT_TIER;
  const ranked = TASKS[task].models.map((entry) => entry.model);
  const profile = ranked.includes(model) ? modelProfile(model) : undefined;
  if (profile === undefined) {
    return unresolved(
      task,
      "unknown-model",
      ["model"],
      `${model} ${describeBlock("unknown-model")}. ${task} accepts: ${ranked.join(", ")}.`
    );
  }
  const result = check(profile, needed, request, keys);
  if (result.ok) {
    return resolved(task, model, tier, chosenBy);
  }
  const unblockers: Unblocker[] = chosenBy === "model" ? [] : ["model"];
  unblockers.push(result.blockedBy === "key" ? "key" : "option");
  return unresolved(
    task,
    result.blockedBy,
    unblockers,
    `${model} (${chosenBy}) ${describeBlock(result.blockedBy, result.missingKey)}.`,
    result.missingKey
  );
}

function resolveRanked(
  task: TaskId,
  request: TaskRequest,
  needed: readonly Capability[],
  keys: readonly string[]
): TaskResolution {
  const tier = request.tier ?? DEFAULT_TIER;
  const qualifying = new Map<Tier, string>();
  let firstBlock: Extract<Check, { ok: false }> | undefined;
  let keyBlock: string | undefined;
  for (const { model, tier: modelTier } of TASKS[task].models) {
    const profile = modelProfile(model);
    if (profile === undefined) {
      throw new Error(`Task ${task} ranks unknown Model ${model}`);
    }
    const result = check(profile, needed, request, keys);
    if (result.ok) {
      if (!qualifying.has(modelTier)) {
        qualifying.set(modelTier, model);
      }
    } else if (result.blockedBy === "key") {
      keyBlock ??= result.missingKey;
    } else {
      firstBlock ??= result;
    }
  }

  for (const candidate of TIER_ORDER[tier]) {
    const model = qualifying.get(candidate);
    if (model !== undefined) {
      return resolved(task, model, tier, "ranking");
    }
  }

  if (firstBlock === undefined) {
    const key = keyBlock ?? FAL_KEY;
    return unresolved(
      task,
      "key",
      ["key"],
      `No Model for ${task} without ${key}.`,
      key
    );
  }
  const unblockers: Unblocker[] = ["option"];
  if (keyBlock !== undefined) {
    unblockers.push("key");
  }
  return unresolved(
    task,
    firstBlock.blockedBy,
    unblockers,
    `No Model for ${task} can do ${firstBlock.blockedBy}${keyBlock === undefined ? "" : ` without ${keyBlock}`}.`,
    keyBlock
  );
}

function fixedModel(
  task: TaskId,
  request: TaskRequest,
  environment: TaskEnvironment
): { readonly chosenBy: ChosenBy; readonly model: string } | undefined {
  if (request.model !== undefined && request.model !== "") {
    return { chosenBy: "model", model: request.model };
  }
  const look = request.look === undefined ? undefined : getLook(request.look);
  if (look !== undefined) {
    return { chosenBy: "look", model: look.model };
  }
  const pin = environment.pins?.[task];
  if (pin !== undefined && pin !== "") {
    return { chosenBy: "pin", model: pin };
  }
  return undefined;
}

/**
 * Whether the Tier changes the Model for this Task and request. False for a
 * Task with one qualifying Model, so `--describe` can say the Tier changes
 * nothing there.
 */
export function tierChangesChoice(
  task: TaskId,
  request: Omit<TaskRequest, "tier">,
  environment: TaskEnvironment
): boolean {
  const chosen = new Set<string>();
  for (const tier of ["fast", "balanced", "quality"] as const) {
    const result = resolveTask(task, { ...request, tier }, environment);
    if (result.ok) {
      chosen.add(result.model);
    }
  }
  return chosen.size > 1;
}
