/**
 * The composition root's real generation + judging engine — the live
 * counterpart to `mock-engine.ts`. Never imported eagerly for its side
 * effects: every function here that touches an env var or the network does
 * so lazily, inside a function body, only when actually called — this
 * module is statically imported from `repository.ts` (which is
 * route-reachable), so a bare top-level `process.env.FAL_KEY` read or
 * `new FalClient(...)` call at module scope would run during `next build`
 * with zero env vars and break the zero-env build gate
 * (`docs/arc/bench/BRIEF.md`).
 *
 * `createLiveEngine()` is the one factory `repository.ts` calls, and only
 * when `BENCH_MOCK=0` — never at module load, never in a test, never on a
 * dev-server boot (`BRIEF.md` rule 6). It throws synchronously if `FAL_KEY`
 * is unset, before anything else happens — the live engine cannot exist
 * without it.
 */
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";

import { FalClient } from "@howells/motif-sdk";
import { routeFor } from "@motif/bench-core";
import type { GenerationClient } from "@motif/bench-core/execute";
import { executeGeneration } from "@motif/bench-core/execute";
import type {
  JudgeModelCallInput,
  JudgeModelClient,
} from "@motif/bench-core/judge";
import { judgeSample } from "@motif/bench-core/judge";

import type {
  EngineAttempt,
  EngineAttemptInput,
  EngineJudgment,
  EngineJudgmentInput,
  RunEngine,
} from "./engine";

// ---------------------------------------------------------------------------
// Per-model generation timeout
// ---------------------------------------------------------------------------

/** 12 of 23 models publish no `benchmark.speed.p95Seconds`
 * (`docs/arc/bench/BRIEF.md`, "verified ground truth") — this is the common
 * path a majority of live runs hit, not a rare edge case, so it gets a named
 * constant rather than an inline magic number. 90s covers every model this
 * repo has ever measured a `medianSeconds`/`p95Seconds` for with room to
 * spare; `×1.5` (applied uniformly below, same as models with real p95 data)
 * still leaves headroom above that for a model this floor is standing in for. */
export const LIVE_GENERATION_TIMEOUT_FLOOR_SECONDS = 90;

/** `FalClient`'s `timeout` is per-HTTP-request, not a ceiling on a queued
 * model's poll loop (`BRIEF.md`) — this is still the right number to build
 * a run-level deadline from, because `routeFor(alias).speedP95Seconds` (fed
 * by `MODELS[alias].benchmark.speed.p95Seconds`) is the only per-model speed
 * signal this codebase has, queued models included. */
export const timeoutMsForAlias = (
  alias: Parameters<typeof routeFor>[0]
): number => {
  const p95Seconds = routeFor(alias).speedP95Seconds;
  const baseSeconds = p95Seconds ?? LIVE_GENERATION_TIMEOUT_FLOOR_SECONDS;
  return Math.round(baseSeconds * 1.5 * 1000);
};

// ---------------------------------------------------------------------------
// GenerationClient — FalClient adapter
// ---------------------------------------------------------------------------

/** Wraps a real `FalClient` behind `bench-core/execute`'s narrow
 * `GenerationClient` seam. Always constructed with `{ retries: 0, timeout }`
 * — `FalClient`'s own defaults (`retries: 3`, `timeout: 120_000`) are wrong
 * for a benchmark: retries silently inflate the latency number being
 * measured, and a fixed 120s timeout kills genuinely slow models
 * (`BRIEF.md`). `timeoutMs` is per-model (`timeoutMsForAlias` above), so a
 * fresh `FalClient` is built per attempt rather than shared — construction
 * does no I/O, so this is cheap. */
export const createFalGenerationClient = (config: {
  readonly apiKey: string;
  readonly timeoutMs: number;
}): GenerationClient => {
  const client = new FalClient({
    apiKey: config.apiKey,
    retries: 0,
    timeout: config.timeoutMs,
  });
  return { generate: async (options) => await client.generate(options) };
};

// ---------------------------------------------------------------------------
// Disk layout
// ---------------------------------------------------------------------------

/** Run-scoped root for downloaded live images — git-ignored
 * (`apps/bench/.gitignore`), not a test fixture directory. Rooted at
 * `process.cwd()`, which is `apps/bench` for every script in its
 * `package.json` (`dev`/`build`/`start` all run from that directory). */
const LIVE_IMAGES_ROOT = path.join(process.cwd(), "var", "live-runs");

const provisionalImagePath = (
  runId: string,
  alias: string,
  sampleIndex: number
): string =>
  path.join(
    LIVE_IMAGES_ROOT,
    runId,
    `${encodeURIComponent(alias)}-${sampleIndex}.png`
  );

const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** `executeGeneration` writes to whatever path it is given before it knows
 * the real content type (fal's HTTP response header, read mid-download) — so
 * every attempt provisionally writes as `.png` (the common case) and this
 * renames into the correct extension afterward. The extension matters
 * downstream: `@motif/bench-core/judge`'s `mediaTypeForImagePath` picks the
 * vision model's `FilePart.mediaType` from the file's extension, not from a
 * stored column. */
const finalizeImagePath = async (
  provisionalPath: string,
  contentType: string | null
): Promise<string> => {
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType ?? ""] ?? "png";
  const finalPath = `${provisionalPath.slice(0, -path.extname(provisionalPath).length)}.${extension}`;
  if (finalPath !== provisionalPath) {
    await rename(provisionalPath, finalPath);
  }
  return finalPath;
};

// ---------------------------------------------------------------------------
// buildAttempt
// ---------------------------------------------------------------------------

const buildLiveAttempt = async (
  apiKey: string,
  input: EngineAttemptInput
): Promise<EngineAttempt> => {
  const { alignment, costEstimatedMicros, runId, sampleIndex } = input;
  const timeoutMs = timeoutMsForAlias(alignment.alias);
  const client = createFalGenerationClient({ apiKey, timeoutMs });
  const imagePath = provisionalImagePath(runId, alignment.alias, sampleIndex);
  await mkdir(path.dirname(imagePath), { recursive: true });

  // A run-level deadline distinct from `FalClient`'s per-HTTP-request
  // timeout (`BRIEF.md`: the latter is not a ceiling on a queued model's
  // poll loop). Generous over `timeoutMs` itself since it must also cover
  // the image download that follows the provider call.
  const controller = new AbortController();
  const deadline = setTimeout(() => {
    controller.abort();
  }, timeoutMs * 2);

  try {
    const result = await executeGeneration(client, alignment, {
      imagePath,
      signal: controller.signal,
    });

    if (!result.ok) {
      return {
        bytes: 0,
        contentType: "",
        costRefinedMicros: null,
        downloadMs: result.downloadMs,
        droppedParams: alignment.dropped.map((entry) => entry.param),
        errorCode: result.errorCode,
        falRequestId: null,
        height: null,
        imagePath: null,
        ok: false,
        providerMs: result.providerMs,
        queuePolled: alignment.usesQueue,
        seedReturned: null,
        totalMs: result.totalMs,
        width: null,
      };
    }

    const finalPath = await finalizeImagePath(
      result.imagePath,
      result.contentType
    );

    return {
      bytes: result.bytes,
      contentType: result.contentType ?? "application/octet-stream",
      // fal's response carries no per-request price (`MotifResponse` has no
      // cost field) — the pre-run estimate is the best number available, so
      // it is echoed back rather than fabricating a refinement. Still
      // distinct from a failed attempt's `null` (BRIEF.md rule 9).
      costRefinedMicros: costEstimatedMicros,
      downloadMs: result.downloadMs,
      droppedParams: alignment.dropped.map((entry) => entry.param),
      errorCode: null,
      falRequestId: result.falRequestId,
      height: result.height,
      imagePath: finalPath,
      ok: true,
      providerMs: result.providerMs,
      queuePolled: alignment.usesQueue,
      seedReturned: result.seedReturned,
      totalMs: result.totalMs,
      width: result.width,
    };
  } finally {
    clearTimeout(deadline);
  }
};

// ---------------------------------------------------------------------------
// buildJudgment — real vision judge via fal's any-llm/vision endpoint
// ---------------------------------------------------------------------------

/** `GOOGLE_GENERATIVE_AI_API_KEY` does not exist anywhere on this machine or
 * in `.env` (team lead's brief), so the judge is routed through fal's
 * provider-agnostic `any-llm/vision` endpoint instead — same `FAL_KEY` the
 * generation client already requires, no second provider credential. Cheapest
 * capable option of the verified-working model ids (`google/gemini-2.5-flash`,
 * `google/gemini-2.5-pro`, `anthropic/claude-haiku-4.5`,
 * `anthropic/claude-3-haiku`, `openai/gpt-4o` are the alternatives) — a
 * single named constant so swapping tiers later is a one-line change. */
export const FAL_JUDGE_MODEL_ID = "google/gemini-2.5-flash-lite";

/** Verified live against a real image (team lead's brief): returns
 * `200 { output: "<string>", reasoning, partial, error }`. Takes `image_url`,
 * not bytes — the CDN upload below is what turns a local `Buffer` into a URL
 * this endpoint can fetch. */
const FAL_VISION_JUDGE_URL = "https://fal.run/fal-ai/any-llm/vision";

/** Generous relative to a single vision-classification call — this is a
 * judge request, not a generation, so it does not need
 * `LIVE_GENERATION_TIMEOUT_FLOOR_SECONDS`' headroom. Bounds both the CDN
 * upload (`FalClient`'s own per-request timeout) and the vision call
 * (`withJudgeTimeout` below). */
const FAL_JUDGE_TIMEOUT_MS = 60_000;

const withJudgeTimeout = (signal: AbortSignal | undefined): AbortSignal => {
  const timeoutSignal = AbortSignal.timeout(FAL_JUDGE_TIMEOUT_MS);
  return signal === undefined
    ? timeoutSignal
    : AbortSignal.any([signal, timeoutSignal]);
};

/** `imagePart.data` is documented by `@motif/bench-core/judge` to always be a
 * raw `Buffer` read off local disk — never a base64-encoded string, never a
 * `data:` URI (`BRIEF.md` rule 1). The AI SDK's `FilePart.data` type is wider
 * than that guarantee (`DataContent = string | Uint8Array | ArrayBuffer |
 * Buffer`), so this both narrows it to what `uploadToFalCdn` needs and
 * re-enforces the rule at this call site: a `string` (which could be exactly
 * the base64/data-URI shape the rule forbids) is refused rather than
 * forwarded to fal as text. */
export const bufferFromFilePartData = (
  data: JudgeModelCallInput["imagePart"]["data"]
): Buffer => {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  throw new Error(
    "Judge image part must be binary bytes (Buffer/Uint8Array/ArrayBuffer) — refusing to forward a string or URL to fal, which could be a base64/data URI."
  );
};

interface FalVisionJudgeRequestBody {
  readonly image_url: string;
  readonly model: string;
  readonly prompt: string;
}

/** The exact request body sent to `FAL_VISION_JUDGE_URL` — split out so a
 * test can assert its shape (the verified contract, and the base64/data-URI
 * rule: `image_url` is a fal CDN URL, never inlined image bytes) without
 * making a network call. */
export const buildFalVisionRequestBody = (
  prompt: string,
  imageUrl: string
): FalVisionJudgeRequestBody => ({
  image_url: imageUrl,
  model: FAL_JUDGE_MODEL_ID,
  prompt,
});

/** Loose-parses `any-llm/vision`'s response: a truthy `error` or a missing/
 * blank `output` both fail closed into a thrown error, which `judgeSample`
 * (`@motif/bench-core/judge`) catches and turns into `{ status:
 * "inconclusive", errorCode: "JUDGE_UNAVAILABLE" }` — a dead judge must never
 * fail the run. Split out so a test can cover all three branches without a
 * network call. */
export const parseFalVisionOutput = (data: unknown): string => {
  if (typeof data !== "object" || data === null) {
    throw new Error("fal vision judge returned a non-object response");
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowed by the object/null check directly above; both reads below go through explicit typeof/truthiness checks that treat the value as unknown regardless
  const record = data as Record<string, unknown>;
  if (
    record.error !== undefined &&
    record.error !== null &&
    record.error !== false
  ) {
    throw new Error("fal vision judge reported an error");
  }
  if (typeof record.output !== "string" || record.output.trim() === "") {
    throw new Error("fal vision judge response missing a string output");
  }
  return record.output;
};

/** Wraps a real `FalClient` (for the CDN upload) plus a raw `fetch` (for the
 * vision call itself — `FalClient` exposes no generic method for an
 * arbitrary `fal.run/*` endpoint) behind `bench-core/judge`'s narrow
 * `JudgeModelClient` seam. `uploadToFalCdn` is reused rather than
 * hand-rolled (team lead's brief) — it is the only piece of this path that
 * already existed. */
export const buildFalJudgeModelClient = (apiKey: string): JudgeModelClient => ({
  generateJudgeText: async ({ imagePart, prompt, signal }) => {
    const falClient = new FalClient({
      apiKey,
      retries: 0,
      timeout: FAL_JUDGE_TIMEOUT_MS,
    });
    const bytes = bufferFromFilePartData(imagePart.data);
    const extension = EXTENSION_BY_CONTENT_TYPE[imagePart.mediaType] ?? "jpg";
    const uploadResult = await falClient.uploadToFalCdn(bytes, {
      contentType: imagePart.mediaType,
      fileName: `judge-sample.${extension}`,
    });
    if (uploadResult.isErr()) {
      throw new Error(`fal CDN upload failed: ${uploadResult.error.message}`);
    }

    const response = await fetch(FAL_VISION_JUDGE_URL, {
      body: JSON.stringify(
        buildFalVisionRequestBody(prompt, uploadResult.value)
      ),
      headers: {
        Authorization: `Key ${apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: withJudgeTimeout(signal),
    });
    if (!response.ok) {
      throw new Error(`fal vision judge request failed: ${response.status}`);
    }

    const data: unknown = await response.json();
    return parseFalVisionOutput(data);
  },
});

/** `costMicros` is `null`, always: `JudgeModelClient.generateJudgeText`
 * (`bench-core/judge`'s contract, not changeable here) returns only the
 * judge's text, and fal's `any-llm/vision` response carries no billing field
 * to capture even if the seam allowed it through — the same situation
 * `buildLiveAttempt`'s `costRefinedMicros` comment describes for generation.
 * `null` stays distinct from `0` (`BRIEF.md` rule 9): this is genuinely
 * unknown, not free. */
const INCONCLUSIVE_NO_IMAGE: EngineJudgment = {
  costMicros: null,
  critique: null,
  errorCode: "IMAGE_READ_FAILED",
  levels: null,
  overall: null,
  overallLevel: null,
  status: "inconclusive",
};

const buildLiveJudgment = async (
  apiKey: string,
  input: EngineJudgmentInput
): Promise<EngineJudgment> => {
  if (input.imagePath === null) {
    return INCONCLUSIVE_NO_IMAGE;
  }
  const result = await judgeSample(buildFalJudgeModelClient(apiKey), {
    imagePath: input.imagePath,
    prompt: input.prompt,
  });
  return result.status === "scored"
    ? {
        costMicros: null,
        critique: result.critique,
        errorCode: null,
        levels: result.levels,
        overall: result.overall,
        overallLevel: result.overallLevel,
        status: "scored",
      }
    : {
        costMicros: null,
        critique: null,
        errorCode: result.errorCode,
        levels: null,
        overall: null,
        overallLevel: null,
        status: "inconclusive",
      };
};

// ---------------------------------------------------------------------------
// createLiveEngine
// ---------------------------------------------------------------------------

/** Constructs the live `RunEngine`. Throws synchronously — before any
 * network call, before any file is touched — when `FAL_KEY` is unset or
 * empty: neither generation nor judging can exist without it, now that the
 * judge is routed through fal's `any-llm/vision` instead of a second
 * (unconfigured) Google credential. `repository.ts` is the only caller, and
 * only when `BENCH_MOCK=0`. */
export const createLiveEngine = (): RunEngine => {
  // oxlint-disable-next-line no-restricted-properties -- raw provider-key read, matching FalClient's own convention (packages/motif-sdk/src/server.ts constructs from a raw apiKey string); read here, once, inside this factory — never at module scope
  const apiKey = process.env.FAL_KEY;
  if (apiKey === undefined || apiKey === "") {
    throw new Error(
      "Live generation requires FAL_KEY. Set BENCH_MOCK=1 to use the mock engine instead."
    );
  }

  return {
    buildAttempt: async (input) => await buildLiveAttempt(apiKey, input),
    buildJudgment: async (input) => await buildLiveJudgment(apiKey, input),
    isMock: false,
    judgeModelLabel: FAL_JUDGE_MODEL_ID,
  };
};
