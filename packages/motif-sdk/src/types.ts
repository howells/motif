import type { CreativeDirection } from "./creative";
import type { FalToolPrice, ScaleRange } from "./tool-types";

/** ─── Model Types ─────────────────────────────────────────────── */

export type AspectRatio =
  | "auto"
  | "8:1"
  | "4:1"
  | "21:9"
  | "16:9"
  | "3:2"
  | "4:3"
  | "5:4"
  | "1:1"
  | "4:5"
  | "3:4"
  | "2:3"
  | "9:16"
  | "1:4"
  | "1:8";

export type Resolution = "0.5K" | "1K" | "2K" | "4K";

export type ModelType = "generation" | "utility" | "video";
/** `gif` is an animation and `svg` a vector image, on the Models that make them. */
export type ImageOutputFormat = "jpeg" | "png" | "webp" | "gif" | "svg";
export type BackgroundMode = "auto" | "transparent" | "opaque";
export type ImageQuality = "auto" | "low" | "medium" | "high" | "xhigh" | "max";
export type ThinkingLevel = "minimal" | "high";
export type GptImageSize = "auto" | "1024x1024" | "1536x1024" | "1024x1536";
export type FalImageSizePreset =
  | "auto"
  | "square_hd"
  | "square"
  | "portrait_4_3"
  | "portrait_16_9"
  | "landscape_4_3"
  | "landscape_16_9";
export interface CustomImageSize {
  height: number;
  width: number;
}
/** Limits an endpoint puts on an exact `{ width, height }` image size. */
export interface ImageSizeBounds {
  /** Largest width or height over smallest, e.g. 3 for 3:1. */
  maxRatio?: number;
  maxEdge?: number;
  maxPixels?: number;
  minEdge?: number;
  minPixels?: number;
  /** Both edges must be multiples of this. Motif uses 16 when absent. */
  multipleOf?: number;
}
export type ImageSize = GptImageSize | FalImageSizePreset | CustomImageSize;

/** How the model accepts image dimensions */
export type SizeMode = "aspect_ratio" | "image_size_enum" | "gpt_size" | "none";

export type QualityTier = "good" | "better" | "best" | "frontier";
export type SpeedTier = "fast" | "balanced" | "slow" | "very_slow" | "unknown";
export type PriceTier =
  | "budget"
  | "standard"
  | "premium"
  | "ultra"
  | "variable";

export interface FalPricing {
  checkedAt: string;
  currency: "USD";
  endpointId: string;
  estimatedCostPerImageUsd?: number;
  source: "fal-pricing-api";
  unit: string;
  unitPrice: number;
}

export interface LeaderboardMetric {
  elo: number;
  rank: number;
  winRate?: number;
}

export interface ModelBenchmark {
  artificialAnalysis?: {
    editing?: LeaderboardMetric;
    sourceUrls: string[];
    snapshotDate: string;
    textToImage?: LeaderboardMetric;
  };
  speed?: {
    medianSeconds?: number;
    p95Seconds?: number;
    source: "artificial-analysis-models";
  };
  tiers?: {
    price: PriceTier;
    quality: QualityTier;
    speed: SpeedTier;
  };
  useCase?: string;
}

export interface ModelConfig {
  benchmark?: ModelBenchmark;
  /**
   * The fal endpoint's `image_size` also takes an exact `{ width, height }`,
   * within these limits read from fal's OpenAPI schema. Absent means only the
   * named presets are sent. Only meaningful with `sizeMode: "image_size_enum"`.
   */
  customImageSize?: ImageSizeBounds;
  /** Explicit fal streaming support for generation and edit routes. */
  streaming?: { generation: boolean; edit: boolean };
  editEndpoint?: string;
  editImagesField?: "image_urls" | "image_url";
  endpoint: string;
  falPricing?: FalPricing;
  maxReferenceImages?: number;
  name: string;
  pricing: string;
  /** Upscale factor fal applies when none is sent. */
  defaultScale?: number;
  /** Makes audio unless `params: { generate_audio: false }`; priced with it. */
  generatesAudio?: true;
  /** Keys of the fal response that hold files, where the Model does not return `images`. */
  outputKeys?: readonly string[];
  /** Typed rate for a Model priced outside `pricePerImageUsd`. */
  price?: FalToolPrice;
  /** Upscale factors the endpoint takes, from its fal OpenAPI schema. */
  scaleRange?: ScaleRange;
  /** Body key for the upscale factor. */
  scaleField?: "scale_factor" | "upscale_factor";
  /** Body key the start frame goes under, on a video Model. */
  startFrameField?: "image_url" | "start_image_url";
  /** Takes a prompt that steers the result. */
  supportsPrompt?: true;
  /** Null means token-metered with no per-image estimate. */
  pricePerImageUsd?: number | null;
  /** How this model accepts dimensions (default: "aspect_ratio") */
  sizeMode?: SizeMode;
  supportsAspect: boolean;
  /**
   * The aspect ratios fal's `aspect_ratio` enum accepts, where it is narrower
   * than `ASPECT_RATIOS`. Absent means every ratio is accepted.
   */
  supportedAspects?: readonly AspectRatio[];
  /** The resolutions fal's `resolution` enum accepts, where it is narrower than `RESOLUTIONS`. */
  supportedResolutions?: readonly Resolution[];
  supportsBackground?: boolean;
  supportsEdit: boolean;
  supportsExpandPrompt?: boolean;
  supportsGuidanceScale?: boolean;
  supportsGoogleSearch?: boolean;
  supportsInferenceSteps?: boolean;
  supportsLimitGenerations?: boolean;
  supportsMaskImage?: boolean;
  maskImageField?: "mask_image_url" | "mask_url";
  /**
   * Takes `markup_image_url`: a transparent PNG of annotations (circles,
   * arrows, notes) the size of the first edit image, guiding its edit.
   */
  supportsMarkupImage?: boolean;
  /**
   * An edit with no aspect asked for sends `image_size: "auto"`, so the
   * result keeps the edited image's shape. For Models whose fal edit
   * endpoint takes `auto`.
   */
  autoEditSize?: boolean;
  supportsNegativePrompt?: boolean;
  /** Most images one request makes, from the endpoint's `num_images` schema. Set wherever `supportsNumImages` is. */
  maxCount?: number;
  /** Output formats that make one image whatever `num_images` says. */
  singleImageFormats?: readonly ImageOutputFormat[];
  supportsNumImages: boolean;
  supportsOutputFormat?: boolean;
  /**
   * The one format an endpoint with no `output_format` parameter always
   * returns (Ideogram V3 Transparent: png). Asking for it is accepted, and
   * nothing is sent.
   */
  fixedOutputFormat?: ImageOutputFormat;
  /** Formats the Model returns. Absent means jpeg, png and webp. */
  supportedOutputFormats?: readonly ImageOutputFormat[];
  /** Formats an edit returns, where they differ from `supportedOutputFormats`. */
  supportedEditOutputFormats?: readonly ImageOutputFormat[];
  supportsQuality?: boolean;
  /** Default matching the quality variant used in this Model's ranking. */
  defaultQuality?: ImageQuality;
  supportedQualities?: readonly ImageQuality[];
  supportsRenderingSpeed?: boolean;
  supportsResolution: boolean;
  supportsSafetyTolerance?: boolean;
  supportsSafetyChecker?: boolean;
  supportsSeed?: boolean;
  supportsSyncMode?: boolean;
  supportsThinkingLevel?: boolean;
  supportsWebSearch?: boolean;
  /**
   * The endpoint only makes transparent images and takes no `background`
   * parameter (Ideogram V3 Transparent). Every output has an alpha channel.
   */
  transparentOutput?: boolean;
  /** fal's `resolution` enum is lower case ("1k"), not Motif's "1K". */
  lowercaseResolution?: true;
  type: ModelType;
  /** Use fal queue submit/status/result even for generate() calls. */
  useQueue?: boolean;
}

/** ─── Generation Types ───────────────────────────────────────── */

export interface GenerateOptions {
  aspect?: AspectRatio;
  /** GPT background mode where supported */
  background?: BackgroundMode;
  /**
   * Motif prompt enrichment choices applied before fal request construction.
   *
   * These options are not sent to fal directly; they append validated creative
   * clauses to `prompt` and are omitted from the final request body.
   */
  creative?: CreativeDirection;
  editImageUrls?: string[];
  /** Ask fal not to store IO payloads, and expose request ids for deletion. */
  ephemeral?: boolean;
  /** Google-search alias for fal models that expose enable_google_search */
  enableGoogleSearch?: boolean;
  /** fal safety checker toggle where supported */
  enableSafetyChecker?: boolean;
  /** Enable web search for generative context where supported */
  enableWebSearch?: boolean;
  /** Enable MagicPrompt expansion (ideogram only) */
  expandPrompt?: boolean;
  /** CFG guidance scale where supported */
  guidanceScale?: number;
  /** Direct fal image_size override, including custom {width,height} where supported */
  imageSize?: ImageSize;
  inputFidelity?: "low" | "high";
  /** Nano Banana 2 generation limiting toggle */
  limitGenerations?: boolean;
  /** Mask image URL for inpainting/editing where supported */
  maskImageUrl?: string;
  /** Markup image URL guiding an edit of the first edit image, where supported */
  markupImageUrl?: string;
  model: string;
  /** What NOT to include in the image (ideogram only) */
  negativePrompt?: string;
  numImages?: number;
  /** Number of diffusion inference steps where supported */
  numInferenceSteps?: number;
  /** Output image format (default: model-dependent) */
  outputFormat?: ImageOutputFormat;
  prompt: string;
  /** GPT/OpenAI quality where supported */
  quality?: ImageQuality;
  /** Speed vs. quality trade-off (ideogram only) */
  renderingSpeed?: "TURBO" | "BALANCED" | "QUALITY";
  resolution?: Resolution;
  /** Safety tolerance level "1"–"6", where "1" is strictest */
  safetyTolerance?: string;
  /** Reproducible generation seed */
  seed?: number;
  /** Return media as data URI where supported */
  syncMode?: boolean;
  /** Nano Banana 2 thinking mode */
  thinkingLevel?: ThinkingLevel;
  transparent?: boolean;
}

/** ─── Queue Types ────────────────────────────────────────────── */

export interface JobStatus {
  error?: string;
  logs?: { message: string; timestamp: string }[];
  queuePosition?: number;
  status: "queued" | "processing" | "completed" | "failed";
}

/** A run accepted by the fal queue, as the handle to poll and read it. */
export interface QueuedJob {
  endpoint: string;
  requestId: string;
}

/** ─── Configuration ──────────────────────────────────────────── */

/** The network seam: a `fetch`-shaped function. */
export type FalFetch = (url: string, init: RequestInit) => Promise<Response>;
