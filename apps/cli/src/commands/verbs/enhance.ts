/**
 * `motif enhance` — one verb over the eight Topaz image endpoints.
 *
 * The registry lists them as eight separate tools because they are eight
 * separate fal endpoints, but to a caller they are one decision with eight
 * answers: what kind of enhancement. Exactly one mode runs per call; two is a
 * structured error rather than a precedence rule nobody can see.
 *
 * All eight are marked `queued` in the registry and routed through
 * `runToolQueued`, which is the only path that survives their runtimes.
 */

import { FAL_TOOLS } from "@howells/motif-sdk";
import type { ToolResponse } from "@howells/motif-sdk";

import type { MotifConfig } from "../../utils/config";
import { collectUrls } from "../../utils/image";
import type { EmitOptions } from "../../utils/output";
import { runImageOperation } from "../operation";
import {
  artifactKeys,
  callPrice,
  exclusiveFlag,
  runRegistryTool,
  verbInput,
} from "./shared";
import type { VerbOptions } from "./shared";

/** Mode flag to registry tool id. `--upscale` is the default. */
const ENHANCE_TOOLS = {
  adjust: "topaz-adjust",
  creative: "topaz-creative",
  denoise: "topaz-denoise",
  generative: "topaz-generative",
  restore: "topaz-restore",
  sharpen: "topaz-sharpen",
  transparent: "topaz-transparent",
  upscale: "topaz-precision",
} as const;

export const ENHANCE_MODES = [
  "adjust",
  "creative",
  "denoise",
  "generative",
  "restore",
  "sharpen",
  "transparent",
  "upscale",
] as const;

export async function enhance(
  image: string | undefined,
  options: VerbOptions,
  config: MotifConfig,
  emitOpts: EmitOptions
): Promise<void> {
  const mode =
    exclusiveFlag(options, ENHANCE_MODES, "enhance", emitOpts.format) ??
    "upscale";
  const toolId = ENHANCE_TOOLS[mode];
  const tool = FAL_TOOLS[toolId];

  await runImageOperation<ToolResponse>(
    {
      artifacts: (result) => collectUrls(result, artifactKeys(tool)),
      command: "enhance",
      detail: { mode, tool: toolId },
      errorCode: "ENHANCE_FAILED",
      estimatedCost: callPrice(tool.price),
      model: toolId,
      outputSuffix: `-${mode}`,
      // Every Topaz endpoint is marked queued, so this resolves to the queue
      // path and the kernel's reporter carries position to the spinner.
      run: async (sourceDataUrl, report) =>
        await runRegistryTool(toolId, tool, sourceDataUrl, report),
      verb: `Enhancing with ${tool.name}`,
    },
    verbInput(image, options, config),
    emitOpts
  );
}
