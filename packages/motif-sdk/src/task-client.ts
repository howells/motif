/**
 * The Task client: one function per Task. `createMotif()` returns a client
 * whose `generate`, `erase`, `upscale` and the rest resolve the Model through
 * `resolveTask`, build the request that Model needs, run it on fal (or OpenAI
 * for a transparency route) and return the files and fields it produced.
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

import { getFalKeyFromEnv, getOpenAiKeyFromEnv } from "./env";
import { MotifError } from "./errors";
import { createMotifImage } from "./image/index";
import type { ChosenBy, TaskEnvironment } from "./resolve";
import { FalClient } from "./server";
import {
  falRequestExecutor,
  runRequest,
  runRequestQueued,
} from "./server-tools";
import type { FalRequestResult } from "./server-tools";
import {
  collectUrls,
  labelUrls,
  resolveOutputLabels,
  urlsFrom,
} from "./task-output";
import type { OutputLabels } from "./task-output";
import { planTask } from "./task-plan";
import type { PlanContext } from "./task-plan";
import type { TaskId, Tier } from "./tasks";
import { measuredToolCost } from "./tool-cost";
import type { OutputDimensions, ResolvedCost } from "./tool-cost";
import { FAL_TOOLS, isFalToolId } from "./tools";
import type {
  AspectRatio,
  CustomImageSize,
  FalFetch,
  ImageOutputFormat,
  Resolution,
} from "./types";

export type { FalFetch } from "./types";

export interface MotifClientConfig {
  /** Falls back to FAL_KEY. */
  falKey?: string;
  /** Falls back to OPENAI_API_KEY. Used only by Models routed through OpenAI. */
  openAiKey?: string;
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
  /** reframe `margin` mode: pixels to add on each edge. */
  margin?: { top: number; right: number; bottom: number; left: number };
  /** Source video: https URL. */
  video?: string;
  prompt?: string;
  /** Mask image: https URL or data URL. */
  mask?: string;
  /** Reference images: https URLs or data URLs. */
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
  look?: string;
  mood?: string;
  tier?: Tier;
  model?: string;
  mode?: string;
  /** Model-only fal body fields, sent as given. Requires `model`. */
  params?: Readonly<Record<string, unknown>>;
  /** Ask fal not to store IO payloads. */
  ephemeral?: boolean;
  onProgress?: (status: string, queuePosition?: number) => void;
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
  /** The provider carrying the request. "openai" only for a transparency route. */
  provider: "fal" | "openai";
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
  segment: TaskFunction;
  tile: TaskFunction;
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
}

const MISSING_API_KEY = "MISSING_API_KEY";

const PIXEL_SIZE_REGEX = /^\d+x\d+$/;

function presentKey(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

/** Output keys holding files, by the kind of Model. */
function outputKeysFor(model: string): readonly string[] {
  if (isFalToolId(model)) {
    return FAL_TOOLS[model].outputKeys;
  }
  if (model === "kling") {
    return ["video"];
  }
  if (model === "clarity" || model === "crystal") {
    return ["image"];
  }
  return ["images"];
}

function isPixelSize(size: string): size is `${number}x${number}` {
  return PIXEL_SIZE_REGEX.test(size);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
  const keys = outputKeysFor(plan.model);
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

  const cost =
    declared === undefined
      ? plan.cost
      : measuredToolCost(declared.price, outputDimensions(data, keys));

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

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Remote images as bytes, fetched through the configured seam: the AI SDK
 * would otherwise download them with global fetch. Data URLs pass through.
 */
async function localImages(
  sources: readonly string[],
  fetch: FalFetch
): Promise<Result<(string | Uint8Array)[], MotifError>> {
  const images: (string | Uint8Array)[] = [];
  for (const source of sources) {
    if (!source.startsWith("https://") && !source.startsWith("http://")) {
      images.push(source);
      continue;
    }
    try {
      const response = await fetch(source, { method: "GET" });
      if (!response.ok) {
        return err(
          new MotifError(
            `Could not download ${source}: ${response.status}`,
            response.status,
            "DOWNLOAD_FAILED"
          )
        );
      }
      images.push(new Uint8Array(await response.arrayBuffer()));
    } catch (error) {
      return err(
        new MotifError(
          `Could not download ${source}: ${error instanceof Error ? error.message : String(error)}`,
          0,
          "DOWNLOAD_FAILED"
        )
      );
    }
  }
  return ok(images);
}

async function openAiOutput(
  plan: TaskPlan,
  openAiKey: string,
  config: MotifClientConfig
): Promise<Result<TaskOutput, MotifError>> {
  const fetch: FalFetch =
    config.fetch ?? (async (url, init) => await globalThis.fetch(url, init));
  const client = createMotifImage({
    defaultProvider: "openai",
    fetch,
    openai: { apiKey: openAiKey },
    ...(config.retries !== undefined && { maxRetries: config.retries }),
  });
  const signal = AbortSignal.timeout(config.timeout ?? DEFAULT_TIMEOUT_MS);
  const { body } = plan;
  const [provider, model = ""] = plan.endpoint.split(":");
  const n = typeof body.n === "number" ? body.n : 1;
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const providerOptions = {
    openai: { background: "transparent", outputFormat: "png" },
  };
  const sources = Array.isArray(body.images)
    ? body.images.filter((item): item is string => typeof item === "string")
    : [];
  const mask = typeof body.mask === "string" ? [body.mask] : [];
  const downloaded = await localImages([...sources, ...mask], fetch);
  if (downloaded.isErr()) {
    return err(downloaded.error);
  }
  const images = downloaded.value.slice(0, sources.length);
  const maskImage = downloaded.value[sources.length];
  const size = typeof body.size === "string" ? body.size : "auto";
  const common = { model, n, provider, providerOptions, signal };
  const result =
    images.length === 0
      ? await client.generate({
          ...common,
          prompt,
          ...(isPixelSize(size) && { size }),
        })
      : await client.edit({
          ...common,
          images,
          instruction: prompt,
          ...(maskImage !== undefined && { mask: maskImage }),
        });
  if (result.isErr()) {
    return err(result.error);
  }
  const value = result.value;
  let cost: ResolvedCost = { basis: "unknown", usd: null };
  if (value.cost.source === "provider-metadata") {
    cost = { basis: "measured", usd: value.cost.usd };
  } else if (value.cost.source === "table") {
    cost = { basis: "projected", usd: value.cost.usd };
  }
  return ok({
    chosenBy: plan.chosenBy,
    cost,
    data: {},
    endpoint: plan.endpoint,
    files: value.images.map((image) => ({
      key: "images",
      url: `data:${image.mediaType};base64,${image.base64}`,
    })),
    model: plan.model,
    ...(plan.mode !== undefined && { mode: plan.mode }),
    ...(plan.prompt !== undefined && { prompt: plan.prompt }),
    provider: plan.provider,
    raw: {
      model: value.model,
      provider: value.provider,
      ...(value.warnings !== undefined && { warnings: value.warnings }),
    },
    ...(value.requestId !== undefined && { requestId: value.requestId }),
    task: plan.task,
    tier: plan.tier,
  });
}

/** Create the Task client. Keys fall back to FAL_KEY and OPENAI_API_KEY. */
export function createMotif(config: MotifClientConfig = {}): MotifClient {
  function context(): PlanContext {
    return {
      falKey: presentKey(config.falKey ?? getFalKeyFromEnv()),
      openAiKey: presentKey(config.openAiKey ?? getOpenAiKeyFromEnv()),
      pins: config.pins,
    };
  }

  function falClient(): Result<FalClient, MotifError> {
    const apiKey = presentKey(config.falKey ?? getFalKeyFromEnv());
    if (apiKey === undefined) {
      return err(
        new MotifError("FAL_KEY is not set.", 0, MISSING_API_KEY, undefined, {
          envVar: "FAL_KEY",
        })
      );
    }
    return ok(
      new FalClient({
        apiKey,
        ...(config.fetch !== undefined && { fetch: config.fetch }),
        ...(config.retries !== undefined && { retries: config.retries }),
        ...(config.timeout !== undefined && { timeout: config.timeout }),
      })
    );
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
    const client = falClient();
    if (client.isErr()) {
      return err(client.error);
    }
    const planned = plan(task, input);
    if (planned.isErr()) {
      return err(planned.error);
    }
    const chosen = planned.value;
    if (chosen.provider === "openai") {
      const openAiKey = context().openAiKey;
      if (openAiKey === undefined) {
        return err(
          new MotifError(
            "OPENAI_API_KEY is not set.",
            0,
            MISSING_API_KEY,
            undefined,
            { envVar: "OPENAI_API_KEY" }
          )
        );
      }
      return await openAiOutput(chosen, openAiKey, config);
    }

    const headers: Record<string, string> =
      input.ephemeral === true ? { "X-Fal-Store-IO": "0" } : {};
    const prepared = {
      body: chosen.body,
      endpoint: chosen.endpoint,
      headers,
    };
    const executor = falRequestExecutor(client.value);
    const result = chosen.queued
      ? await runRequestQueued(executor, prepared, input.onProgress)
      : await runRequest(executor, prepared);
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
    segment: async (input) => await run("segment", input),
    tile: async (input) => await run("tile", input),
    upscale: async (input) => await run("upscale", input),
    vary: async (input) => await run("vary", input),
    vectorize: async (input) => await run("vectorize", input),
  } satisfies Record<TaskId, TaskFunction>;

  return {
    ...tasks,
    async deletePayloads(requestId) {
      const client = falClient();
      return client.isErr()
        ? err(client.error)
        : await client.value.deletePayloads(requestId);
    },
    plan,
    run,
    async upload(bytes, contentType, fileName) {
      const client = falClient();
      return client.isErr()
        ? err(client.error)
        : await client.value.uploadToFalCdn(bytes, {
            contentType,
            fileName: fileName ?? "upload",
          });
    },
  };
}
