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
  | { kind: "call"; usd: number }
  | { kind: "megapixel"; usd: number }
  | { kind: "second"; usd: number }
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
    | "segmentation"
    | "upscale"
    | "vector";
  defaultOptions?: Record<string, unknown>;
  description: string;
  endpoint: string;
  inputField:
    | "image_url"
    | "image_urls"
    | "input_image_url"
    | "input_image_urls"
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
