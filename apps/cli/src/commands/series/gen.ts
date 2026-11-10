/** `motif series gen`: one image (or up to four) in a Series' style. */

import { basename } from "node:path";

import {
  ASPECT_RATIOS,
  enrichPrompt,
  formatCost,
  RESOLUTIONS,
  sanitizePrompt,
} from "@howells/motif-sdk";
import chalk from "chalk";
import ora from "ora";

import { loadConfig } from "../../utils/config";
import {
  exitForErrorCode,
  handleError,
  validateOption,
} from "../../utils/errors";
import {
  parseIntegerOption,
  validateEnumOption,
  validateOutputPath,
  validateResourceId,
} from "../../utils/input";
import { imageSources, motifClient } from "../../utils/motif-client";
import { emit, emitError, isStructured, savedLine } from "../../utils/output";
import type { EmitOptions } from "../../utils/output";
import { openAfterRun } from "../../utils/output-files";
import {
  buildSeriesPrompt,
  loadSeries,
  recordOutput,
  resolveRefs,
  seriesOutputsDir,
  slugify,
} from "../../utils/series";
import { exitTaskError, identityFields } from "../../utils/task-model";
import { hasText } from "../../utils/text";
import { saveGeneratedImages } from "../save-images";
import {
  runSeriesTask,
  sentSize,
  seriesCreativeDirection,
  seriesInput,
} from "./shared";

export async function cmdGenerate(
  slug: string,
  prompt: string,
  opts: {
    aspect?: string;
    dryRun?: boolean;
    look?: string;
    model?: string;
    mood?: string | false;
    open?: boolean;
    num?: string;
    output?: string;
    refs?: string;
    resolution?: string;
  },
  emitOpts: EmitOptions
): Promise<void> {
  try {
    const config = await loadSeries(slug);
    const appConfig = await loadConfig();

    const sanitized = sanitizePrompt(prompt);
    if (!sanitized) {
      emitError(
        { code: "EMPTY_PROMPT", message: "Prompt is empty after sanitization" },
        emitOpts.format
      );
      exitForErrorCode("EMPTY_PROMPT");
    }

    const creative = seriesCreativeDirection(opts, config);
    const creativeResult = creative
      ? validateOption(emitOpts.format, () =>
          enrichPrompt({ creative, prompt: sanitized })
        )
      : undefined;
    const requestPrompt = creativeResult?.prompt ?? sanitized;

    // The style prefix and the scene; the SDK appends the Look and Mood.
    const basePrompt = buildSeriesPrompt(config, sanitized);

    // Resolve which reference images to include
    const refTags = opts.refs?.split(",").map((t) => t.trim());
    const refPaths = resolveRefs(config, refTags);

    if (hasText(opts.model)) {
      validateResourceId(opts.model, "model");
    }
    const aspect = hasText(opts.aspect)
      ? validateOption(emitOpts.format, () =>
          validateEnumOption(opts.aspect ?? "", ASPECT_RATIOS, "aspect")
        )
      : config.defaultAspect;
    const resolution = hasText(opts.resolution)
      ? validateOption(emitOpts.format, () =>
          validateEnumOption(opts.resolution ?? "", RESOLUTIONS, "resolution")
        )
      : config.defaultResolution;
    const numImages = validateOption(emitOpts.format, () =>
      parseIntegerOption(opts.num ?? "1", "num images", { max: 4, min: 1 })
    );

    const dryRun = opts.dryRun === true;
    const client = motifClient(appConfig);
    const input = seriesInput({
      count: numImages,
      creative,
      model: opts.model,
      prompt: basePrompt,
      references: await imageSources(refPaths),
      size: sentSize(opts, { aspect, resolution }),
    });
    const planned = client.plan("generate", input, { dryRun });
    if (planned.isErr()) {
      exitTaskError(planned.error, emitOpts.format, { task: "generate" });
    }
    const plan = planned.value;
    const fullPrompt = plan.prompt ?? basePrompt;
    const cost = plan.cost.usd;

    // -- Dry run --
    if (dryRun) {
      const dryResult = {
        dryRun: true,
        command: "series-generate",
        series: slug,
        prompt: fullPrompt,
        scenePrompt: sanitized,
        enrichedScenePrompt: requestPrompt,
        stylePrompt: config.stylePrompt,
        ...identityFields(plan),
        aspect,
        resolution,
        size: plan.size,
        numImages,
        refs: refPaths,
        refTags: refTags ?? config.refs.map((r) => r.tag),
        estimatedCost: cost,
        ...(creativeResult && {
          creative: creativeResult.creative,
        }),
        valid: true,
      };
      emit(dryResult, emitOpts);
      if (!isStructured(emitOpts.format)) {
        console.log(chalk.bold(`\nDry run: series ${config.name}\n`));
        console.log(`  Style:   ${chalk.dim(config.stylePrompt || "(none)")}`);
        console.log(`  Scene:   ${chalk.dim(sanitized.slice(0, 80))}`);
        console.log(`  Full:    ${chalk.dim(fullPrompt.slice(0, 100))}...`);
        console.log(`  Refs:    ${refPaths.length} images`);
        console.log(`  Cost:    ${chalk.yellow(formatCost(cost))}`);
      }
      return;
    }

    // -- Generate --
    const outputDir = seriesOutputsDir(slug);
    const outputNum = String(config.outputs.length + 1).padStart(3, "0");
    const outputFilename = hasText(opts.output)
      ? opts.output
      : `${outputNum}-${slugify(sanitized.slice(0, 40))}.png`;
    const outputPath = hasText(opts.output)
      ? validateOutputPath(opts.output)
      : `${outputDir}/${outputFilename}`;

    if (!isStructured(emitOpts.format)) {
      console.log(chalk.bold(`\nSeries: ${config.name}`));
      console.log(`Refs: ${refPaths.length}`);
      console.log(`Prompt: ${chalk.dim(fullPrompt.slice(0, 100))}...`);
      console.log(`Cost: ${chalk.yellow(formatCost(cost))}`);
    }

    const spinner = isStructured(emitOpts.format)
      ? null
      : ora("Generating...").start();

    const result = await runSeriesTask(client, input, emitOpts);

    spinner?.succeed("Generated!");

    const saved = await saveGeneratedImages(
      result.files,
      outputPath,
      numImages,
      {
        aspect,
        costPerImage:
          result.cost.usd === null || result.files.length === 0
            ? null
            : result.cost.usd / result.files.length,
        look: creative?.look,
        model: result.model,
        mood: creative?.mood,
        prompt: result.prompt ?? fullPrompt,
        resolution,
      }
    );
    if (!isStructured(emitOpts.format)) {
      for (const image of saved.images) {
        console.log(savedLine(image));
      }
    }

    // Record in series history
    await recordOutput(slug, {
      aspect,
      cost: result.cost.usd,
      filename: basename(saved.images[0]?.path ?? outputFilename),
      model: result.model,
      prompt: result.prompt ?? fullPrompt,
      refsUsed: refTags ?? config.refs.map((r) => r.tag),
      resolution,
      timestamp: new Date().toISOString(),
    });

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "series-generate",
          series: slug,
          prompt: result.prompt ?? fullPrompt,
          scenePrompt: sanitized,
          enrichedScenePrompt: requestPrompt,
          ...identityFields(result),
          aspect,
          resolution,
          images: saved.images.map(({ height, path, size, width }) => ({
            height,
            path,
            size,
            width,
          })),
          cost: result.cost.usd,
          ...(creativeResult && {
            creative: creativeResult.creative,
          }),
          outputIndex: config.outputs.length + 1,
        },
        emitOpts
      );
    }

    openAfterRun(saved.images[0]?.path, opts.open);
  } catch (error) {
    handleError(error, "SERIES_GENERATE_FAILED", emitOpts.format);
  }
}
