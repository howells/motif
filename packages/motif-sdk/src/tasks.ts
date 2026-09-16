/**
 * The Task registry: every job Motif does, with the Models that can do it
 * ranked best-first and tagged with the Tier each belongs to.
 *
 * Rankings are data so a default change is visible in a pull request. A Task
 * ranked from the bench's human comparisons says `rankedFrom: "bench"`; every
 * other Task is hand-ranked from published quality numbers and fal price, and
 * says so. Today no Task is bench-ranked: the bench holds two human ratings,
 * both on one model, which is not an order.
 *
 * Model ids are the short aliases used everywhere else: a key of `MODELS` or
 * of `FAL_TOOLS`. `resolveTask` in `./resolve` is the only place a Model is
 * chosen from these lists.
 *
 * A Task can have modes: a variant of the job a caller names explicitly, such
 * as erasing text rather than an object. A ranked entry with a `mode` is only
 * chosen when the request names that mode; an entry without one only when it
 * names none. A Model can appear once per mode.
 */

import { MODELS } from "./models";

export const TIERS = ["fast", "balanced", "quality"] as const;

/** How far a Task trades cost and speed for quality. */
export type Tier = (typeof TIERS)[number];

export const DEFAULT_TIER: Tier = "balanced";

/** Where a Task's order came from. */
export type RankedFrom = "bench" | "hand";

/** Something a request needs that not every Model can honour. */
export type Capability =
  | "aspect"
  | "count"
  | "image"
  | "mask"
  | "negativePrompt"
  | "outputFormat"
  | "references"
  | "resolution"
  | "rig"
  | "seed"
  | "transparency"
  | "video";

export interface RankedModel {
  /** A key of `MODELS` or `FAL_TOOLS`. */
  readonly model: string;
  /** The Tier this Model is offered at. */
  readonly tier: Tier;
  /** The mode this entry serves. Absent for the Task's plain job. */
  readonly mode?: string;
  /** Capabilities this Model has for this Task beyond its registry profile. */
  readonly supports?: readonly Capability[];
  /** The Model works without a Source, such as a tile made from a prompt. */
  readonly sourceOptional?: true;
  /** Inputs the request must supply for this Model to be chosen, e.g. a mask. */
  readonly requires?: readonly Capability[];
}

export interface TaskMode {
  readonly id: string;
  /** One sentence: what this mode does differently. */
  readonly summary: string;
}

export interface TaskDefinition {
  /** One sentence: the job, in the words a caller would use. */
  readonly summary: string;
  /** What to use instead, naming the sibling Task. */
  readonly notFor: string;
  readonly rankedFrom: RankedFrom;
  /** ISO date the order was last set. */
  readonly rankedAt: string;
  /** How the order was decided, for the reviewer of the next change. */
  readonly basis: string;
  /** Named variants of the job. Every `mode` on a ranked entry is listed here. */
  readonly modes?: readonly TaskMode[];
  /** Best first. Order within a Tier is the order tried at that Tier. */
  readonly models: readonly RankedModel[];
}

const HAND_RANKED_AT = "2026-09-16";

const GENERATION_MODELS_RANKED: readonly RankedModel[] = [
  { model: "gpt2", tier: "quality" },
  { model: "banana2", tier: "quality" },
  { model: "gpt", tier: "quality" },
  { model: "sunburst", tier: "quality" },
  { model: "gemini3", tier: "quality" },
  { model: "mai-image-2.5-pro", tier: "quality" },
  { model: "seedream5", tier: "quality" },
  { model: "flux2-max", tier: "quality" },
  { model: "banana", tier: "balanced" },
  {
    model: "ideogram3-transparent",
    requires: ["transparency"],
    supports: ["transparency"],
    tier: "balanced",
  },
  { model: "flare", tier: "balanced" },
  { model: "banana2-lite", tier: "balanced" },
  { model: "qwen3", tier: "balanced" },
  { model: "seedream4", tier: "balanced" },
  { model: "flux2-flex", tier: "balanced" },
  { model: "ideogram4", tier: "balanced" },
  { model: "grok-image", tier: "balanced" },
  { model: "recraft4", tier: "balanced" },
  { model: "flux2-pro", tier: "balanced" },
  { model: "seedream45", tier: "balanced" },
  { model: "grok-image-2", tier: "balanced" },
  { model: "recraft41", tier: "balanced" },
  { model: "flux2-turbo", tier: "fast" },
  { model: "flux2-dev", tier: "fast" },
  { model: "flux-fast", tier: "fast" },
  { model: "seedream5-lite", tier: "fast" },
  { model: "gemini", tier: "fast" },
  { model: "qwen", tier: "fast" },
  { model: "ideogram", tier: "fast" },
  { model: "recraft", tier: "fast" },
  { model: "flux", tier: "fast" },
];

/** Every Task with a Model. A Task is absent here until it has at least one Model. */
export const TASKS = {
  animate: {
    basis:
      "Hand-ranked. Kling v3 Pro leads with audio, an end frame and a negative prompt at $0.112-$0.168/sec; Kling v3 Turbo Pro is the fast pick at $0.14/sec without them.",
    models: [
      { model: "kling", tier: "balanced" },
      { model: "kling-turbo", tier: "fast" },
    ],
    notFor: "A still image (generate), or variations of one (vary).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary: "Turn a still image into a short video clip.",
  },
  ask: {
    basis:
      "Hand-ranked. Moondream answers questions, captions, detects and points; GOT-OCR transcribes text; the NSFW classifier answers the safety question.",
    modes: [
      { id: "caption", summary: "Write a caption for the image." },
      { id: "detect", summary: "Return bounding boxes for a named thing." },
      {
        id: "point",
        summary: "Return a point on every instance of a named thing.",
      },
      { id: "read", summary: "Transcribe the text in the image." },
      { id: "safe", summary: "Say whether the image is safe for work." },
    ],
    models: [
      { model: "moondream-query", tier: "balanced" },
      { mode: "caption", model: "moondream-caption", tier: "balanced" },
      { mode: "detect", model: "moondream-detect", tier: "balanced" },
      { mode: "point", model: "moondream-point", tier: "balanced" },
      { mode: "read", model: "got-ocr", tier: "balanced" },
      { mode: "safe", model: "nsfw", tier: "balanced" },
    ],
    notFor: "Pixel masks of a named thing (segment).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary:
      "Answer a question about an image, caption it, count or find things in it.",
  },
  cutout: {
    basis:
      "Hand-ranked from fal price and edge quality: Bria for commercial-safe edges, BEN v2 and BiRefNet as the balanced picks, rembg as the cheap one. For video, Bria's VRMBG 3.0 ($0.05/sec) leads the older Bria remover ($0.14/sec).",
    models: [
      { model: "bria-rmbg", tier: "quality" },
      { model: "birefnet", tier: "balanced" },
      { model: "ben-v2", tier: "balanced" },
      { model: "rembg", tier: "fast" },
      { model: "bria-video-rmbg-v3", tier: "balanced" },
      { model: "bria-video-rmbg", tier: "balanced" },
    ],
    notFor:
      "Taking one object out and filling the gap (erase), or masking a named thing (segment).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary:
      "Remove the background behind the main subject of an image or video.",
  },
  erase: {
    basis:
      "Hand-ranked. Finegrain also removes shadows and reflections and costs ten times more, so it leads the quality tier only. With a mask, Bria's eraser leads and fal's mask remover is the balanced pick.",
    modes: [
      { id: "boxes", summary: "Remove whatever falls inside the given boxes." },
      { id: "text", summary: "Remove all rendered text." },
      {
        id: "with",
        summary: "Fill the masked region with something described in words.",
      },
    ],
    models: [
      { model: "finegrain-eraser", tier: "quality" },
      { model: "object-removal", tier: "balanced" },
      {
        model: "bria-eraser",
        requires: ["mask"],
        supports: ["mask"],
        tier: "quality",
      },
      {
        model: "object-removal-mask",
        requires: ["mask"],
        supports: ["mask"],
        tier: "balanced",
      },
      { mode: "boxes", model: "object-removal-bbox", tier: "balanced" },
      { mode: "text", model: "text-removal", tier: "balanced" },
      {
        mode: "with",
        model: "bria-genfill",
        requires: ["mask"],
        supports: ["mask"],
        tier: "balanced",
      },
    ],
    notFor: "The whole background (cutout), or extending the canvas (reframe).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary:
      "Remove an object, person, text or clutter from an image and fill the gap.",
  },
  generate: {
    basis:
      "Hand-ranked. Tiers set by fal price per image (quality ≥ $0.07, balanced $0.02-$0.15 with edit quality, fast ≤ $0.04); order within a tier by Artificial Analysis text-to-image Elo, snapshot 2026-08-23, unranked models last. banana leads balanced because it is the house default the looks are tuned on. Ideogram V3 Transparent follows it but is chosen only for a transparent request, so transparency needs no OpenAI key at balanced; token-metered Nano Banana 2 Lite sits in balanced by its Elo.",
    models: GENERATION_MODELS_RANKED,
    notFor:
      "Variations of an image you already have (vary), or a consistent set of images (series run).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary:
      "Make an image from a prompt, or change an image you pass as a reference.",
  },
  layers: {
    basis:
      "Hand-ranked. Qwen gives a set number of stacked RGBA layers; Seedream names and orders object layers; Ideogram separates text from artwork.",
    modes: [
      {
        id: "text",
        summary: "Separate the text from the artwork as editable text.",
      },
    ],
    models: [
      { model: "seedream-layerize", tier: "quality" },
      { model: "qwen-layered", tier: "balanced" },
      { mode: "text", model: "ideogram-layerize-text", tier: "balanced" },
    ],
    notFor:
      "Masking one named thing (segment), or removing the background (cutout).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary: "Split an image into transparent layers.",
  },
  map: {
    basis:
      "Hand-ranked. Depth is the plain job: Marigold for quality, Depth Anything v2 balanced, MiDaS fast. The other maps are modes, each with its own Models.",
    modes: [
      { id: "edges", summary: "A soft edge map." },
      { id: "lineart", summary: "A line-art map." },
      {
        id: "lines",
        summary: "Straight line segments, for architecture and interiors.",
      },
      { id: "metric", summary: "Metric depth, in real distances." },
      { id: "normals", summary: "A surface normal map." },
      { id: "pose", summary: "Body, hand and face pose skeletons." },
      { id: "scribble", summary: "A scribble-style map." },
      { id: "segments", summary: "A segmentation map." },
    ],
    models: [
      { model: "marigold-depth", tier: "quality" },
      { model: "depth-anything", tier: "balanced" },
      { model: "midas-depth", tier: "fast" },
      { mode: "edges", model: "teed", tier: "quality" },
      { mode: "edges", model: "hed", tier: "balanced" },
      { mode: "edges", model: "pidi", tier: "fast" },
      { mode: "lineart", model: "lineart", tier: "balanced" },
      { mode: "lines", model: "mlsd", tier: "balanced" },
      { mode: "metric", model: "zoe-depth", tier: "balanced" },
      { mode: "normals", model: "midas-preprocessor", tier: "balanced" },
      { mode: "pose", model: "dwpose", tier: "balanced" },
      { mode: "scribble", model: "scribble", tier: "balanced" },
      { mode: "segments", model: "sam-preprocessor", tier: "balanced" },
    ],
    notFor:
      "Masks of a named thing (segment), or PBR material maps (material).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary:
      "Make a control map of an image: depth, edges, lines, normals or pose.",
  },
  material: {
    basis:
      "Hand-ranked. Patina is the only PBR decomposition Model; extract works on a region.",
    modes: [
      {
        id: "extract",
        summary: "Extract a tiling material from a named region.",
      },
    ],
    models: [
      { model: "patina", tier: "balanced" },
      { mode: "extract", model: "patina-extract", tier: "balanced" },
    ],
    notFor:
      "A seamless texture without PBR maps (tile), or depth and normals of a scene (map).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary:
      "Turn a surface photograph into PBR maps: colour, normal, roughness, metalness, height.",
  },
  mesh: {
    basis:
      "Hand-ranked from fal price and published quality: Meshy v7 leads quality and is the only Model that rigs a mesh; Hunyuan3D v3 is the quality second at under a third of the price; TRELLIS 2 balanced. SAM 3D reconstructs several prompted objects, or a human body.",
    modes: [
      { id: "body", summary: "Reconstruct a human body mesh with keypoints." },
      {
        id: "objects",
        summary: "Reconstruct several prompted objects from one image.",
      },
    ],
    models: [
      { model: "meshy-v7", tier: "quality" },
      { model: "hunyuan3d-v3", tier: "quality" },
      { model: "trellis-2", tier: "balanced" },
      { mode: "body", model: "sam3-3d-body", tier: "balanced" },
      { mode: "objects", model: "sam3-3d-objects", tier: "balanced" },
    ],
    notFor: "A flat image of an object (generate), or depth of a scene (map).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary: "Make a textured 3D mesh from one image.",
  },
  reframe: {
    basis:
      "Hand-ranked. Ideogram reframes to a ratio and leads; Bria expands to a ratio for less. FLUX outpaints by a per-edge pixel margin. Smart resize makes several sizes at once.",
    modes: [
      { id: "margin", summary: "Extend each edge by a set number of pixels." },
      {
        id: "sizes",
        summary: "Make several target sizes at once, recomposing each.",
      },
    ],
    models: [
      { model: "ideogram-reframe", tier: "balanced" },
      { model: "bria-expand", tier: "fast" },
      { mode: "margin", model: "flux-outpaint", tier: "balanced" },
      { mode: "sizes", model: "smart-resize", tier: "balanced" },
    ],
    notFor: "A new image at a given ratio (generate with a ratio).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary:
      "Extend or recut an image to a new aspect ratio, generating the new edges.",
  },
  relight: {
    basis:
      "Hand-ranked. IC-Light relights to a described light or a mood, with or without a mask; the two lighting Models even out or strip baked-in light.",
    modes: [
      { id: "even", summary: "Restore natural, even lighting." },
      {
        id: "flat",
        summary: "Strip baked-in light and shadow to a neutral surface.",
      },
    ],
    models: [
      { model: "iclight-v2", supports: ["mask"], tier: "balanced" },
      { mode: "even", model: "lighting-restoration", tier: "balanced" },
      { mode: "flat", model: "remove-lighting", tier: "balanced" },
    ],
    notFor: "Regenerating the scene in a new light (generate with a mood).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary: "Change the light in a photo without regenerating it.",
  },
  restore: {
    basis:
      "Hand-ranked. Each mode names what is wrong and has the Model that fixes it; the plain job is Topaz's general restoration. Control Light, a FLUX.2 klein fine-tune at $0.03/MP, brightens dark photos.",
    modes: [
      { id: "colour", summary: "Colourise a black-and-white photograph." },
      { id: "dark", summary: "Brighten a dark or underexposed photo." },
      { id: "noise", summary: "Remove noise." },
      { id: "scratches", summary: "Repair scratches, tears and damage." },
      { id: "softness", summary: "Sharpen a soft or blurred image." },
      { id: "tone", summary: "Fix exposure, white balance and colour." },
    ],
    models: [
      { model: "topaz-restore", tier: "balanced" },
      { mode: "colour", model: "ddcolor", tier: "balanced" },
      { mode: "dark", model: "control-light", tier: "balanced" },
      { mode: "noise", model: "topaz-denoise", tier: "balanced" },
      { mode: "scratches", model: "topaz-restore", tier: "balanced" },
      { mode: "softness", model: "topaz-sharpen", tier: "balanced" },
      { mode: "tone", model: "topaz-adjust", tier: "balanced" },
    ],
    notFor: "Making an image larger (upscale).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary:
      "Fix noise, softness, damage, colour or tone without changing the size.",
  },
  restyle: {
    basis: "Hand-ranked. One Model: TeleStyle v2.",
    models: [{ model: "telestyle-v2", tier: "balanced" }],
    notFor: "A house style kept across images (generate with a look).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary: "Redraw an image in the style of a reference image.",
  },
  segment: {
    basis:
      "Hand-ranked. SAM 3.1 for quality, SAM 3 balanced; SAM 2 segments everything without a prompt. RLE modes return run-length masks.",
    modes: [
      { id: "auto", summary: "Segment every region without a prompt." },
      {
        id: "rle",
        summary: "Return run-length encoded masks instead of images.",
      },
    ],
    models: [
      { model: "sam3-1-image", tier: "quality" },
      { model: "sam3-image", tier: "balanced" },
      { model: "sam3-1-video", tier: "quality" },
      { model: "sam3-video", tier: "balanced" },
      { mode: "auto", model: "sam2-auto", tier: "balanced" },
      { mode: "rle", model: "sam3-image-rle", tier: "balanced" },
      { mode: "rle", model: "sam3-video-rle", tier: "balanced" },
    ],
    notFor:
      "The background behind the subject (cutout), or boxes without masks (ask detect).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary: "Mask a named thing in an image or video.",
  },
  tile: {
    basis:
      "Hand-ranked. Ideogram makes the tile; SeedVR upscales one while keeping its edges seamless.",
    modes: [
      {
        id: "upscale",
        summary: "Upscale a tiling texture and keep it seamless.",
      },
    ],
    models: [
      { model: "ideogram-tiling", sourceOptional: true, tier: "balanced" },
      { mode: "upscale", model: "seedvr-seamless", tier: "balanced" },
    ],
    notFor: "PBR maps of a surface (material).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary: "Make a seamlessly tiling texture.",
  },
  "try-on": {
    basis: "Hand-ranked. One Model: Google's virtual try-on.",
    models: [{ model: "virtual-try-on", tier: "balanced" }],
    notFor: "Changing clothes by description (generate with a reference).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary: "Dress a person in a garment from another image.",
  },
  upscale: {
    basis:
      "Hand-ranked. Topaz Precision and Topaz Image lead quality for fidelity at $0.003/MP; Clarity stays the balanced default it was as --up; Crystal is fast. SeedVR is the balanced second. Topaz Transparent is the only Model that keeps alpha. Generative and creative modes invent detail. Topaz Video upscales video.",
    modes: [
      { id: "creative", summary: "Reimagine detail as it enlarges." },
      {
        id: "generative",
        summary: "Synthesise plausible detail as it enlarges.",
      },
    ],
    models: [
      { model: "topaz-precision", tier: "quality" },
      { model: "topaz-image", tier: "quality" },
      { model: "clarity", tier: "balanced" },
      { model: "seedvr-upscale", tier: "balanced" },
      { model: "crystal", tier: "fast" },
      {
        model: "topaz-transparent",
        supports: ["transparency"],
        tier: "balanced",
      },
      { model: "topaz-video", tier: "balanced" },
      { mode: "creative", model: "topaz-creative", tier: "balanced" },
      { mode: "generative", model: "topaz-generative", tier: "balanced" },
    ],
    notFor:
      "Fixing noise, softness or colour without changing the size (restore).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary: "Make an image or video larger without losing detail.",
  },
  vectorize: {
    basis:
      "Hand-ranked. Recraft gives a clean SVG with few paths; image2svg traces faithfully with many paths and costs an eighth as much.",
    models: [
      { model: "recraft-vectorize", tier: "balanced" },
      { model: "image2svg", tier: "fast" },
    ],
    notFor: "Drawing a new image from a prompt (generate).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary: "Trace a raster image to a clean SVG.",
  },
  vary: {
    basis:
      "The generate ranking, filtered to Models that can edit. vary reuses the Model of the image it varies while Motif still offers it.",
    models: GENERATION_MODELS_RANKED.filter(
      ({ model }) => MODELS[model]?.supportsEdit === true
    ),
    notFor:
      "A specific change to an image described in words (generate with a reference), or a set of different scenes in one style (series run).",
    rankedAt: HAND_RANKED_AT,
    rankedFrom: "hand",
    summary: "Make variations of an image you already have.",
  },
} as const satisfies Record<string, TaskDefinition>;

/** A Task that has at least one Model. */
export type TaskId = keyof typeof TASKS;

export const TASK_IDS: readonly TaskId[] = Object.keys(TASKS).filter(isTaskId);

export function isTaskId(value: string): value is TaskId {
  return Object.hasOwn(TASKS, value);
}
