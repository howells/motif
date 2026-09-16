// Types for the FAL_TOOLS registry, split out so the registry data in
// `./tool-registry/*` and the public module `./tools` can both import them
// without a cycle. Types only: no data, no functions. `./tools` re-exports
// every type here, so consumers keep importing from `./tools`.

export type FalToolInputKind = "image" | "images" | "video";

/**
 * Machine-readable cost, so `--dry-run` can emit a number rather than the
 * prose in `pricing`. Required on every entry: a missing price is what makes
 * an agent unable to budget across a registry spanning $0.001 to $0.48.
 */
export type FalToolPrice =
  | {
      kind: "call";
      usd: number;
      /** `usd` is per output image, multiplied by the body's `num_images`. */
      perImage?: true;
      /**
       * USD added when the request body sets a boolean key true, for options
       * fal bills on top of the call, such as rigging a mesh.
       */
      extras?: Readonly<Record<string, number>>;
      /**
       * Body keys `usd` is multiplied by: an array by its length, a number by
       * its value, an absent key by 1. Smart Resize bills each target size.
       */
      per?: readonly string[];
      /** USD added once per request, such as a vision analysis fee. */
      fee?: number;
      /** Multipliers by a body key's value: `{ resolution: { "4K": 2 } }`. */
      multipliers?: Readonly<Record<string, Readonly<Record<string, number>>>>;
    }
  | { kind: "megapixel"; usd: number }
  /**
   * `usd` for every started `megapixels` of each output, at least one step:
   * Topaz bills $0.08 for any output up to 24MP, not $0.08/24 per megapixel.
   */
  | { kind: "megapixel-step"; megapixels: number; usd: number }
  /**
   * FLUX.2 pricing: `first` for the first megapixel of output, then `extra`
   * for every further megapixel of input and output, each rounded up.
   */
  | { kind: "megapixel-first"; extra: number; first: number }
  /**
   * PBR material maps: `base` per request, `perMegapixel` per megapixel of
   * the material, `perMapMegapixel` per megapixel of each map, and an
   * `upscale` surcharge per pre-upscale megapixel per map, keyed by factor.
   */
  | {
      kind: "maps";
      base: number;
      perMapMegapixel: number;
      perMegapixel: number;
      upscale?: Readonly<Record<string, number>>;
    }
  /** Per second of source video; per compute-second when the input is not a video. */
  | { kind: "second"; usd: number }
  /**
   * Per second of output video, tiered by the output's shorter side:
   * `tiers` in ascending `upTo` lines, the last with no `upTo`. Doubled at
   * `doubleAtFps` or above, halved when the body's `model` is `halfWithModel`.
   */
  | {
      kind: "video-second";
      doubleAtFps?: number;
      halfWithModel?: string;
      tiers: readonly { upTo?: number; usd: number }[];
    }
  /** `usd` for every started `frames` frames of source video. */
  | { kind: "frames"; frames: number; usd: number }
  /**
   * Per million input and output tokens. fal bills the tokens a run used,
   * so a projection needs `inputTokens` and `outputTokens` estimates.
   */
  | {
      kind: "token";
      inputPerMillion: number;
      inputTokens: number;
      outputPerMillion: number;
      outputTokens: number;
    }
  | { kind: "metered" };

export interface FalToolConfig {
  category:
    | "3d"
    | "analysis"
    | "background"
    | "depth"
    | "erase"
    | "layers"
    | "material"
    | "moderation"
    | "preprocess"
    | "reframe"
    | "relight"
    | "restoration"
    | "restyle"
    | "segmentation"
    | "try-on"
    | "upscale"
    | "vector";
  defaultOptions?: Record<string, unknown>;
  description: string;
  endpoint: string;
  inputField:
    | "content_image_url"
    | "image_url"
    | "image_urls"
    | "input_image_url"
    | "input_image_urls"
    | "person_image_url"
    | "video_url";
  inputKind: FalToolInputKind;
  name: string;
  outputKeys: string[];
  /**
   * Names for the positions of an array-valued output. Used to name downloaded
   * files: without it a PBR set lands as images-2.png, images-3.png and the
   * caller cannot tell a roughness map from a normal map.
   *
   * Two rule shapes, because the names come from two different places.
   *
   * Request-driven: `fromOption` names the request option that actually
   * determines the order — read the resolved request body first and use its
   * value when present, since a caller may reorder or subset it. `fallback` is
   * the endpoint's schema default, used when the option is absent.
   *
   * Response-driven: `fromItem` reads the name off each element of the output
   * array itself, for endpoints that label what they produced (seedream's
   * layer stack names every layer). `nameField` holds the name and
   * `orderField`, when set, holds a non-negative integer that prefixes it so
   * the files sort in stack order. These strings come from a model, so the
   * consumer slugifies them into a filename and keeps positional naming when
   * nothing usable survives.
   *
   * Whichever is used, check the label count against the URL count before
   * applying it: a mislabelled map is worse than a positional one, because it
   * reads as authoritative.
   *
   * Only set this where the order or the naming is actually determined — by a
   * request option, by the schema, or by the response. Leave genuinely
   * unordered, unnamed arrays unlabelled.
   */
  outputLabels?: Record<
    string,
    | { fallback: readonly string[]; fromOption?: string }
    | { fromItem: { nameField: string; orderField?: string } }
  >;
  price: FalToolPrice;
  pricing: string;
  /**
   * Body key for the one Reference the tool takes beside its Source: the style
   * a restyle copies, the garment in a try-on. Absent on tools that take none.
   */
  referenceField?: "product_image_url" | "style_image_url";
  /**
   * Endpoint routinely exceeds the 120s sync timeout; callers should use the
   * queue path.
   */
  queued?: true;
  sourceUrl: string;
  task: string;
}

export interface FalToolRunOptions {
  input?: string;
  inputs?: string[];
  options?: Record<string, unknown>;
  tool: string;
}

export interface FalToolRequest {
  body: Record<string, unknown>;
  endpoint: string;
  tool: FalToolConfig;
}
