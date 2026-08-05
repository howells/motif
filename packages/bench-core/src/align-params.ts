import {
  aspectToFalImageSize,
  aspectToGptSize,
  buildGenerateBody,
  MODELS,
} from "@howells/motif-sdk";
import type {
  GenerateOptions,
  GenerationModelName,
  ImageOutputFormat,
  ModelConfig,
  SizeMode,
} from "@howells/motif-sdk";

/**
 * Canonical, model-agnostic description of what we asked for. One of these is
 * shared by every model in a run — the whole point of the benchmark is that the
 * *request* is constant and only the model varies.
 */
export interface BenchSpec {
  /** Desired aspect. Coerced per model; the coercion is always recorded. */
  readonly aspect: "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "3:2" | "2:3";
  /** Preferred container format. Dropped where unsupported. */
  readonly outputFormat: ImageOutputFormat | null;
  readonly prompt: string;
  /** Requested resolution. Only reaches models that advertise support. */
  readonly resolution: "0.5K" | "1K" | "2K" | "4K";
  /** Base seed; per-sample seed is `seed + sampleIndex`. Null = let fal choose. */
  readonly seed: number | null;
}

/** Whether a model will accept an explicit container format. Two flags, not
 * one: `supportsOutputFormat` says the dial exists at all, and an optional
 * `supportedOutputFormats` narrows which values it accepts (undefined means
 * "any of them"). */
const acceptsOutputFormat = (
  config: ModelConfig,
  format: ImageOutputFormat
): boolean =>
  config.supportsOutputFormat === true &&
  (config.supportedOutputFormats === undefined ||
    config.supportedOutputFormats.includes(format));

/**
 * How many of `aliases` would actually receive `format`, and how many would
 * have it dropped.
 *
 * The composer needs this to tell you *before* you spend money that "png
 * reaches 14 of your 20 models" — and it has to be the same predicate
 * `alignParams` applies at dispatch, or the preview would promise a
 * standardisation the run does not deliver. Hence one shared
 * `acceptsOutputFormat` rather than a second copy of the flag logic in the
 * UI layer.
 */
export const outputFormatReach = (
  aliases: readonly GenerationModelName[],
  format: ImageOutputFormat
): { readonly dropped: number; readonly supported: number } => {
  let supported = 0;
  for (const alias of aliases) {
    const config: ModelConfig | undefined = MODELS[alias];
    if (config && acceptsOutputFormat(config, format)) {
      supported += 1;
    }
  }
  return { dropped: aliases.length - supported, supported };
};

/** A parameter we wanted to send but the model cannot accept. */
export interface DroppedParam {
  readonly param: string;
  readonly reason: string;
}

/** A parameter the SDK rewrites into a model-specific form before sending. */
export interface CoercedParam {
  readonly from: string;
  readonly param: string;
  readonly reason: string;
  readonly to: string;
}

/** A parameter neither we nor the spec set, but `buildGenerateBody` fills in. */
export interface AutoSetParam {
  readonly param: string;
  readonly reason: string;
  readonly value: string;
}

export interface AlignmentOk {
  readonly alias: GenerationModelName;
  readonly autoSet: readonly AutoSetParam[];
  /** The exact JSON fal will receive. Persisted verbatim as run provenance. */
  readonly body: Record<string, unknown>;
  readonly coerced: readonly CoercedParam[];
  readonly dropped: readonly DroppedParam[];
  readonly endpoint: string;
  readonly modelName: string;
  readonly ok: true;
  readonly options: GenerateOptions;
  readonly seedSent: number | null;
  readonly sizeMode: SizeMode;
  /** gpt2 only — its timings carry the queue's 3s polling granularity. */
  readonly usesQueue: boolean;
}

export interface AlignmentFailed {
  readonly alias: GenerationModelName;
  /** Never interpolated from provider text — see execute.ts's closed vocabulary. */
  readonly message: string;
  readonly modelName: string;
  readonly ok: false;
}

export type AlignmentResult = AlignmentFailed | AlignmentOk;

/**
 * Bump when the *behaviour* of alignment changes in a way that makes two runs
 * incomparable (a param starts/stops being sent, a coercion changes). Feeds
 * `cohortHash`, so old runs stop being averaged with new ones.
 */
export const ALIGNMENT_SCHEMA_VERSION = 1;

/**
 * Resolve a canonical spec into one model's concrete fal request.
 *
 * Driven entirely by the capability flags on `MODELS[alias]` — there is no
 * per-alias branching here, so adding a model to the SDK is enough to make it
 * benchmarkable. Every difference between what the spec asked for and what the
 * model receives is recorded in `dropped` / `coerced` / `autoSet` rather than
 * being silently applied, because those differences are exactly what makes a
 * cross-model comparison arguable.
 *
 * `buildGenerateBody` *throws* on any unsupported option (via the SDK-internal
 * `validateGenerateOptions`, which is not exported). The filtering below is
 * therefore a reimplementation of that validator's rules, and the two can drift.
 * The drift guard test in `align-params.test.ts` is what keeps them honest: for
 * every model × every capability flag it asserts that this function drops
 * exactly what `buildGenerateBody` would have rejected. The try/catch is a
 * backstop for drift we failed to anticipate, not the primary mechanism.
 */
export function alignParams(
  alias: GenerationModelName,
  spec: BenchSpec,
  sampleIndex: number
): AlignmentResult {
  const config: ModelConfig | undefined = MODELS[alias];
  if (!config) {
    return {
      alias,
      message: `No MODELS entry for alias "${alias}"`,
      modelName: alias,
      ok: false,
    };
  }

  const sizeMode: SizeMode = config.sizeMode ?? "aspect_ratio";
  const dropped: DroppedParam[] = [];
  const coerced: CoercedParam[] = [];
  const autoSet: AutoSetParam[] = [];

  const options: GenerateOptions = { model: alias, prompt: spec.prompt };

  // ── Aspect ────────────────────────────────────────────────────────────────
  // Three sizing dialects, one requested aspect. `none` (video models) cannot
  // express size at all; the other three each rewrite it differently, and the
  // rewrite is lossy — 3:2 and 5:4 both land on landscape_4_3, so the pixel
  // count a model actually returns is recorded from the image, never assumed.
  if (sizeMode === "none") {
    dropped.push({
      param: "aspect",
      reason: "model exposes no dimension control",
    });
  } else {
    options.aspect = spec.aspect;
    if (sizeMode === "gpt_size") {
      coerced.push({
        from: spec.aspect,
        param: "aspect",
        reason: "model accepts only GPT's three fixed sizes",
        to: aspectToGptSize(spec.aspect),
      });
    } else if (sizeMode === "image_size_enum") {
      coerced.push({
        from: spec.aspect,
        param: "aspect",
        reason: "model accepts only named fal size presets",
        to: aspectToFalImageSize(spec.aspect),
      });
    } else if (!config.supportsAspect) {
      // aspect_ratio dialect but the flag is off: buildGenerateBody silently
      // omits aspect_ratio from the body, so record it as dropped, not sent.
      dropped.push({
        param: "aspect",
        reason: "model uses aspect_ratio sizing but does not accept an aspect",
      });
    }
  }

  // ── Resolution ────────────────────────────────────────────────────────────
  // Only lands in the body for `aspect_ratio` models that advertise support.
  // Passing "2K" to a non-supporting model would not throw (the SDK special-
  // cases its own default) but would be a lie in the provenance record, so it
  // is dropped explicitly instead.
  if (config.supportsResolution) {
    options.resolution = spec.resolution;
  } else {
    dropped.push({
      param: "resolution",
      reason: "model has no resolution control; size comes from aspect alone",
    });
  }

  // ── Seed ──────────────────────────────────────────────────────────────────
  // Offset per sample so repeat samples of one model differ from each other
  // while staying reproducible across runs. Models without seed support are
  // flagged loudly: their variance across samples is irreducible, which changes
  // how their quality spread should be read.
  if (spec.seed !== null) {
    if (config.supportsSeed === true) {
      options.seed = spec.seed + sampleIndex;
    } else {
      dropped.push({
        param: "seed",
        reason: "model does not accept a seed — samples are not reproducible",
      });
    }
  }

  // ── Output format ─────────────────────────────────────────────────────────
  if (spec.outputFormat !== null) {
    const formatAllowed = acceptsOutputFormat(config, spec.outputFormat);

    if (formatAllowed) {
      options.outputFormat = spec.outputFormat;
    } else {
      dropped.push({
        param: "outputFormat",
        reason: config.supportedOutputFormats
          ? `model supports only ${config.supportedOutputFormats.join(", ")}`
          : "model has no output format control",
      });
    }
  }

  // ── Params the SDK sets for us ────────────────────────────────────────────
  // We never pass `quality`; buildGenerateBody forces "high" wherever the flag
  // is set. Recorded because it is a real difference between models — the ones
  // with a quality dial are being benchmarked at their top setting.
  if (config.supportsQuality === true) {
    autoSet.push({
      param: "quality",
      reason: "buildGenerateBody defaults quality to high where supported",
      value: "high",
    });
  }

  // ── Deliberately not set ──────────────────────────────────────────────────
  // guidanceScale, numInferenceSteps, style, negativePrompt, renderingSpeed,
  // raw, enhancePrompt, thinkingLevel, safetyTolerance, expandPrompt.
  // Only a handful of models expose each, so setting them would tune those
  // models and leave the rest at defaults — turning a model comparison into a
  // tuning comparison. Every model runs at fal's defaults; the report says so.
  //
  // syncMode is likewise never set: it returns a data URI instead of a URL,
  // which would blow up both the download timing and the observability spans.

  // numImages is left unset — buildGenerateBody defaults it to 1, and passing 1
  // explicitly is accepted by every model, so the default is the honest choice.

  try {
    const { body, endpoint } = buildGenerateBody(options);
    return {
      alias,
      autoSet,
      body,
      coerced,
      dropped,
      endpoint,
      modelName: config.name,
      ok: true,
      options,
      seedSent: options.seed ?? null,
      sizeMode,
      usesQueue: config.useQueue === true,
    };
  } catch (error) {
    // Backstop only — a hit here means capability flags and the SDK validator
    // have drifted and the drift guard test needs updating.
    return {
      alias,
      message: error instanceof Error ? error.message : "unknown build failure",
      modelName: config.name,
      ok: false,
    };
  }
}
