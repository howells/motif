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
import type {
  Capability,
  RankedFrom,
  RankedModel,
  TaskDefinition,
  TaskId,
  Tier,
} from "./tasks";
import { DEFAULT_TIER, TASKS } from "./tasks";
import { falToolParameters } from "./tool-parameters.generated";
import { FAL_TOOLS, isFalToolId } from "./tools";
import type { FalToolId } from "./tools";
import type { ModelConfig } from "./types";

export type { Capability } from "./tasks";

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
  /** A resolution tier is asked for, e.g. `"1K"`. */
  readonly resolution?: string;
  /** Number of outputs wanted. */
  readonly count?: number;
  readonly seed?: boolean;
  readonly negativePrompt?: boolean;
  readonly outputFormat?: boolean;
  /** A rigged mesh wanted. */
  readonly rig?: boolean;
  /** The kind of Source passed in. Absent for a text-only request. */
  readonly source?: "image" | "video";
  /** A named variant of the Task, e.g. `"text"` for erase. */
  readonly mode?: string;
}

export interface TaskEnvironment {
  /** Names of the provider key variables that are set, e.g. `["FAL_KEY"]`. */
  readonly keys: readonly string[];
  /** Models pinned per Task in config (`tasks.<task>.model`). */
  readonly pins?: Readonly<Partial<Record<TaskId, string>>>;
}

/** Which rule fixed the Model. */
export type ChosenBy = "look" | "model" | "pin" | "ranking";

export type Blocker = Capability | "key" | "mode" | "unknown-model";

/**
 * What unblocks a refused request: name another Model, set a key, drop an
 * option the request asked for, or supply an input a Model needs (a mask).
 */
export type Unblocker = "input" | "key" | "model" | "option";

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
  if (config.supportsResolution) {
    capabilities.add("resolution");
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

/**
 * Capabilities a fal tool takes, read from its generated parameter list: the
 * same list the task client maps request fields onto, so resolution and the
 * request body cannot disagree.
 */
const TOOL_PARAMETER_CAPABILITIES: readonly (readonly [
  Capability,
  readonly string[],
])[] = [
  ["aspect", ["aspect_ratio", "image_size"]],
  ["count", ["num_images"]],
  ["negativePrompt", ["negative_prompt"]],
  ["outputFormat", ["output_format"]],
  ["resolution", ["canvas_size", "image_size"]],
  ["rig", ["enable_rigging"]],
  ["seed", ["seed"]],
];

function toolProfile(tool: FalToolId): ModelProfile {
  const keys = new Set(
    falToolParameters(tool).map((parameter) => parameter.key)
  );
  const config = FAL_TOOLS[tool];
  const capabilities = new Set<Capability>([
    config.inputKind === "video" ? "video" : "image",
  ]);
  for (const [capability, parameters] of TOOL_PARAMETER_CAPABILITIES) {
    if (parameters.some((parameter) => keys.has(parameter))) {
      capabilities.add(capability);
    }
  }
  const takesReference = "referenceField" in config;
  if (takesReference) {
    capabilities.add("references");
  }
  return {
    capabilities,
    keyedCapabilities: new Map(),
    keys: [FAL_KEY],
    maxReferences: takesReference ? 1 : 0,
  };
}

function withEntry(profile: ModelProfile, entry: RankedModel): ModelProfile {
  if (entry.supports === undefined) {
    return profile;
  }
  return {
    ...profile,
    capabilities: new Set([...profile.capabilities, ...entry.supports]),
  };
}

/** The profile for a Model id, or undefined when no registry knows it. */
export function modelProfile(model: string): ModelProfile | undefined {
  const config = MODELS[model];
  if (config !== undefined) {
    return generationProfile(config);
  }
  if (isFalToolId(model)) {
    return toolProfile(model);
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
  if (request.resolution !== undefined) {
    needed.push("resolution");
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
  if (request.rig === true) {
    needed.push("rig");
  }
  return needed;
}

type Check =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly blockedBy: Capability | "key";
      readonly missingKey?: string;
      /** The Model needs this input and the request did not supply it. */
      readonly missingInput?: true;
    };

function check(
  profile: ModelProfile,
  needed: readonly Capability[],
  request: TaskRequest,
  keys: readonly string[],
  requires: readonly Capability[] = []
): Check {
  for (const key of profile.keys) {
    if (!keys.includes(key)) {
      return { blockedBy: "key", missingKey: key, ok: false };
    }
  }
  for (const capability of requires) {
    if (!needed.includes(capability)) {
      return { blockedBy: capability, missingInput: true, ok: false };
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

function describeBlock(
  blockedBy: Blocker,
  missingKey?: string,
  missingInput?: true
): string {
  if (missingInput === true) {
    return `needs a ${blockedBy} input`;
  }
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
  const definition: TaskDefinition = TASKS[task];
  const modes = (definition.modes ?? []).map((mode) => mode.id);
  if (request.mode !== undefined && !modes.includes(request.mode)) {
    return unresolved(
      task,
      "mode",
      ["option"],
      `${task} has no mode ${request.mode}. Modes: ${modes.length > 0 ? modes.join(", ") : "none"}.`
    );
  }
  const needed = requirements(request);
  for (const fixed of fixedModels(task, request, environment)) {
    const result = resolveFixed(task, fixed, request, needed, environment.keys);
    if (result !== undefined) {
      return result;
    }
  }
  return resolveRanked(task, request, needed, environment.keys);
}

interface FixedModel {
  readonly chosenBy: ChosenBy;
  readonly model: string;
}

/**
 * Resolve a Model fixed by `--model`, a Look or a pin. Returns undefined so the
 * next rule applies when a pin serves this Task only under another mode (a pin
 * for plain erase should not run when the caller asks to erase text), or when
 * a Look's Model is not offered for this Task (a look on vary whose Model
 * cannot edit). An explicit Model, or a pin the Task doesn't know, fails.
 */
function resolveFixed(
  task: TaskId,
  fixed: FixedModel,
  request: TaskRequest,
  needed: readonly Capability[],
  keys: readonly string[]
): TaskResolution | undefined {
  const { chosenBy, model } = fixed;
  const tier = request.tier ?? DEFAULT_TIER;
  const entries: readonly RankedModel[] = TASKS[task].models;
  const entry = entries.find(
    (candidate) => candidate.model === model && candidate.mode === request.mode
  );
  const profile = modelProfile(model);
  if (entry === undefined || profile === undefined) {
    const servesTask = entries.some((candidate) => candidate.model === model);
    if (chosenBy === "look" || (chosenBy === "pin" && servesTask)) {
      return undefined;
    }
    return unknownForMode(task, model, request.mode, entries);
  }
  const result = check(
    withEntry(profile, entry),
    needed,
    request,
    keys,
    entry.requires
  );
  if (result.ok) {
    return resolved(task, model, tier, chosenBy);
  }
  const unblockers: Unblocker[] = chosenBy === "model" ? [] : ["model"];
  unblockers.push(unblockerFor(result));
  return unresolved(
    task,
    result.blockedBy,
    unblockers,
    `${model} (${chosenBy}) ${describeBlock(result.blockedBy, result.missingKey, result.missingInput)}.`,
    result.missingKey
  );
}

function unknownForMode(
  task: TaskId,
  model: string,
  mode: string | undefined,
  entries: readonly RankedModel[]
): TaskUnresolved {
  const otherModes = entries
    .filter((candidate) => candidate.model === model)
    .map((candidate) => candidate.mode ?? "no mode");
  const inMode = [
    ...new Set(
      entries
        .filter((candidate) => candidate.mode === mode)
        .map((candidate) => candidate.model)
    ),
  ];
  const where = mode === undefined ? task : `${task} ${mode}`;
  if (otherModes.length > 0) {
    return unresolved(
      task,
      "unknown-model",
      ["model", "option"],
      `${model} is not a Model for ${where}; it serves ${task} with ${otherModes.join(", ")}. ${where} accepts: ${inMode.join(", ")}.`
    );
  }
  return unresolved(
    task,
    "unknown-model",
    ["model"],
    `${model} is not a Model for ${where}. ${where} accepts: ${inMode.join(", ")}.`
  );
}

function unblockerFor(result: Extract<Check, { ok: false }>): Unblocker {
  if (result.blockedBy === "key") {
    return "key";
  }
  return result.missingInput === true ? "input" : "option";
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
  const definition: TaskDefinition = TASKS[task];
  for (const entry of definition.models) {
    if (entry.mode !== request.mode) {
      continue;
    }
    const { model, tier: modelTier } = entry;
    const profile = modelProfile(model);
    if (profile === undefined) {
      throw new Error(`Task ${task} ranks unknown Model ${model}`);
    }
    const result = check(
      withEntry(profile, entry),
      needed,
      request,
      keys,
      entry.requires
    );
    if (result.ok) {
      if (!qualifying.has(modelTier)) {
        qualifying.set(modelTier, model);
      }
    } else if (result.blockedBy === "key") {
      keyBlock ??= result.missingKey;
    } else if (firstBlock === undefined || firstBlock.missingInput === true) {
      firstBlock =
        result.missingInput === true ? (firstBlock ?? result) : result;
    }
  }

  for (const candidate of TIER_ORDER[tier]) {
    const model = qualifying.get(candidate);
    if (model !== undefined) {
      return resolved(task, model, tier, "ranking");
    }
  }

  return rankedRefusal(task, request.mode, firstBlock, keyBlock);
}

function rankedRefusal(
  task: TaskId,
  mode: string | undefined,
  firstBlock: Extract<Check, { ok: false }> | undefined,
  keyBlock: string | undefined
): TaskUnresolved {
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
  const unblockers: Unblocker[] = [unblockerFor(firstBlock)];
  if (keyBlock !== undefined) {
    unblockers.push("key");
  }
  const where = mode === undefined ? task : `${task} ${mode}`;
  const reason =
    firstBlock.missingInput === true
      ? `without a ${firstBlock.blockedBy} input`
      : `can do ${firstBlock.blockedBy}`;
  return unresolved(
    task,
    firstBlock.blockedBy,
    unblockers,
    `No Model for ${where} ${reason}${keyBlock === undefined ? "" : ` without ${keyBlock}`}.`,
    keyBlock
  );
}

/** Tasks whose Models are generation Models, the only ones a Look can fix. */
const LOOK_TASKS: ReadonlySet<TaskId> = new Set<TaskId>(["generate", "vary"]);

/** Models fixed ahead of the ranking, in precedence order. */
function fixedModels(
  task: TaskId,
  request: TaskRequest,
  environment: TaskEnvironment
): FixedModel[] {
  const fixed: FixedModel[] = [];
  if (request.model !== undefined && request.model !== "") {
    fixed.push({ chosenBy: "model", model: request.model });
  }
  const look =
    request.look === undefined || !LOOK_TASKS.has(task)
      ? undefined
      : getLook(request.look);
  if (look !== undefined) {
    fixed.push({ chosenBy: "look", model: look.model });
  }
  const pin = environment.pins?.[task];
  if (pin !== undefined && pin !== "") {
    fixed.push({ chosenBy: "pin", model: pin });
  }
  return fixed;
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
