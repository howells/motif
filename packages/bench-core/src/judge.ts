import { readFile } from "node:fs/promises";
import path from "node:path";

import type { FilePart } from "ai";

/**
 * Blind absolute-scoring vision judge for one generated room image.
 *
 * Deliberately **not** a Mastra `createScorer` — scorer judge steps are
 * text-prompt shaped and multimodal input is undocumented for them, and
 * materialdesk independently reached the same conclusion (zero `createScorer`
 * usage; its judging lives in `packages/vision/src/judge-render.ts`, the
 * precedent this module's maths is ported from — `docs/arc/bench/BRIEF.md`
 * precedent table).
 *
 * Blind by construction, not by convention: nothing in this module ever
 * accepts a model alias, a model name, or a price. `judgeSample`'s signature
 * is `(client, { imagePath, prompt, signal })` — there is no field to smuggle
 * an identifying label through, so the prompt handed to the judge model
 * (`buildJudgePrompt`) can never mention which model produced the image.
 *
 * The base64 rule (`BRIEF.md` rule 1, and the team lead's brief: "the single
 * most important constraint in this task"): the image reaches the judge
 * model as an AI SDK `FilePart` whose `data` is the raw `Buffer` read off
 * local disk — never a base64-encoded *string*, never a `data:` URI. A
 * `Buffer` is binary, not text; it cannot leak into a span or a log the way a
 * base64 string or a data URI can (the documented 26-second Langfuse
 * regression this whole rule traces back to).
 *
 * `bench-core` owns every `fetch`, file write, and fal call
 * (`BRIEF.md` rule 4) — this module's one piece of I/O, `readFile`, is the
 * judge's equivalent of `execute.ts`'s disk write, which is why (like
 * `execute.ts`) it is reached through its own subpath (`@motif/bench-core
 * /judge`, see `package.json`) rather than the pure `index.ts` barrel: a
 * dry-run preview or the align-params/cost-cap/aggregate consumers never need
 * to pull in Node's `fs` surface.
 *
 * No `zod` here: `bench-core` has never taken a runtime-validation dependency
 * (`align-params.ts` and `execute.ts` both validate by hand), so the
 * loose-parse-then-normalise step below is hand-rolled the same way, not a
 * zod schema. `ai` is a real dependency, though — `FilePart`'s exact shape
 * matters (rule 1), so it is the SDK's own type, not a hand-rolled lookalike
 * that could drift.
 */

// ---------------------------------------------------------------------------
// Rubric vocabulary
// ---------------------------------------------------------------------------

/** Same four ordinal levels as materialdesk's `judge-render.ts` — no raw
 * numeric score is ever requested from the model. */
export type QualityLevel = "competent" | "editorial" | "slop" | "stock";

/** Room-generation rubric criteria, alphabetical. */
export const ROOM_RUBRIC_CRITERIA = [
  "artifacts",
  "lightingCoherence",
  "materialFidelity",
  "photorealism",
  "promptAdherence",
  "spatialPlausibility",
] as const;
export type RoomRubricCriterion = (typeof ROOM_RUBRIC_CRITERIA)[number];

export type RoomJudgeLevels = Record<RoomRubricCriterion, QualityLevel>;

/**
 * Rubric id + version. `bench_judgments` (`bench-db/src/schema.ts`) is
 * unique on `(sample, judge, rubric, version)`, so re-judging a sample under
 * the same id+version upserts the row instead of duplicating it, and old
 * scores stay comparable until a version bump is made deliberately — bump
 * `ROOM_RUBRIC_VERSION` alongside any change to the criteria list, the
 * weights, or the prompt wording, so a mixed-version comparison can never
 * happen silently.
 */
export const ROOM_RUBRIC_ID = "bench-room-v1";
export const ROOM_RUBRIC_VERSION = 1;

/** Same numeric scale as materialdesk's `judge-render.ts` `QUALITY_LEVEL_SCORE`
 * — `slop` is 0 so it naturally dominates a product-based mean; the explicit
 * slop gate in `weightedGeometricMeanWithSlopGate` below makes that gating
 * behavior a stated rule rather than an accidental consequence of the scale. */
const QUALITY_LEVEL_SCORE: Record<QualityLevel, number> = {
  competent: 3,
  editorial: 4,
  slop: 0,
  stock: 1,
};

export const qualityLevelScore = (level: QualityLevel): number =>
  QUALITY_LEVEL_SCORE[level];

/**
 * Criterion weights for the weighted geometric mean. `promptAdherence`,
 * `photorealism`, and `artifacts` carry 1.5x weight — of the six criteria,
 * these three are the most decisive for "does this read as an obvious AI
 * image", which is the practical question a benchmark viewer cares about
 * first. `lightingCoherence`, `spatialPlausibility`, and `materialFidelity`
 * are supporting realism signals, weighted 1x.
 *
 * This is a documented judgment call, not a measurement — no labeled dataset
 * exists yet to tune against. Revisit once real judged runs give a signal.
 */
export const ROOM_RUBRIC_WEIGHTS: Record<RoomRubricCriterion, number> = {
  artifacts: 1.5,
  lightingCoherence: 1,
  materialFidelity: 1,
  photorealism: 1.5,
  promptAdherence: 1.5,
  spatialPlausibility: 1,
};

/**
 * Weighted geometric mean of the six criterion scores, gated to 0 if *any*
 * criterion was scored `slop` — "copy materialdesk's maths" (the team lead's
 * brief), generalized from `judge-render.ts`'s two-criterion
 * `Math.sqrt(alignment * perceptual) * slopGate` to N weighted criteria via
 * `exp(sum(weight * ln(score)) / sum(weight))`.
 *
 * The slop gate is kept as an explicit final multiplier rather than relying
 * on `slop`'s score of 0 to zero the product on its own: with `Math.log`,
 * `log(0) = -Infinity`, and a future zero-weighted criterion would turn
 * `weight * -Infinity` into `NaN` (`0 * Infinity`). `MIN_LOG_SCORE` clamps
 * every log input away from zero so the geometric mean itself is always
 * finite, and the explicit `slopGate` multiplier is what actually enforces
 * "any slop criterion gates the whole score to 0" — decoupled from the scale
 * so a future rescoring of `QUALITY_LEVEL_SCORE` can't silently remove the
 * gate.
 */
const MIN_LOG_SCORE = 1e-6;

export const weightedGeometricMeanWithSlopGate = (
  levels: RoomJudgeLevels,
  weights: Record<RoomRubricCriterion, number>
): number => {
  let weightedLogSum = 0;
  let totalWeight = 0;
  let hasSlop = false;

  for (const criterion of ROOM_RUBRIC_CRITERIA) {
    const level = levels[criterion];
    const weight = weights[criterion];
    if (level === "slop") {
      hasSlop = true;
    }
    weightedLogSum +=
      weight * Math.log(Math.max(qualityLevelScore(level), MIN_LOG_SCORE));
    totalWeight += weight;
  }

  const geometricMean = Math.exp(weightedLogSum / totalWeight);
  const slopGate = hasSlop ? 0 : 1;
  return geometricMean * slopGate;
};

/** Buckets a numeric overall score back into one of the four level words —
 * used only for the telemetry-facing `bench.quality_level` span attribute
 * (`bench-mastra/src/safe-attributes.ts`); `bench_judgments.overall` always
 * stores the raw float. Thresholds sit at the midpoints between
 * `QUALITY_LEVEL_SCORE`'s four values (0, 1, 3, 4). */
export const qualityLevelForScore = (overall: number): QualityLevel => {
  if (overall < 0.5) {
    return "slop";
  }
  if (overall < 2) {
    return "stock";
  }
  if (overall < 3.5) {
    return "competent";
  }
  return "editorial";
};

// ---------------------------------------------------------------------------
// Loose-parse-then-normalise
// ---------------------------------------------------------------------------

export interface RoomJudgeVerdict {
  readonly critique: string;
  readonly levels: RoomJudgeLevels;
}

const scalarToString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
};

const normalizeToken = (value: string): string =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");

/** Conservative middle level for a field the model omitted or answered
 * unrecognizably — never defaults up to `editorial`, since sloppy output
 * should never be silently credited as the best outcome. */
const FALLBACK_LEVEL: QualityLevel = "stock";

const normalizeQualityLevel = (
  value: unknown,
  fallback: QualityLevel = FALLBACK_LEVEL
): QualityLevel => {
  const token = normalizeToken(scalarToString(value) ?? "");
  if (token.includes("editorial") || token.includes("excellent")) {
    return "editorial";
  }
  if (token.includes("competent") || token.includes("good")) {
    return "competent";
  }
  if (token.includes("stock") || token.includes("generic")) {
    return "stock";
  }
  if (
    token.includes("slop") ||
    token.includes("bad") ||
    token.includes("fail")
  ) {
    return "slop";
  }
  return fallback;
};

/** Strips a markdown code fence, if present, around a JSON blob. */
const unfenceJsonText = (text: string): string => {
  const trimmed = text.trim();
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/iu.exec(trimmed);
  const fenceBody = fenceMatch?.[1];
  return (
    fenceBody !== undefined && fenceBody.trim().length > 0 ? fenceBody : trimmed
  ).trim();
};

/** Finds the first balanced `{...}` object in (possibly fenced, possibly
 * preamble-prefixed) model output. Returns `null` if none is found — the
 * only way `parseJudgeVerdictText` fails outright. */
const extractFirstJsonObject = (text: string): string | null => {
  const unfenced = unfenceJsonText(text);
  const start = unfenced.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < unfenced.length; index += 1) {
    const char = unfenced[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return unfenced.slice(start, index + 1);
      }
    }
  }
  return null;
};

/**
 * Loose-parse-then-normalise: accepts sloppy model output (wrong case,
 * synonyms, markdown fences, a preamble before the JSON, missing fields) and
 * always returns a fully-populated, strict `RoomJudgeVerdict` — never throws
 * on formatting. Returns `null` only when no JSON object could be found at
 * all, which the caller maps to `INVALID_VERDICT`.
 */
export const parseJudgeVerdictText = (
  text: string
): RoomJudgeVerdict | null => {
  const jsonText = extractFirstJsonObject(text);
  if (jsonText === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  // The `typeof ... === "object" && !== null` check above proves `parsed` is
  // a non-null object, but not that its values are `unknown` rather than
  // something narrower — `Record<string, unknown>` is the loosest possible
  // reading of "some object", which is exactly what a loose-parse step wants.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowed by the object/null check directly above; every read of `record` below goes through `normalizeQualityLevel`/`scalarToString`, which treat the value as `unknown` regardless
  const record = parsed as Record<string, unknown>;

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- built from `ROOM_RUBRIC_CRITERIA` itself, so every key of `RoomJudgeLevels` is present; `normalizeQualityLevel` guarantees each value is a `QualityLevel`
  const levels = Object.fromEntries(
    ROOM_RUBRIC_CRITERIA.map((criterion) => [
      criterion,
      normalizeQualityLevel(record[criterion]),
    ])
  ) as RoomJudgeLevels;

  return {
    critique:
      scalarToString(record.critique) ??
      "No critique provided by the judge model.",
    levels,
  };
};

// ---------------------------------------------------------------------------
// Image part construction — the base64 rule lives here
// ---------------------------------------------------------------------------

const JPEG_MEDIA_TYPE = "image/jpeg";
const IMAGE_MEDIA_TYPE_BY_EXTENSION: Record<string, string> = {
  gif: "image/gif",
  jpeg: JPEG_MEDIA_TYPE,
  jpg: JPEG_MEDIA_TYPE,
  png: "image/png",
  webp: "image/webp",
};

const mediaTypeForImagePath = (imagePath: string): string => {
  const extension = path.extname(imagePath).slice(1).toLowerCase();
  return IMAGE_MEDIA_TYPE_BY_EXTENSION[extension] ?? JPEG_MEDIA_TYPE;
};

/**
 * Reads the sample image off local disk and wraps it as an AI SDK `FilePart`
 * whose `data` is the raw `Buffer` — never a base64-encoded string, never a
 * `data:` URI (`BRIEF.md` rule 1; the team lead's brief: "the single most
 * important constraint in this task"). `Buffer` is one of `FilePart.data`'s
 * documented types (`DataContent = string | Uint8Array | ArrayBuffer |
 * Buffer`, `@ai-sdk/provider-utils`) — this is the SDK's own supported path,
 * not a workaround.
 */
const buildJudgeImagePart = async (imagePath: string): Promise<FilePart> => {
  const bytes = await readFile(imagePath);
  return {
    data: bytes,
    mediaType: mediaTypeForImagePath(imagePath),
    type: "file",
  };
};

const buildJudgePrompt = (prompt: string): string =>
  `You are a blind quality judge for a single AI-generated room-interior image. You do not know which model produced this image and must not try to guess — judge only what you can see.

The image was generated from this brief:
"${prompt}"

Score EACH of the following six criteria using exactly one of these four level words: editorial, competent, stock, slop.
- promptAdherence: does the image match the brief above?
- photorealism: does it read as a real photograph, not an obviously synthetic render?
- artifacts: is it free of AI artifacts (warped geometry, garbled text, melted objects, impossible joins)?
- lightingCoherence: is the lighting physically consistent — one coherent light direction, believable shadows and reflections?
- spatialPlausibility: is the room's geometry and furniture arrangement physically plausible?
- materialFidelity: do materials (wood, fabric, metal, stone) look like their real-world counterparts, not painted-on textures?

Reason briefly to yourself, then output exactly one JSON object and nothing else (no markdown fences, no prose before or after) with exactly these keys:
{"promptAdherence": "...", "photorealism": "...", "artifacts": "...", "lightingCoherence": "...", "spatialPlausibility": "...", "materialFidelity": "...", "critique": "one or two sentences"}`;

// ---------------------------------------------------------------------------
// judgeSample
// ---------------------------------------------------------------------------

/** Closed error vocabulary for a judge attempt — mirrors `execute.ts`'s
 * `ExecuteErrorCode` in spirit (provider text never survives to the return
 * value), sized to the ways a judge call specifically can fail. */
export type JudgeErrorCode =
  | "IMAGE_READ_FAILED"
  | "INVALID_VERDICT"
  | "JUDGE_UNAVAILABLE"
  | "TIMEOUT";

export interface ScoredJudgment {
  readonly critique: string;
  readonly levels: RoomJudgeLevels;
  readonly overall: number;
  readonly overallLevel: QualityLevel;
  readonly rubricId: string;
  readonly rubricVersion: number;
  readonly status: "scored";
}

export interface InconclusiveJudgment {
  readonly errorCode: JudgeErrorCode;
  readonly status: "inconclusive";
}

/** Failure is always `{ status: "inconclusive", errorCode }`, never a thrown
 * error — a judge that dies must not fail the run (team lead's brief). */
export type JudgmentResult = InconclusiveJudgment | ScoredJudgment;

export interface JudgeModelCallInput {
  readonly imagePart: FilePart;
  readonly prompt: string;
  readonly signal?: AbortSignal;
}

/**
 * The seam a real vision-model call is injected through — structurally
 * narrow, the same shape as `execute.ts`'s `GenerationClient`, so tests never
 * touch a real vision model (team lead's brief: "mock only... inject the
 * model client"). A real implementation (a later phase's job) wraps `ai`'s
 * `generateText` with a real `LanguageModel`; this package ships no such
 * implementation, only the interface and a mock (`bench-mastra/src
 * /executors.ts`'s `mockJudgeExecutor`, mirroring `mockGenerationExecutor`).
 */
export interface JudgeModelClient {
  readonly generateJudgeText: (input: JudgeModelCallInput) => Promise<string>;
}

export interface JudgeSampleInput {
  readonly imagePath: string;
  readonly prompt: string;
  readonly signal?: AbortSignal;
}

const isAbortError = (error: unknown): boolean =>
  (error instanceof Error && error.name === "AbortError") ||
  (error instanceof Error && /\babort/iu.test(error.message));

/**
 * Judges one image against the room rubric. Never throws: every failure mode
 * (unreadable image, a client that throws or times out, unparseable model
 * output) resolves to `{ status: "inconclusive", errorCode }` instead.
 *
 * `input` deliberately carries no model alias, model name, or price — see
 * this module's header comment. `client.generateJudgeText` receives only the
 * image bytes and the rubric prompt built from `input.prompt` (the original
 * generation brief), never anything identifying which model produced the
 * image.
 */
export const judgeSample = async (
  client: JudgeModelClient,
  input: JudgeSampleInput
): Promise<JudgmentResult> => {
  let imagePart: FilePart;
  try {
    imagePart = await buildJudgeImagePart(input.imagePath);
  } catch {
    return { errorCode: "IMAGE_READ_FAILED", status: "inconclusive" };
  }

  let text: string;
  try {
    text = await client.generateJudgeText({
      imagePart,
      prompt: buildJudgePrompt(input.prompt),
      signal: input.signal,
    });
  } catch (error) {
    return {
      errorCode: isAbortError(error) ? "TIMEOUT" : "JUDGE_UNAVAILABLE",
      status: "inconclusive",
    };
  }

  const verdict = parseJudgeVerdictText(text);
  if (verdict === null) {
    return { errorCode: "INVALID_VERDICT", status: "inconclusive" };
  }

  const overall = weightedGeometricMeanWithSlopGate(
    verdict.levels,
    ROOM_RUBRIC_WEIGHTS
  );

  return {
    critique: verdict.critique,
    levels: verdict.levels,
    overall,
    overallLevel: qualityLevelForScore(overall),
    rubricId: ROOM_RUBRIC_ID,
    rubricVersion: ROOM_RUBRIC_VERSION,
    status: "scored",
  };
};
