/**
 * The five promoted verbs that write image files: segment, erase, reframe,
 * layers, and vectorize.
 *
 * Each is a descriptor handed to `runImageOperation`. Nothing here downloads,
 * records history, or resolves a source image — that is the kernel's job, and
 * repeating it per verb is how the drift starts.
 */

import { FAL_TOOLS, FORMAT_PRESETS } from "@howells/motif-sdk";
import type {
  AspectRatio,
  CustomImageSize,
  Resolution,
  ToolResponse,
} from "@howells/motif-sdk";

import type { MotifConfig } from "../../utils/config";
import { handleError } from "../../utils/errors";
import { collectUrls } from "../../utils/image";
import type { EmitOptions, OutputFormat } from "../../utils/output";
import { hasText } from "../../utils/text";
import { runImageOperation } from "../operation";
import {
  artifactKeys,
  callPrice,
  exclusiveFlag,
  runRegistryTool,
  verbInput,
} from "./shared";
import type { VerbOptions } from "./shared";

/**
 * Reframe targets, named for the format preset each one maps to. The ratios
 * themselves come from the SDK's `FORMAT_PRESETS`, the same table generate
 * reads, so a change there moves reframe with it.
 */
const REFRAME_PRESETS = [
  "cover",
  "landscape",
  "og",
  "portrait",
  "square",
  "story",
  "wide",
] as const;

export async function segment(
  prompt: string,
  image: string | undefined,
  options: VerbOptions,
  config: MotifConfig,
  emitOpts: EmitOptions
): Promise<void> {
  const toolId = options.rle === true ? "sam3-image-rle" : "sam3-image";
  const tool = FAL_TOOLS[toolId];
  await runImageOperation<ToolResponse>(
    {
      artifacts: (result) => collectUrls(result, artifactKeys(tool)),
      command: "segment",
      data: (result) => ({
        boxes: result.boxes,
        scores: result.scores,
        ...(options.rle === true ? { rle: result.rle } : {}),
      }),
      detail: { prompt, tool: toolId },
      errorCode: "SEGMENT_FAILED",
      estimatedCost: callPrice(tool.price),
      model: toolId,
      outputSuffix: "-mask",
      run: async (sourceDataUrl, report) =>
        await runRegistryTool(toolId, tool, sourceDataUrl, report, { prompt }),
      verb: "Segmenting",
      // The RLE endpoint answers in encoded masks and carries no image URLs at
      // all, so producing no file is the expected result there rather than the
      // sign of a stale registry key.
      writesFiles: options.rle === true ? false : undefined,
    },
    verbInput(image, options, config),
    emitOpts
  );
}

export async function erase(
  prompt: string,
  image: string | undefined,
  options: VerbOptions,
  config: MotifConfig,
  emitOpts: EmitOptions
): Promise<void> {
  const tool = FAL_TOOLS["object-removal"];
  await runImageOperation<ToolResponse>(
    {
      artifacts: (result) => collectUrls(result, artifactKeys(tool)),
      command: "erase",
      detail: { prompt, tool: "object-removal" },
      errorCode: "ERASE_FAILED",
      estimatedCost: callPrice(tool.price),
      model: "object-removal",
      outputSuffix: "-erased",
      run: async (sourceDataUrl, report) =>
        await runRegistryTool("object-removal", tool, sourceDataUrl, report, {
          prompt,
        }),
      verb: "Erasing",
    },
    verbInput(image, options, config),
    emitOpts
  );
}

/** Long edge, in pixels, targeted for each resolution tier. */
const RESOLUTION_LONG_EDGE: Record<Resolution, number> = {
  "0.5K": 768,
  "1K": 1536,
  "2K": 2048,
  "4K": 4096,
};

const ASPECT_TERMS_REGEX = /^(\d+):(\d+)$/;

/**
 * Exact pixel dimensions for a format preset's ratio.
 *
 * `aspectToFalImageSize` buckets an aspect into one of six named fal presets,
 * which is a fair approximation where the ratio is a hint about a composition
 * being invented from nothing. Reframe is the case where it is not: the ratio
 * is the entire deliverable, and the bucket quietly turns 2:3 into 3:4 and
 * 21:9 into 16:9 — so a set of covers comes back 3:4, labelled 2:3, with
 * nothing to indicate it. Ideogram's `image_size` also accepts explicit width
 * and height, so reframe asks for the real thing.
 *
 * Both edges are whole multiples of the ratio's own terms, so the result is
 * exactly the requested ratio rather than a rounding of it, and the common
 * factor is a multiple of 8 to keep both edges encoder-aligned.
 */
function presetDimensions(
  aspect: AspectRatio,
  resolution: Resolution
): CustomImageSize | null {
  const terms = ASPECT_TERMS_REGEX.exec(aspect);
  if (terms === null) {
    return null;
  }
  const width = Number(terms[1]);
  const height = Number(terms[2]);
  const longEdge = RESOLUTION_LONG_EDGE[resolution];
  const scale = Math.max(
    8,
    8 * Math.round(longEdge / (8 * Math.max(width, height)))
  );
  return { height: height * scale, width: width * scale };
}

/**
 * The target for a reframe, read from the shared format preset table generate
 * also reads. Reframe has no meaningful default: without a target ratio there
 * is nothing to reframe to, so a missing flag is an error rather than a guess.
 */
function reframeTarget(
  options: VerbOptions,
  format: OutputFormat
): { aspect: AspectRatio; imageSize: CustomImageSize; preset: string } {
  const preset = exclusiveFlag(options, REFRAME_PRESETS, "reframe", format);
  if (preset === undefined) {
    handleError(
      new Error(
        `motif reframe needs a target ratio: ${REFRAME_PRESETS.map(
          (name) => `--${name}`
        ).join(", ")}`
      ),
      "INVALID_OPTION",
      format
    );
  }
  const target = FORMAT_PRESETS[preset];
  if (target === undefined) {
    handleError(
      new Error(`No format preset named ${preset}`),
      "INVALID_OPTION",
      format
    );
  }
  const imageSize = presetDimensions(target.aspect, target.resolution ?? "1K");
  if (imageSize === null) {
    handleError(
      new Error(
        `Format preset ${preset} has no fixed ratio to reframe to: ${target.aspect}`
      ),
      "INVALID_OPTION",
      format
    );
  }
  return { aspect: target.aspect, imageSize, preset };
}

export async function reframe(
  image: string | undefined,
  options: VerbOptions,
  config: MotifConfig,
  emitOpts: EmitOptions
): Promise<void> {
  const target = reframeTarget(options, emitOpts.format);
  const tool = FAL_TOOLS["ideogram-reframe"];
  await runImageOperation<ToolResponse>(
    {
      artifacts: (result) => collectUrls(result, artifactKeys(tool)),
      command: "reframe",
      // `imageSize` is the exact size asked of fal, so the payload and the
      // history entry describe the file that actually comes back.
      detail: {
        aspect: target.aspect,
        imageSize: target.imageSize,
        preset: target.preset,
        tool: "ideogram-reframe",
      },
      errorCode: "REFRAME_FAILED",
      estimatedCost: callPrice(tool.price),
      model: "ideogram-reframe",
      outputSuffix: `-${target.preset}`,
      run: async (sourceDataUrl, report) =>
        await runRegistryTool("ideogram-reframe", tool, sourceDataUrl, report, {
          image_size: target.imageSize,
        }),
      verb: "Reframing",
    },
    verbInput(image, options, config),
    emitOpts
  );
}

export async function layers(
  image: string | undefined,
  options: VerbOptions,
  config: MotifConfig,
  emitOpts: EmitOptions
): Promise<void> {
  if (!hasText(options.output) || !options.output.endsWith("/")) {
    handleError(
      new Error(
        "motif layers writes one file per layer, so it needs a directory: pass -o layers/ with a trailing slash"
      ),
      "INVALID_OPTION",
      emitOpts.format
    );
  }
  const tool = FAL_TOOLS["qwen-layered"];
  await runImageOperation<ToolResponse>(
    {
      artifacts: (result) => collectUrls(result, artifactKeys(tool)),
      command: "layers",
      detail: { tool: "qwen-layered" },
      errorCode: "LAYERS_FAILED",
      estimatedCost: callPrice(tool.price),
      model: "qwen-layered",
      outputSuffix: "-layers",
      run: async (sourceDataUrl, report) =>
        await runRegistryTool("qwen-layered", tool, sourceDataUrl, report),
      verb: "Splitting into layers",
    },
    verbInput(image, options, config),
    emitOpts
  );
}

export async function vectorize(
  image: string | undefined,
  options: VerbOptions,
  config: MotifConfig,
  emitOpts: EmitOptions
): Promise<void> {
  // The kernel derives a `.png` name when no -o is given, and the downloader
  // only sniffs raster magic bytes, so an unnamed vectorize would write SVG
  // markup into a file called .png. Naming the target is cheaper than that.
  if (
    !hasText(options.output) ||
    !(options.output.endsWith(".svg") || options.output.endsWith("/"))
  ) {
    handleError(
      new Error(
        "motif vectorize writes an SVG: pass -o name.svg, or a directory with a trailing slash"
      ),
      "INVALID_OPTION",
      emitOpts.format
    );
  }
  const tool = FAL_TOOLS["recraft-vectorize"];
  await runImageOperation<ToolResponse>(
    {
      artifacts: (result) => collectUrls(result, artifactKeys(tool)),
      command: "vectorize",
      detail: { tool: "recraft-vectorize" },
      errorCode: "VECTORIZE_FAILED",
      estimatedCost: callPrice(tool.price),
      model: "recraft-vectorize",
      outputSuffix: "-vector",
      run: async (sourceDataUrl, report) =>
        await runRegistryTool("recraft-vectorize", tool, sourceDataUrl, report),
      verb: "Vectorizing",
    },
    verbInput(image, options, config),
    emitOpts
  );
}
