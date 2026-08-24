import {
  FAL_TOOL_IDS,
  FAL_TOOLS,
  FAL_TOOLS_CHECKED_AT,
  falToolParameters,
  isFalToolId,
} from "@howells/motif-sdk";
import type {
  FalToolConfig,
  FalToolId,
  FalToolParameter,
} from "@howells/motif-sdk";
import chalk from "chalk";
import { Command } from "commander";

import { handleError, routeCommanderErrors } from "../utils/errors";
import { emit, isStructured, resolveFormat } from "../utils/output";
import type { EmitOptions } from "../utils/output";
import { hasText } from "../utils/text";
import { runFalTool } from "./tool-run";
import type { ToolOptions } from "./tool-run";

function emitOptsFromArgs(args: string[]): EmitOptions {
  const format = resolveFormat(
    args.find((a) => a.startsWith("--format="))?.split("=")?.[1] ??
      (args.includes("--format")
        ? args[args.indexOf("--format") + 1]
        : undefined)
  );
  const fields =
    args.find((a) => a.startsWith("--fields="))?.split("=")?.[1] ??
    (args.includes("--fields")
      ? args[args.indexOf("--fields") + 1]
      : undefined);

  return { fields, format, sanitize: true };
}

function stripGlobalFlags(args: string[]): string[] {
  return args.filter((arg, index) => {
    if (arg === "--format" || arg === "--fields") {
      return false;
    }
    if (
      index > 0 &&
      (args[index - 1] === "--format" || args[index - 1] === "--fields")
    ) {
      return false;
    }
    if (arg.startsWith("--format=") || arg.startsWith("--fields=")) {
      return false;
    }
    return true;
  });
}

/** Where the full argument list lives, since the listings carry only counts. */
const PARAMETERS_POINTER =
  "Every argument a tool accepts, with fal's own default and Motif's override, is at `motif tool describe <id>`.";

function listTools(emitOpts: EmitOptions): void {
  emit(
    {
      checkedAt: FAL_TOOLS_CHECKED_AT,
      command: "tool.list",
      parametersNote: PARAMETERS_POINTER,
      tools: Object.fromEntries(
        FAL_TOOL_IDS.map((id) => [
          id,
          {
            category: FAL_TOOLS[id].category,
            endpoint: FAL_TOOLS[id].endpoint,
            inputKind: FAL_TOOLS[id].inputKind,
            name: FAL_TOOLS[id].name,
            parameterCount: falToolParameters(id).length,
            pricing: FAL_TOOLS[id].pricing,
            task: FAL_TOOLS[id].task,
          },
        ])
      ),
    },
    emitOpts
  );

  if (!isStructured(emitOpts.format)) {
    console.log(chalk.bold("\nFal tools\n"));
    for (const id of FAL_TOOL_IDS) {
      const tool = FAL_TOOLS[id];
      console.log(
        `${chalk.green(id)}  ${tool.name}  ${chalk.dim(tool.pricing)}`
      );
    }
    console.log(chalk.dim(`\n${PARAMETERS_POINTER}`));
  }
}

/**
 * How to read the `parameters` list, spelled out because conflating the two
 * kinds of default is what left 36 arguments undiscoverable in the first place.
 */
const PARAMETERS_NOTE =
  "`fallback` is fal's own default, applied when nobody sends the argument. `motifDefault` is Motif's own value, sent on every call and overriding fal's default. Everything else is caller-supplied. Any key here can be passed with `motif tool run <id> --json '{...}'`.";

/** A fal argument, annotated with Motif's own value for it where there is one. */
interface DescribedToolParameter extends FalToolParameter {
  motifDefault?: unknown;
}

function describedParameters(toolId: FalToolId): DescribedToolParameter[] {
  const config: FalToolConfig = FAL_TOOLS[toolId];
  const motifDefaults = config.defaultOptions;
  return falToolParameters(toolId).map((parameter) =>
    motifDefaults !== undefined && parameter.key in motifDefaults
      ? { ...parameter, motifDefault: motifDefaults[parameter.key] }
      : parameter
  );
}

function parameterNotes(parameter: DescribedToolParameter): string {
  const notes: string[] = [];
  if (parameter.required === true) {
    notes.push("required");
  }
  if (parameter.fallback !== undefined) {
    notes.push(`fal default ${JSON.stringify(parameter.fallback)}`);
  }
  if (parameter.motifDefault !== undefined) {
    notes.push(`Motif sends ${JSON.stringify(parameter.motifDefault)}`);
  }
  return notes.length > 0 ? chalk.dim(`  ${notes.join(" · ")}`) : "";
}

function printTool(
  toolId: FalToolId,
  parameters: DescribedToolParameter[]
): void {
  const tool = FAL_TOOLS[toolId];
  console.log(`\n${chalk.bold(toolId)}  ${tool.name}`);
  console.log(
    `${tool.task}\n${chalk.dim(`${tool.endpoint}  ${tool.pricing}`)}`
  );

  if (parameters.length === 0) {
    console.log(chalk.dim("\nNo arguments beyond the input media."));
    return;
  }

  console.log(
    `\n${chalk.bold(`Arguments (${parameters.length})`)}  ${chalk.dim("pass any of these with --json '{...}'")}\n`
  );
  const keyWidth = Math.max(...parameters.map((p) => p.key.length));
  for (const parameter of parameters) {
    console.log(
      `  ${chalk.green(parameter.key.padEnd(keyWidth))}  ${parameter.type}${parameterNotes(parameter)}`
    );
  }
}

function describeTool(toolId: string | undefined, emitOpts: EmitOptions): void {
  if (!hasText(toolId)) {
    listTools(emitOpts);
    return;
  }
  if (!isFalToolId(toolId)) {
    handleError(
      new Error(`Unknown fal tool: ${toolId}`),
      "UNKNOWN_TOOL",
      emitOpts.format
    );
  }

  const parameters = describedParameters(toolId);
  emit(
    {
      checkedAt: FAL_TOOLS_CHECKED_AT,
      command: "tool.describe",
      id: toolId,
      ...FAL_TOOLS[toolId],
      parameters,
      parametersNote: PARAMETERS_NOTE,
    },
    emitOpts
  );

  if (!isStructured(emitOpts.format)) {
    printTool(toolId, parameters);
  }
}

export interface ToolStdinPayload extends ToolOptions {
  command?: "tool" | "tool-describe" | "tool-list" | "tool-run";
  options?: Record<string, unknown>;
  tool?: string;
}

export async function runToolPayload(
  payload: ToolStdinPayload,
  emitOpts: EmitOptions
): Promise<void> {
  if (payload.command === "tool-list") {
    listTools(emitOpts);
    return;
  }

  if (payload.command === "tool-describe") {
    describeTool(payload.tool, emitOpts);
    return;
  }

  if (!hasText(payload.tool)) {
    listTools(emitOpts);
    return;
  }

  await runFalTool(
    payload.tool,
    payload.input,
    { ...payload, providerOptions: payload.options },
    emitOpts
  );
}

export async function runTools(args: string[]): Promise<void> {
  const emitOpts = emitOptsFromArgs(args);
  const filteredArgs = stripGlobalFlags(args);
  if (
    filteredArgs.length > 0 &&
    !["describe", "list", "run"].includes(filteredArgs[0] ?? "")
  ) {
    filteredArgs.unshift("run");
  }

  const program = routeCommanderErrors(
    new Command().name("motif tool").description("Run fal.ai utility tools"),
    emitOpts.format
  );

  program
    .command("list")
    .description("List supported fal tools")
    .action(() => {
      listTools(emitOpts);
    });

  program
    .command("describe [tool]")
    .description("Describe a fal tool")
    .action((tool?: string) => {
      describeTool(tool, emitOpts);
    });

  program
    .command("run <tool> [input]")
    .description("Run a fal tool against image/video input")
    .option("--dry-run", "Validate and print request body without an API call")
    .option("-i, --input <url-or-path>", "Input media URL or local path")
    .option("--inputs <items...>", "Multiple input images for batch tools")
    .option(
      "-o, --output <file-or-dir>",
      "Download output here; a trailing / writes every output, named by key"
    )
    .option("--prompt <text>", "Prompt for segmentation/reconstruction tools")
    .option("--output-format <format>", "Output format, e.g. jpeg, png, webp")
    .option(
      "--operating-resolution <size>",
      "Operating resolution where supported"
    )
    .option("--apply-mask", "Apply mask overlay where supported")
    .option("--no-apply-mask", "Do not apply mask overlay where supported")
    .option(
      "--crop-to-bbox",
      "Crop output to detected foreground box where supported"
    )
    .option(
      "--no-crop-to-bbox",
      "Do not crop output to detected foreground box"
    )
    .option("--coarse", "Use coarse preprocessing where supported")
    .option("--no-coarse", "Disable coarse preprocessing where supported")
    .option("--mask-only", "Return only the mask where supported")
    .option("--no-mask-only", "Return full output rather than mask-only output")
    .option("--return-multiple-masks", "Return multiple masks where supported")
    .option("--include-scores", "Return confidence scores where supported")
    .option("--include-boxes", "Return boxes where supported")
    .option("--max-masks <n>", "Maximum masks to return")
    .option("--scale <n>", "Upscale factor")
    .option("--model <name>", "Provider-specific model/mode")
    .option(
      "--background-color <color>",
      "Background color for video background removal"
    )
    .option(
      "--codec <codec>",
      "Output container/codec for video background removal"
    )
    .option("--preserve-audio", "Preserve audio where supported")
    .option("--no-preserve-audio", "Do not preserve audio where supported")
    .option("--detection-threshold <n>", "Detection threshold 0-1")
    .option(
      "--points-per-side <n>",
      "SAM2 automatic segmentation sample density"
    )
    .option("--pred-iou-thresh <n>", "SAM2 predicted IOU threshold")
    .option("--stability-score-thresh <n>", "SAM2 stability score threshold")
    .option("--min-mask-region-area <n>", "SAM2 minimum mask area")
    .option(
      "--num-inference-steps <n>",
      "Diffusion/preprocessor inference steps"
    )
    .option("--ensemble-size <n>", "Depth ensemble size where supported")
    .option("--target-fps <n>", "Target FPS for video tools")
    .option("--h264", "Request H264 output where supported")
    .option("--video-output-type <type>", "SAM video output type")
    .option("--json <object>", "Raw JSON options merged into the fal request")
    .option(
      "--option <key=value>",
      "Raw option pair; repeatable",
      (value: string, previous: string[]) => [...previous, value],
      []
    )
    .action(
      async (
        tool: string,
        positionalInput: string | undefined,
        options: ToolOptions
      ) => {
        await runFalTool(
          tool,
          options.input ?? positionalInput,
          options,
          emitOpts
        );
      }
    );

  if (filteredArgs.length === 0) {
    listTools(emitOpts);
    return;
  }

  await program.parseAsync(["node", "motif-tool", ...filteredArgs]);
}
