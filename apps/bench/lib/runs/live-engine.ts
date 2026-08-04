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

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { FalClient } from "@howells/motif-sdk";
import { routeFor } from "@motif/bench-core";
import type { GenerationClient } from "@motif/bench-core/execute";
import { executeGeneration } from "@motif/bench-core/execute";
import type { JudgeModelClient } from "@motif/bench-core/judge";
import { judgeSample } from "@motif/bench-core/judge";
import { generateText } from "ai";
import type { ModelMessage } from "ai";

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
// buildJudgment — real vision judge via the AI SDK
// ---------------------------------------------------------------------------

/** Fast, cheap, multimodal — the same Gemini family
 * `@howells/motif-sdk/image`'s Google adapter already uses as its "fast"
 * image-generation tier (`packages/motif-sdk/src/image/google.ts`,
 * `GOOGLE_TIER_MODELS.fast`), applied here to text+vision judging instead of
 * image generation. */
const JUDGE_MODEL_ID = "gemini-2.5-flash";

/** Same env var `@howells/motif-sdk/image`'s Google adapter reads
 * (`GOOGLE_API_KEY_ENV` in `packages/motif-sdk/src/image/google.ts`) — a raw
 * `process.env` read, not routed through `@motif/bench-env`, matching that
 * existing convention for provider keys in this codebase. Read lazily, only
 * when a live judge call actually happens (never at `createLiveEngine()`
 * construction — a live *generation* run with judging turned off must not
 * require this key at all). */
const googleApiKey = (): string => {
  // oxlint-disable-next-line no-restricted-properties -- raw provider-key read, mirroring packages/motif-sdk/src/image/google.ts's own convention; read lazily inside this function body only, never at module scope
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (key === undefined || key === "") {
    throw new Error(
      "Live judging requires GOOGLE_GENERATIVE_AI_API_KEY (the same key @howells/motif-sdk's Google image adapter reads)."
    );
  }
  return key;
};

/** The exact message shape sent to `generateText` — split out so a test can
 * assert its content (the base64/data-URI rule) without invoking the AI SDK
 * or the network. `imagePart.data` is whatever `@motif/bench-core/judge`'s
 * `judgeSample` already built it as (a raw `Buffer` off local disk, never a
 * base64 string or a `data:` URI — that guarantee is `bench-core`'s, tested
 * in `judge.test.ts`); this function only has to not undo it, which it
 * cannot: it forwards the `FilePart` object as-is. */
export const buildJudgeMessages = (
  imagePart: Parameters<JudgeModelClient["generateJudgeText"]>[0]["imagePart"],
  prompt: string
): ModelMessage[] => [
  {
    content: [{ text: prompt, type: "text" }, imagePart],
    role: "user",
  },
];

const buildLiveJudgeModelClient = (): JudgeModelClient => ({
  generateJudgeText: async ({ imagePart, prompt, signal }) => {
    const model = createGoogleGenerativeAI({ apiKey: googleApiKey() })(
      JUDGE_MODEL_ID
    );
    const result = await generateText({
      abortSignal: signal,
      messages: buildJudgeMessages(imagePart, prompt),
      model,
    });
    return result.text;
  },
});

const INCONCLUSIVE_NO_IMAGE: EngineJudgment = {
  critique: null,
  errorCode: "IMAGE_READ_FAILED",
  levels: null,
  overall: null,
  overallLevel: null,
  status: "inconclusive",
};

const buildLiveJudgment = async (
  input: EngineJudgmentInput
): Promise<EngineJudgment> => {
  if (input.imagePath === null) {
    return INCONCLUSIVE_NO_IMAGE;
  }
  const result = await judgeSample(buildLiveJudgeModelClient(), {
    imagePath: input.imagePath,
    prompt: input.prompt,
  });
  return result.status === "scored"
    ? {
        critique: result.critique,
        errorCode: null,
        levels: result.levels,
        overall: result.overall,
        overallLevel: result.overallLevel,
        status: "scored",
      }
    : {
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
 * empty: the live engine cannot exist without it. `repository.ts` is the
 * only caller, and only when `BENCH_MOCK=0`. */
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
    buildJudgment: buildLiveJudgment,
    isMock: false,
    judgeModelLabel: JUDGE_MODEL_ID,
  };
};
