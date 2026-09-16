/**
 * `motif vary [image]`: variations of an image, through the vary Task.
 *
 * The source is the given image, else the last generation. When the source
 * came from a generation whose Model vary still ranks, and the caller named
 * neither a Model nor a Look, that Model is reused so variations keep its
 * character.
 */

import { resolve } from "node:path";

import { enrichPrompt, promptWarnings, TASKS } from "@howells/motif-sdk";
import type { TaskInput } from "@howells/motif-sdk";
import type { Command } from "commander";

import type { Generation, MotifConfig } from "../utils/config";
import { getLastGeneration, loadHistory } from "../utils/config";
import { resolveCreativeDirection } from "../utils/creative";
import { exitForErrorCode, handleError, validateOption } from "../utils/errors";
import { generateFilename } from "../utils/image";
import { parseIntegerOption, validateOutputPath } from "../utils/input";
import { imageSource } from "../utils/motif-client";
import { emitError } from "../utils/output";
import type { EmitOptions } from "../utils/output";
import { hasText } from "../utils/text";
import { runGeneration } from "./generate";
import {
  commonInput,
  verbEmitOptions,
  withCommonOptions,
} from "./verbs/shared";
import type { VerbOptions } from "./verbs/shared";

interface VaryOptions extends VerbOptions {
  look?: string;
  mood?: string | false;
  num?: string;
  prompt?: string;
}

/** The generation that wrote this file, newest first, if history has one. */
async function generationFor(path: string): Promise<Generation | undefined> {
  const target = resolve(path);
  const { generations } = await loadHistory();
  return generations.toReversed().find((g) => resolve(g.output) === target);
}

async function varySource(
  image: string | undefined,
  emitOpts: EmitOptions
): Promise<{ generation?: Generation; path: string }> {
  if (hasText(image)) {
    return { generation: await generationFor(image), path: image };
  }
  const last = await getLastGeneration();
  if (!last) {
    emitError(
      {
        code: "NO_PREVIOUS",
        message:
          "No previous generation to vary; pass an image: motif vary <image>",
      },
      emitOpts.format
    );
    exitForErrorCode("NO_PREVIOUS");
  }
  return { generation: last, path: last.output };
}

async function vary(
  image: string | undefined,
  options: VaryOptions,
  config: MotifConfig
): Promise<void> {
  const emitOpts = verbEmitOptions(options);
  const common = commonInput(options, emitOpts.format);
  const { generation, path } = await varySource(image, emitOpts);

  const creative = resolveCreativeDirection(options);
  const prompt = hasText(options.prompt) ? options.prompt : generation?.prompt;
  if (creative !== undefined) {
    validateOption(emitOpts.format, () =>
      enrichPrompt({ creative, prompt: prompt ?? "" })
    );
  }
  const numImages = validateOption(emitOpts.format, () =>
    parseIntegerOption(options.num ?? 1, "num images", { max: 4, min: 1 })
  );
  let outputPath: string;
  try {
    outputPath = hasText(options.output)
      ? validateOutputPath(options.output)
      : generateFilename();
  } catch (error) {
    handleError(error, "INVALID_OUTPUT_PATH", emitOpts.format);
  }
  let source: string;
  try {
    source = await imageSource(path);
  } catch (error) {
    handleError(error, "INVALID_IMAGE_PATH", emitOpts.format);
  }

  const reusable =
    common.model === undefined &&
    creative?.look === undefined &&
    generation !== undefined &&
    TASKS.vary.models.some((entry) => entry.model === generation.model);

  const input: TaskInput = {
    ...common,
    image: source,
    ...(reusable && { model: generation.model }),
    ...(hasText(prompt) && { prompt }),
    ...(numImages > 1 && { count: numImages }),
    ...(hasText(creative?.look) && { look: creative.look }),
    ...(hasText(creative?.mood) && { mood: creative.mood }),
  };

  await runGeneration(
    {
      aspect: generation?.aspect ?? "1:1",
      basePrompt: prompt ?? "",
      command: "vary",
      creative,
      dryRun: options.dryRun === true,
      editPaths: [resolve(path)],
      ephemeral: false,
      explicitOutput: hasText(options.output),
      extra: { source: path, varyModel: reusable ? "reused" : "resolved" },
      input,
      noOpen: options.open === false,
      numImages,
      outputPath,
      resolution: generation?.resolution ?? "1K",
      task: "vary",
      transparent: false,
      warnings: promptWarnings(prompt ?? "", { editing: true }),
    },
    config,
    emitOpts
  );
}

export function registerVary(program: Command, config: MotifConfig): void {
  const command = program
    .command("vary")
    .description(TASKS.vary.summary)
    .argument("[image]")
    .option(
      "--prompt <text>",
      "Describe the variations (default: the source's prompt)"
    )
    .option("-n, --num <count>", "Number of variations 1-4 (default 1)")
    .option("--look <id>", "House look id, e.g. editorial")
    .option("--mood <id>", "Light mood id, e.g. overcast")
    .option("--no-mood", "Drop any mood");
  withCommonOptions(command).action(async (image: string | undefined) => {
    await vary(image, command.opts<VaryOptions>(), config);
  });
}
