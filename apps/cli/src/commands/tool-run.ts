/**
 * The `motif tool run` path: option assembly, request build, execution
 * (synchronous or queued), artefact download, and history.
 *
 * Split from `tools.ts`, which keeps the commander wiring plus list/describe,
 * so neither file outgrows the 600-line ceiling.
 */

import {
  buildFalToolRequest,
  isFalToolId,
  measuredToolCost,
  projectedToolCost,
} from "@howells/motif-sdk";
import type {
  FalToolConfig,
  FalToolRequest,
  Resolution,
} from "@howells/motif-sdk";
import ora from "ora";

import { runTool, runToolQueued } from "../api/fal";
import { addGeneration, generateId } from "../utils/config";
import { handleError } from "../utils/errors";
import { collectUrls, downloadAll, writeArtifact } from "../utils/image";
import type { WrittenFile } from "../utils/image";
import {
  parseIntegerOption,
  parseNumberOption,
  validateOutputPath,
  validateResourceId,
} from "../utils/input";
import { emit, isStructured } from "../utils/output";
import type { EmitOptions, OutputFormat } from "../utils/output";
import { hasText } from "../utils/text";
import { resolveOutputLabels } from "./output-labels";

export interface ToolOptions {
  applyMask?: boolean;
  backgroundColor?: string;
  coarse?: boolean;
  codec?: string;
  cropToBbox?: boolean;
  detectionThreshold?: string;
  dryRun?: boolean;
  ensembleSize?: string;
  fields?: string;
  format?: string;
  h264?: boolean;
  includeBoxes?: boolean;
  includeScores?: boolean;
  input?: string;
  inputs?: string[];
  json?: string;
  maskOnly?: boolean;
  maxMasks?: string;
  minMaskRegionArea?: string;
  model?: string;
  numInferenceSteps?: string;
  operatingResolution?: string;
  option?: string[];
  output?: string;
  outputFormat?: string;
  pointsPerSide?: string;
  predIouThresh?: string;
  preserveAudio?: boolean;
  prompt?: string;
  providerOptions?: Record<string, unknown>;
  returnMultipleMasks?: boolean;
  scale?: string;
  stabilityScoreThresh?: string;
  targetFps?: string;
  videoOutputType?: string;
}

function parseOptionValue(value: string): unknown {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseOptionPairs(
  values: string[] | undefined
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const pair of values ?? []) {
    const index = pair.indexOf("=");
    if (index === -1) {
      throw new Error(`tool option must be key=value: ${pair}`);
    }
    const key = pair.slice(0, index).trim();
    if (!key) {
      throw new Error(`tool option key is empty: ${pair}`);
    }
    result[key] = parseOptionValue(pair.slice(index + 1).trim());
  }
  return result;
}

/** True when a value is a plain (non-array, non-null) JSON object. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJsonOptions(value: string | undefined): Record<string, unknown> {
  if (!hasText(value)) {
    return {};
  }
  const parsed: unknown = JSON.parse(value);
  if (!isPlainRecord(parsed)) {
    throw new Error("--json must be a JSON object");
  }
  return parsed;
}

function buildOptions(
  options: ToolOptions,
  format: OutputFormat
): Record<string, unknown> {
  try {
    return {
      ...parseJsonOptions(options.json),
      ...parseOptionPairs(options.option),
      ...options.providerOptions,
      ...(hasText(options.prompt) ? { prompt: options.prompt } : {}),
      ...(hasText(options.outputFormat)
        ? { output_format: options.outputFormat }
        : {}),
      ...(hasText(options.operatingResolution)
        ? { operating_resolution: options.operatingResolution }
        : {}),
      ...(options.applyMask === undefined
        ? {}
        : { apply_mask: options.applyMask }),
      ...(options.cropToBbox === undefined
        ? {}
        : { crop_to_bbox: options.cropToBbox }),
      ...(options.coarse === undefined ? {} : { coarse: options.coarse }),
      ...(options.maskOnly === undefined
        ? {}
        : { mask_only: options.maskOnly }),
      ...(options.returnMultipleMasks === true
        ? { return_multiple_masks: true }
        : {}),
      ...(options.includeScores === true ? { include_scores: true } : {}),
      ...(options.includeBoxes === true ? { include_boxes: true } : {}),
      ...(hasText(options.maxMasks)
        ? {
            max_masks: parseIntegerOption(options.maxMasks, "max masks", {
              max: 50,
              min: 1,
            }),
          }
        : {}),
      ...(hasText(options.scale)
        ? {
            upscale_factor: parseNumberOption(options.scale, "scale", {
              max: 8,
              min: 1,
            }),
          }
        : {}),
      ...(hasText(options.model) ? { model: options.model } : {}),
      ...(hasText(options.backgroundColor)
        ? { background_color: options.backgroundColor }
        : {}),
      ...(hasText(options.codec)
        ? { output_container_and_codec: options.codec }
        : {}),
      ...(options.preserveAudio === undefined
        ? {}
        : { preserve_audio: options.preserveAudio }),
      ...(hasText(options.detectionThreshold)
        ? {
            detection_threshold: parseNumberOption(
              options.detectionThreshold,
              "detection threshold",
              { max: 1, min: 0 }
            ),
          }
        : {}),
      ...(hasText(options.pointsPerSide)
        ? {
            points_per_side: parseIntegerOption(
              options.pointsPerSide,
              "points per side",
              { min: 1 }
            ),
          }
        : {}),
      ...(hasText(options.predIouThresh)
        ? {
            pred_iou_thresh: parseNumberOption(
              options.predIouThresh,
              "predicted IOU threshold",
              { max: 1, min: 0 }
            ),
          }
        : {}),
      ...(hasText(options.stabilityScoreThresh)
        ? {
            stability_score_thresh: parseNumberOption(
              options.stabilityScoreThresh,
              "stability score threshold",
              { max: 1, min: 0 }
            ),
          }
        : {}),
      ...(hasText(options.minMaskRegionArea)
        ? {
            min_mask_region_area: parseIntegerOption(
              options.minMaskRegionArea,
              "minimum mask region area",
              { min: 0 }
            ),
          }
        : {}),
      ...(hasText(options.numInferenceSteps)
        ? {
            num_inference_steps: parseIntegerOption(
              options.numInferenceSteps,
              "number of inference steps",
              { min: 1 }
            ),
          }
        : {}),
      ...(hasText(options.ensembleSize)
        ? {
            ensemble_size: parseIntegerOption(
              options.ensembleSize,
              "ensemble size",
              { min: 2 }
            ),
          }
        : {}),
      ...(hasText(options.targetFps)
        ? {
            target_fps: parseIntegerOption(options.targetFps, "target FPS", {
              min: 1,
            }),
          }
        : {}),
      ...(options.h264 === true ? { H264_output: true } : {}),
      ...(hasText(options.videoOutputType)
        ? { video_output_type: options.videoOutputType }
        : {}),
    };
  } catch (error) {
    handleError(error, "INVALID_OPTION", format);
  }
}

/** A tool's cost, as far as the registry can know it before the call. */
interface ToolCostEstimate {
  estimatedCost: number | null;
  estimatedCostPerMegapixel?: number;
  estimatedCostPerSecond?: number;
}

/**
 * Machine-readable cost for a tool run.
 *
 * Per-megapixel and per-second endpoints are billed on an output size or a
 * duration nobody knows before the call, so those report the unit rate and
 * leave `estimatedCost` null rather than inventing a multiplier.
 */
function estimateToolCost(price: FalToolConfig["price"]): ToolCostEstimate {
  const estimatedCost = projectedToolCost(price).usd;
  if (price.kind === "megapixel") {
    return { estimatedCost, estimatedCostPerMegapixel: price.usd };
  }
  if (price.kind === "second") {
    return { estimatedCost, estimatedCostPerSecond: price.usd };
  }
  return { estimatedCost };
}

/** Nearest resolution bucket for a written file; 1K when it carries no dimensions. */
function resolutionOf(file: WrittenFile): Resolution {
  const longestEdge = Math.max(file.width ?? 0, file.height ?? 0);
  if (longestEdge === 0 || longestEdge > 3072) {
    return longestEdge > 3072 ? "4K" : "1K";
  }
  if (longestEdge <= 768) {
    return "0.5K";
  }
  if (longestEdge <= 1536) {
    return "1K";
  }
  return "2K";
}

/** Download every artefact when `--output` names a directory, else just the first. */
async function saveToolOutputs(
  result: Record<string, unknown>,
  tool: FalToolConfig,
  output: string,
  toolId: string,
  body: Record<string, unknown>
): Promise<WrittenFile[]> {
  const artifacts = collectUrls(result, tool.outputKeys);
  const first = artifacts[0];
  if (first === undefined) {
    throw new Error(`No downloadable output found for ${toolId}`);
  }

  const isDirectory = output.endsWith("/");
  const outputPath = validateOutputPath(output);
  if (isDirectory) {
    return await downloadAll(
      artifacts,
      outputPath,
      resolveOutputLabels(tool, body, result)
    );
  }
  return [await writeArtifact(first.key, first.url, outputPath)];
}

/**
 * Record a tool run in local history so `--up`, `--vary` and `--last` can
 * reach it. Only the primary file is recorded; runs that write nothing
 * (moderation, analysis, OCR) are not generations and record nothing.
 */
async function recordToolRun(
  toolId: string,
  files: WrittenFile[],
  source: string | undefined,
  prompt: string,
  cost: number | null
): Promise<void> {
  const primary = files[0];
  if (primary === undefined) {
    return;
  }
  await addGeneration({
    aspect: "auto",
    cost,
    ...(hasText(source) ? { editedFrom: source } : {}),
    id: generateId(),
    model: toolId,
    output: primary.path,
    prompt: `[tool:${toolId}] ${prompt}`,
    resolution: resolutionOf(primary),
    timestamp: new Date().toISOString(),
  });
}

/** History prompt text: the caller's prompt if any, else the tool's task. */
function historyPrompt(options: ToolOptions, tool: FalToolConfig): string {
  return hasText(options.prompt) ? options.prompt : tool.task;
}

/** Execute the tool, routing queue-marked endpoints through the fal queue. */
async function executeTool(
  toolId: string,
  tool: FalToolConfig,
  inputs: string[] | undefined,
  requestOptions: Record<string, unknown>,
  format: OutputFormat
): Promise<Record<string, unknown>> {
  const runOptions = {
    input: inputs?.[0],
    inputs,
    options: requestOptions,
    tool: toolId,
  };
  if (tool.queued !== true) {
    return await runTool(runOptions);
  }

  const spinner = isStructured(format)
    ? null
    : ora(`Queued ${tool.name}...`).start();
  try {
    const result = await runToolQueued(runOptions, (status, queuePosition) => {
      if (spinner !== null) {
        spinner.text =
          queuePosition === undefined
            ? `Queued ${tool.name}: ${status}`
            : `Queued ${tool.name}: ${status} (position ${queuePosition})`;
      }
    });
    spinner?.succeed(`${tool.name} finished`);
    return result;
  } catch (error) {
    spinner?.fail(`${tool.name} failed`);
    throw error;
  }
}

/**
 * Emit a finished run, listing every file only in directory mode.
 *
 * Carries the same cost fields as `--dry-run` so an agent tracking spend
 * parses one shape whether it priced the run or actually made it, plus `cost`:
 * what the run actually billed, measured against the files it wrote. That is a
 * real figure where `estimatedCost` had to be null, and null only where nothing
 * can know it.
 */
function emitRunResult(
  toolId: string,
  request: FalToolRequest,
  result: Record<string, unknown>,
  files: WrittenFile[],
  cost: ToolCostEstimate & { cost: number | null },
  options: ToolOptions,
  emitOpts: EmitOptions
): void {
  const primary = files[0];
  emit(
    {
      command: "tool.run",
      endpoint: request.endpoint,
      ...cost,
      result,
      tool: toolId,
      toolName: request.tool.name,
      ...(primary ? { saved: { path: primary.path, size: primary.size } } : {}),
      ...(options.output?.endsWith("/") === true ? { files } : {}),
    },
    emitOpts
  );
}

/** The `--inputs` list if given, else the single positional/`--input` value. */
function resolveInputs(
  input: string | undefined,
  options: ToolOptions
): string[] | undefined {
  if (options.inputs !== undefined && options.inputs.length > 0) {
    return options.inputs;
  }
  return hasText(input) ? [input] : undefined;
}

/** Reject a tool id that is malformed or absent from the registry. */
function assertKnownTool(toolId: string, format: OutputFormat): void {
  try {
    validateResourceId(toolId, "tool");
  } catch (error) {
    handleError(error, "INVALID_TOOL_ID", format);
  }
  if (!isFalToolId(toolId)) {
    handleError(
      new Error(`Unknown fal tool: ${toolId}`),
      "UNKNOWN_TOOL",
      format
    );
  }
}

export async function runFalTool(
  toolId: string,
  input: string | undefined,
  options: ToolOptions,
  emitOpts: EmitOptions
): Promise<void> {
  assertKnownTool(toolId, emitOpts.format);

  const inputs = resolveInputs(input, options);
  const requestOptions = buildOptions(options, emitOpts.format);
  let request: FalToolRequest;
  try {
    request = buildFalToolRequest({
      input: inputs?.[0],
      inputs,
      options: requestOptions,
      tool: toolId,
    });
  } catch (error) {
    handleError(error, "INVALID_OPTION", emitOpts.format);
  }

  const cost = estimateToolCost(request.tool.price);

  if (options.dryRun === true) {
    emit(
      {
        body: request.body,
        command: "tool.run",
        dryRun: true,
        endpoint: request.endpoint,
        ...cost,
        pricing: request.tool.pricing,
        queued: request.tool.queued === true,
        tool: toolId,
        toolName: request.tool.name,
        valid: true,
      },
      emitOpts
    );
    return;
  }

  try {
    const result = await executeTool(
      toolId,
      request.tool,
      inputs,
      requestOptions,
      emitOpts.format
    );
    const files = hasText(options.output)
      ? await saveToolOutputs(
          result,
          request.tool,
          options.output,
          toolId,
          request.body
        )
      : [];

    // The files exist now, so a per-megapixel rate resolves exactly — most of
    // the Topaz suite records its real cost here rather than the null it had to
    // report at dry-run time. Only per-second and metered endpoints stay
    // unknown, and those record null rather than a zero that reads as free.
    const measured = measuredToolCost(request.tool.price, files);
    await recordToolRun(
      toolId,
      files,
      inputs?.[0],
      historyPrompt(options, request.tool),
      measured.usd
    );

    emitRunResult(
      toolId,
      request,
      result,
      files,
      { ...cost, cost: measured.usd },
      options,
      emitOpts
    );
  } catch (error) {
    handleError(error, "TOOL_FAILED", emitOpts.format);
  }
}
