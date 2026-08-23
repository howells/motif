/**
 * Shared plumbing for the promoted verbs.
 *
 * Every verb in this directory is a descriptor over `runImageOperation`, never
 * a pipeline of its own: source resolution, dry-run, download, history, emit
 * and viewer-opening all live in the kernel. What is genuinely shared is the
 * small surface around it — the flag bag commander fills in, the translation
 * from that bag into the kernel's input, the registry price lookup, and the
 * one-mode-at-a-time guard two verbs need.
 */

import type { FalToolConfig, ToolResponse } from "@howells/motif-sdk";

import { runTool, runToolQueued } from "../../api/fal";
import { getApiKey } from "../../utils/config";
import type { MotifConfig } from "../../utils/config";
import { handleError } from "../../utils/errors";
import { resolveFormat } from "../../utils/output";
import type { EmitOptions, OutputFormat } from "../../utils/output";
import type { ImageOperationInput, OperationProgress } from "../operation";

/**
 * Every flag the seven verbs accept, in one bag.
 *
 * Flattened rather than split per verb because commander hands each action a
 * single options object, and each verb registers only the flags it declares —
 * so `--rle` can never reach `enhance` even though both read this type.
 */
export interface VerbOptions {
  /** Shared: validate and price without an API call. */
  dryRun?: boolean;
  /** Shared: comma-separated output field mask. */
  fields?: string;
  /** Shared: json, human, or ndjson. */
  format?: string;
  /** Shared: commander's `--no-open` negation — false when the caller passed it. */
  open?: boolean;
  /** Shared: output file, or a directory when it ends in `/`. */
  output?: string;

  /** ask: caption the image instead of answering a question. */
  caption?: boolean;
  /** ask: detect this thing and return bounding boxes. */
  detect?: string;
  /** ask: point at every instance of this thing. */
  point?: string;

  /** segment: return run-length encoded masks rather than mask images. */
  rle?: boolean;

  /** reframe target ratios, one at a time. */
  cover?: boolean;
  landscape?: boolean;
  og?: boolean;
  portrait?: boolean;
  square?: boolean;
  story?: boolean;
  wide?: boolean;

  /** enhance modes, one at a time. */
  adjust?: boolean;
  creative?: boolean;
  denoise?: boolean;
  generative?: boolean;
  restore?: boolean;
  sharpen?: boolean;
  transparent?: boolean;
  upscale?: boolean;
}

export function verbEmitOptions(options: VerbOptions): EmitOptions {
  return {
    fields: options.fields,
    format: resolveFormat(options.format),
    sanitize: true,
  };
}

/** Translate the flag bag into the kernel's input. */
export function verbInput(
  image: string | undefined,
  options: VerbOptions,
  config: MotifConfig
): ImageOperationInput {
  return {
    dryRun: options.dryRun,
    noOpen: options.open === false,
    openAfterWrite: config.openAfterGenerate,
    output: options.output,
    source: image,
  };
}

/**
 * Flat USD estimate for a registry price, or null when the endpoint is billed
 * per megapixel, per second, or metered. Those are unknowable before the call
 * and are deliberately not guessed — the kernel renders null as "metered".
 */
export function callPrice(price: FalToolConfig["price"]): number | null {
  return price.kind === "call" ? price.usd : null;
}

/**
 * The single mode flag the caller set, or undefined for none.
 *
 * Two modes is a structured error rather than a silent precedence rule: an
 * agent that passes `--sharpen --denoise` has a wrong model of the command,
 * and picking one for it hides that.
 */
export function exclusiveFlag<T extends keyof VerbOptions>(
  options: VerbOptions,
  flags: readonly T[],
  verb: string,
  format: OutputFormat
): T | undefined {
  const chosen = flags.filter((flag) => options[flag] === true);
  if (chosen.length > 1) {
    handleError(
      new Error(
        `motif ${verb} takes one mode at a time; got ${chosen
          .map((flag) => `--${flag}`)
          .join(" ")}`
      ),
      "INVALID_OPTION",
      format
    );
  }
  return chosen[0];
}

/** Gate a verb that is about to spend money on a resolvable fal key. */
export function requireApiKey(
  options: VerbOptions,
  config: MotifConfig,
  format: OutputFormat
): void {
  if (options.dryRun === true) {
    return;
  }
  try {
    getApiKey(config);
  } catch (error) {
    handleError(error, "MISSING_API_KEY", format);
  }
}

/**
 * The registry facts routing needs: `endpoint` only so that a whole entry is
 * what gets passed, rather than a lone optional flag a caller could forget.
 */
interface RoutableTool {
  readonly endpoint: string;
  readonly queued?: true;
}

/**
 * Run a registry tool down whichever path its own entry declares.
 *
 * `queued: true` marks endpoints that routinely outrun the 120-second sync
 * timeout. Calling one of those synchronously does not merely fail slowly:
 * `FalClient.request` treats the abort from its own timer as a retriable
 * network error, so with retries a single verb invocation can POST — and be
 * billed for — the same paid endpoint several times before it gives up.
 *
 * Routing on the flag here rather than per verb is what stops that returning:
 * a verb names a tool, and the registry decides how it is called.
 */
export async function runRegistryTool(
  toolId: string,
  tool: RoutableTool,
  sourceDataUrl: string,
  report: OperationProgress,
  options?: Record<string, unknown>
): Promise<ToolResponse> {
  const runOptions = {
    input: sourceDataUrl,
    tool: toolId,
    ...(options === undefined ? {} : { options }),
  };
  if (tool.queued === true) {
    return await runToolQueued(runOptions, report);
  }
  return await runTool(runOptions);
}

/** Registry output keys as a mutable list, which `collectUrls` takes. */
export function artifactKeys(tool: {
  outputKeys: readonly string[];
}): string[] {
  return [...tool.outputKeys];
}
