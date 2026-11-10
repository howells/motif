/**
 * The Task client: one function per Task. `createMotif()` returns a client
 * whose `generate`, `erase`, `upscale` and the rest resolve the Model through
 * `resolveTask`, build the request that Model needs, run it on fal and return
 * the files and fields it produced.
 *
 * @example
 * ```ts
 * const motif = createMotif();
 * const result = await motif.erase({ image: url, prompt: "the car" });
 * if (result.isOk()) console.log(result.value.files[0]?.url, result.value.model);
 * ```
 */

import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import { getFalKeyFromEnv } from "./env";
import { MotifError } from "./errors";
import { deletePayloads, falConnection, uploadToFalCdn } from "./fal-http";
import type { FalConnection } from "./fal-http";
import { isRecord, queueAppPath } from "./fal-parse";
import { awaitQueuedRequest, runRequest, runRequestQueued } from "./fal-run";
import type { FalRequestResult } from "./fal-run";
import { MODELS } from "./models";
import type { ChosenBy, TaskEnvironment } from "./resolve";
import {
  collectUrls,
  labelUrls,
  resolveOutputLabels,
  urlsFrom,
} from "./task-output";
import type { OutputLabels } from "./task-output";
import { planTask } from "./task-plan";
import type { PlanContext } from "./task-plan";
import { streamTask } from "./task-stream";
import type { TaskStream, TaskStreamOptions } from "./task-stream";
import type { TaskId, Tier } from "./tasks";
import { measuredToolCost } from "./tool-cost";
import type { OutputDimensions, ResolvedCost, SourceVideo } from "./tool-cost";
import { FAL_TOOLS, isFalToolId } from "./tools";
import type {
  AspectRatio,
  CustomImageSize,
  FalFetch,
  ImageOutputFormat,
  JobStatus,
  Resolution,
} from "./types";

export type {
  TaskStream,
  TaskStreamOptions,
  TaskStreamEvent,
} from "./task-stream";

export type { FalFetch } from "./types";

export interface MotifClientConfig {
  /** Falls back to FAL_KEY. */
  falKey?: string;
  /** Models pinned per Task, as `resolveTask` takes them. */
  pins?: TaskEnvironment["pins"];
  /** The one network seam. Defaults to global fetch. Retries and timeouts still apply. */
  fetch?: FalFetch;
  timeout?: number;
  retries?: number;
}

export interface TaskInput {
  /** Source image: https URL or data URL. */
  image?: string;
  /**
   * Boxes to act on, in whole pixels of the source image. A Model that takes
   * fractions gets them converted using the source's size.
   */
  boxes?: readonly { x: number; y: number; width: number; height: number }[];
  /**
   * The source image's pixel size, needed to convert `boxes` for a Model that
   * takes fractions when `image` is an https URL. Read from a data URL itself.
   */
  sourceSize?: { width: number; height: number };
  /**
   * The source video's length, frame count, size and frame rate, read from
   * its header by the caller. Per-second and per-frame Models price from it;
   * without it their projected cost is unknown.
   */
  sourceVideo?: SourceVideo;
  /** reframe `margin` mode: pixels to add on each edge. */
  margin?: { top: number; right: number; bottom: number; left: number };
  /** Source video: https URL. */
  video?: string;
  prompt?: string;
  /** Mask image: https URL or data URL. */
  mask?: string;
  /**
   * Markup image: https URL or data URL. A transparent PNG of annotations
   * (circles, arrows, notes) the size of the image being edited, guiding its
   * edit. generate with references and vary take it; it can't join a mask.
   */
  markup?: string;
  /** Reference images: https URLs or data URLs. restyle and try-on take exactly one. */
  references?: readonly string[];
  aspect?: AspectRatio;
  resolution?: Resolution;
  count?: number;
  seed?: number;
  negativePrompt?: string;
  outputFormat?: ImageOutputFormat;
  transparent?: boolean;
  /** Upscale factor. */
  scale?: number;
  /** reframe `sizes` mode: target sizes. */
  sizes?: readonly CustomImageSize[];
  /** animate: seconds. */
  duration?: number;
  /** mesh: rig the mesh for animation. */
  rig?: boolean;
  look?: string;
  mood?: string;
  tier?: Tier;
  model?: string;
  mode?: string;
  /** Model-only fal body fields, sent as given. Requires `model`. */
  params?: Readonly<Record<string, unknown>>;
  /** Ask fal not to store IO payloads. */
  ephemeral?: boolean;
  /**
   * Called on each poll of fal's queue with its status ("queued",
   * "processing", "completed", "failed") and, while queued, the place in line. When fal has
   * written new log lines since the last poll, they come as the third argument
   * (new lines only). Passing it runs a fal generation through the queue, since
   * only the queue reports.
   */
  onProgress?: (
    status: JobStatus["status"],
    queuePosition?: number,
    logs?: readonly { message: string; timestamp: string }[]
  ) => void;
  /**
   * Called once, as soon as fal's queue accepts the run, with its request id
   * and before any wait. Keep it to `resume` the same job after a restart
   * rather than submitting, and paying for, a second. Passing it queues the run.
   */
  onSubmitted?: (requestId: string) => void;
}

export interface TaskFile {
  /** Output key the URL came from, e.g. "image", "masks", "model_glb". */
  key: string;
  url: string;
  /** Semantic name from the registry's outputLabels, when one applies. */
  label?: string;
}

export interface TaskPlan {
  task: TaskId;
  model: string;
  tier: Tier;
  chosenBy: ChosenBy;
  mode?: string;
  endpoint: string;
  /** Request body as it will be sent. */
  body: Record<string, unknown>;
  /** Prompt after Look and Mood enrichment, when the Task takes one. */
  prompt?: string;
  queued: boolean;
  /** Projected: before the call. */
  cost: ResolvedCost;
  /** The provider carrying the request. */
  provider: "fal";
}

export interface TaskOutput extends Omit<TaskPlan, "body" | "cost" | "queued"> {
  files: TaskFile[];
  /** Non-file result fields: answer, reasoning, boxes, scores, points, rle, text... */
  data: Record<string, unknown>;
  /** Measured where the rate allows, else projected or unknown. */
  cost: ResolvedCost;
  requestId?: string;
  /** Raw provider response, for callers that need a field we don't lift. */
  raw: Record<string, unknown>;
}

export interface PlanOptions {
  /** Resolve as if FAL_KEY were set, so a dry run can price without a key. */
  dryRun?: boolean;
}

export type TaskFunction = (
  input: TaskInput
) => Promise<Result<TaskOutput, MotifError>>;

export interface MotifClient {
  /** Pure: resolve the Model, build the request, price it. No I/O. */
  plan: (
    task: TaskId,
    input: TaskInput,
    options?: PlanOptions
  ) => Result<TaskPlan, MotifError>;
  run: (
    task: TaskId,
    input: TaskInput
  ) => Promise<Result<TaskOutput, MotifError>>;
  stream: (
    task: TaskId,
    input: TaskInput,
    options?: TaskStreamOptions
  ) => Promise<Result<TaskStream, MotifError>>;
  animate: TaskFunction;
  ask: TaskFunction;
  cutout: TaskFunction;
  erase: TaskFunction;
  generate: TaskFunction;
  layers: TaskFunction;
  map: TaskFunction;
  material: TaskFunction;
  mesh: TaskFunction;
  reframe: TaskFunction;
  relight: TaskFunction;
  restore: TaskFunction;
  restyle: TaskFunction;
  segment: TaskFunction;
  tile: TaskFunction;
  "try-on": TaskFunction;
  upscale: TaskFunction;
  vary: TaskFunction;
  vectorize: TaskFunction;
  /** Upload bytes to fal storage; returns the public URL. */
  upload: (
    bytes: Uint8Array,
    contentType: string,
    fileName?: string
  ) => Promise<Result<string, MotifError>>;
  deletePayloads: (requestId: string) => Promise<Result<void, MotifError>>;
  /**
   * Read a queued run already submitted, by the request id `onSubmitted` gave:
   * wait for it and return its output, submitting nothing. Pass the same task
   * and input the run was made with, so the endpoint and costing match.
   */
  resume: (
    task: TaskId,
    input: TaskInput,
    requestId: string
  ) => Promise<Result<TaskOutput, MotifError>>;
}

const MISSING_API_KEY = "MISSING_API_KEY";

function presentKey(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

const RIGGED_MESH_KEY = "rigged_character_glb";

/**
 * Output keys holding files, by the kind of Model, primary file first. A rig
 * request's rigged mesh is the file it asked for, so it leads.
 */
function outputKeysFor(
  model: string,
  body: Readonly<Record<string, unknown>>
): readonly string[] {
  if (isFalToolId(model)) {
    const keys: readonly string[] = FAL_TOOLS[model].outputKeys;
    return body.enable_rigging === true && keys.includes(RIGGED_MESH_KEY)
      ? [RIGGED_MESH_KEY, ...keys.filter((key) => key !== RIGGED_MESH_KEY)]
      : keys;
  }
  return MODELS[model]?.outputKeys ?? ["images"];
}

/** Width and height of every returned file that carries them. */
function outputDimensions(
  data: Record<string, unknown>,
  keys: readonly string[]
): OutputDimensions[] {
  return keys.flatMap((key) => {
    const value = data[key];
    const items: unknown[] = Array.isArray(value) ? value : [value];
    return items.flatMap((item) =>
      isRecord(item) &&
      typeof item.width === "number" &&
      typeof item.height === "number"
        ? [{ height: item.height, width: item.width }]
        : []
    );
  });
}

function falOutput(plan: TaskPlan, result: FalRequestResult): TaskOutput {
  const { data, requestId } = result;
  const keys = outputKeysFor(plan.model, plan.body);
  const urls = collectUrls(data, keys);
  const declared = isFalToolId(plan.model) ? FAL_TOOLS[plan.model] : undefined;
  const labels: OutputLabels =
    declared !== undefined && "outputLabels" in declared
      ? resolveOutputLabels(declared.outputLabels, plan.body, data)
      : {};
  const names = labelUrls(urls, labels);
  const files: TaskFile[] = urls.map(({ key, url }, index) => {
    const label = names[index];
    return label === undefined ? { key, url } : { key, label, url };
  });

  const fileKeys = new Set(
    keys.filter((key) => urlsFrom(data[key]).length > 0)
  );
  const rest = Object.fromEntries(
    Object.entries(data).filter(([key]) => !fileKeys.has(key))
  );

  const measured =
    declared === undefined
      ? undefined
      : measuredToolCost(
          declared.price,
          outputDimensions(data, keys),
          plan.body
        );
  // A rate the output can't measure, such as per second or per token, keeps
  // the plan's projection rather than dropping to unknown.
  const cost =
    measured === undefined || measured.usd === null ? plan.cost : measured;

  return {
    chosenBy: plan.chosenBy,
    cost,
    data: rest,
    endpoint: plan.endpoint,
    files,
    model: plan.model,
    ...(plan.mode !== undefined && { mode: plan.mode }),
    ...(plan.prompt !== undefined && { prompt: plan.prompt }),
    provider: plan.provider,
    raw: data,
    ...((requestId ?? "") !== "" && { requestId }),
    task: plan.task,
    tier: plan.tier,
  };
}

function taskStreamer(
  config: MotifClientConfig,
  plan: MotifClient["plan"],
  context: () => PlanContext
): MotifClient["stream"] {
  return async (task, input, options = {}) => {
    const planned = plan(task, input);
    if (planned.isErr()) {
      return err(planned.error);
    }
    return await streamTask(
      planned.value,
      context().falKey,
      config.fetch ?? (async (url, init) => await globalThis.fetch(url, init)),
      input.ephemeral === true,
      { timeout: config.timeout, ...options }
    );
  };
}

/** Create the Task client. The key falls back to FAL_KEY. */
export function createMotif(config: MotifClientConfig = {}): MotifClient {
  function context(): PlanContext {
    return {
      falKey: presentKey(config.falKey ?? getFalKeyFromEnv()),
      pins: config.pins,
    };
  }

  function connection(): Result<FalConnection, MotifError> {
    const apiKey = presentKey(config.falKey ?? getFalKeyFromEnv());
    if (apiKey === undefined) {
      return err(
        new MotifError("FAL_KEY is not set.", 0, MISSING_API_KEY, undefined, {
          envVar: "FAL_KEY",
        })
      );
    }
    return ok(falConnection(apiKey, config));
  }

  function plan(
    task: TaskId,
    input: TaskInput,
    options?: PlanOptions
  ): Result<TaskPlan, MotifError> {
    return planTask(task, input, context(), options);
  }

  async function run(
    task: TaskId,
    input: TaskInput
  ): Promise<Result<TaskOutput, MotifError>> {
    const fal = connection();
    if (fal.isErr()) {
      return err(fal.error);
    }
    const planned = plan(task, input);
    if (planned.isErr()) {
      return err(planned.error);
    }
    const chosen = planned.value;

    const headers: Record<string, string> =
      input.ephemeral === true ? { "X-Fal-Store-IO": "0" } : {};
    const prepared = {
      body: chosen.body,
      endpoint: chosen.endpoint,
      headers,
    };
    // `onSubmitted` promises the request id before any wait, which only fal's
    // queue gives, so it queues every Model, not only those planned as queued.
    const queued = chosen.queued || input.onSubmitted !== undefined;
    const result = queued
      ? await runRequestQueued(
          fal.value,
          prepared,
          input.onProgress,
          input.onSubmitted
        )
      : await runRequest(fal.value, prepared);
    return result.map((value) => falOutput(chosen, value));
  }

  async function resume(
    task: TaskId,
    input: TaskInput,
    requestId: string
  ): Promise<Result<TaskOutput, MotifError>> {
    const planned = plan(task, input);
    if (planned.isErr()) {
      return err(planned.error);
    }
    const chosen = planned.value;
    const fal = connection();
    if (fal.isErr()) {
      return err(fal.error);
    }
    const result = await awaitQueuedRequest(
      fal.value,
      { endpoint: queueAppPath(chosen.endpoint), requestId },
      input.onProgress
    );
    return result.map((value) => falOutput(chosen, value));
  }

  const tasks = {
    animate: async (input) => await run("animate", input),
    ask: async (input) => await run("ask", input),
    cutout: async (input) => await run("cutout", input),
    erase: async (input) => await run("erase", input),
    generate: async (input) => await run("generate", input),
    layers: async (input) => await run("layers", input),
    map: async (input) => await run("map", input),
    material: async (input) => await run("material", input),
    mesh: async (input) => await run("mesh", input),
    reframe: async (input) => await run("reframe", input),
    relight: async (input) => await run("relight", input),
    restore: async (input) => await run("restore", input),
    restyle: async (input) => await run("restyle", input),
    segment: async (input) => await run("segment", input),
    tile: async (input) => await run("tile", input),
    "try-on": async (input) => await run("try-on", input),
    upscale: async (input) => await run("upscale", input),
    vary: async (input) => await run("vary", input),
    vectorize: async (input) => await run("vectorize", input),
  } satisfies Record<TaskId, TaskFunction>;

  return {
    ...tasks,
    async deletePayloads(requestId) {
      const fal = connection();
      return fal.isErr()
        ? err(fal.error)
        : await deletePayloads(fal.value, requestId);
    },
    plan,
    resume,
    run,
    stream: taskStreamer(config, plan, context),
    async upload(bytes, contentType, fileName) {
      const fal = connection();
      return fal.isErr()
        ? err(fal.error)
        : await uploadToFalCdn(fal.value, bytes, {
            contentType,
            fileName: fileName ?? "upload",
          });
    },
  };
}
