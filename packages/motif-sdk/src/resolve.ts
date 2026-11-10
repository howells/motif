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
import type { MotifError } from "./errors";
import { FAL_KEY, modelProfile, withEntry } from "./model-profile";
import type { ModelProfile } from "./model-profile";
import type {
  Capability,
  RankedFrom,
  RankedModel,
  TaskDefinition,
  TaskId,
  Tier,
} from "./tasks";
import { DEFAULT_TIER, TASKS } from "./tasks";

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
  /** A markup image is passed in. */
  readonly markup?: boolean;
  /** An aspect ratio is asked for, e.g. `"3:2"`. */
  readonly aspect?: string;
  /** A resolution tier is asked for, e.g. `"1K"`. */
  readonly resolution?: string;
  /** Number of outputs wanted. */
  readonly count?: number;
  readonly seed?: boolean;
  readonly negativePrompt?: boolean;
  /** An output format is asked for, e.g. `"gif"`. */
  readonly outputFormat?: string;
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
  /**
   * Whether the Model can carry the whole request: the refusal when it cannot.
   * The planner supplies it, so a ranked Model it would refuse is skipped
   * rather than chosen and then refused. Absent when only the capability
   * profiles are asked, as in `--describe`.
   */
  readonly refusal?: (model: string) => MotifError | undefined;
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
  if (request.markup === true) {
    needed.push("markup");
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
  if (request.outputFormat !== undefined) {
    needed.push("outputFormat");
  }
  if (request.rig === true) {
    needed.push("rig");
  }
  return needed;
}

/** Whether the request's value for a capability is one the Model takes. */
function withinLimits(
  profile: ModelProfile,
  capability: Capability,
  request: TaskRequest
): boolean {
  if (capability === "references") {
    return (request.references ?? 0) <= profile.maxReferences;
  }
  if (capability === "aspect") {
    return listed(profile.aspects, request.aspect);
  }
  if (capability === "resolution") {
    return listed(profile.resolutions, request.resolution);
  }
  if (capability === "outputFormat") {
    const editing =
      (request.references ?? 0) > 0 || request.source !== undefined;
    return listed(
      editing ? profile.outputFormats?.edit : profile.outputFormats?.text,
      request.outputFormat
    );
  }
  return true;
}

function listed(
  allowed: readonly string[] | undefined,
  value: string | undefined
): boolean {
  return (
    allowed === undefined || value === undefined || allowed.includes(value)
  );
}

type Check =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly blockedBy: Capability | "key";
      /** The values the Model takes, when it refused an aspect or resolution. */
      readonly accepts?: readonly string[];
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
    if (!profile.capabilities.has(capability)) {
      return { blockedBy: capability, ok: false };
    }
    if (!withinLimits(profile, capability, request)) {
      const accepts =
        capability === "aspect" ? profile.aspects : profile.resolutions;
      return { accepts, blockedBy: capability, ok: false };
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
  request: TaskRequest,
  missingKey?: string,
  missingInput?: true,
  accepts?: readonly string[]
): string {
  if (
    accepts !== undefined &&
    (blockedBy === "aspect" || blockedBy === "resolution")
  ) {
    return `cannot do ${blockedBy} ${request[blockedBy] ?? ""}; it takes ${accepts.join(", ")}`;
  }
  if (blockedBy === "outputFormat" && request.outputFormat !== undefined) {
    const editing =
      (request.references ?? 0) > 0 || request.source !== undefined;
    return `cannot return ${request.outputFormat}${editing ? " from an edit" : ""}`;
  }
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
  return resolveRanked(
    task,
    request,
    needed,
    environment.keys,
    environment.refusal
  );
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
    `${model} (${chosenBy}) ${describeBlock(result.blockedBy, request, result.missingKey, result.missingInput, result.accepts)}.`,
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
  keys: readonly string[],
  refusal: TaskEnvironment["refusal"]
): TaskResolution {
  const tier = request.tier ?? DEFAULT_TIER;
  const qualifying = new Map<Tier, string>();
  let firstBlock: Extract<Check, { ok: false }> | undefined;
  let keyBlock: string | undefined;
  const definition: TaskDefinition = TASKS[task];
  const ranking =
    (request.references ?? 0) > 0
      ? (definition.referenceModels ?? definition.models)
      : definition.models;
  for (const entry of ranking) {
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
        if (refusal?.(model) === undefined) {
          qualifying.set(modelTier, model);
        }
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
  // Only a generation Model can be fixed by a Look.
  const definition: TaskDefinition = TASKS[task];
  const look =
    request.look === undefined || definition.generationModels !== true
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
