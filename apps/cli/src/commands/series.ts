/**
 * Series commands — consistent styling across related images.
 *
 * motif series create "My Series" --from cover.png --style "watercolor..."
 * motif series ref add "my-series" character.png --tag character
 * motif series gen "my-series" "Luna walks through the forest" --refs character
 * motif series list
 * motif series show "my-series"
 * motif series history "my-series"
 */

import { basename, resolve } from "node:path";

import {
  ASPECT_RATIOS,
  enrichPrompt,
  formatCost,
  getLook,
  modelProfile,
  RESOLUTIONS,
  sanitizePrompt,
  TIERS,
  validateCreativeDirection,
} from "@howells/motif-sdk";
import type {
  AspectRatio,
  CreativeDirection,
  MotifClient,
  Resolution,
  TaskInput,
  TaskOutput,
  Tier,
} from "@howells/motif-sdk";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";

import { loadConfig } from "../utils/config";
import { resolveCreativeDirection } from "../utils/creative";
import type { CreativeInput } from "../utils/creative";
import {
  exitForErrorCode,
  formatForParseErrors,
  handleError,
  routeCommanderErrors,
  validateOption,
} from "../utils/errors";
import {
  parseIntegerOption,
  validateEnumOption,
  validateOutputPath,
  validateResourceId,
} from "../utils/input";
import { imageSource, imageSources, motifClient } from "../utils/motif-client";
import {
  emit,
  emitError,
  emitStream,
  isStructured,
  resolveFormat,
  savedLine,
} from "../utils/output";
import type { EmitOptions } from "../utils/output";
import { openAfterRun } from "../utils/output-files";
import {
  addRef,
  buildSeriesPrompt,
  createSeries,
  deleteSeries,
  listSeries,
  loadSeries,
  recordOutput,
  removeRef,
  resolveRefs,
  seriesExists,
  seriesOutputsDir,
  slugify,
} from "../utils/series";
import type { SeriesConfig } from "../utils/series";
import { exitTaskError, identityFields } from "../utils/task-model";
import { hasText } from "../utils/text";
import { saveGeneratedImages } from "./save-images";

// -- Helpers --

const SERIES_RUN_MAX_COUNT = 24;
const SERIES_RUN_SCENE_FOCI = [
  "wide establishing composition",
  "hero subject composition",
  "close material and texture study",
  "human-scale environmental view",
  "low-angle perspective",
  "quiet atmospheric detail",
  "symmetrical frontal composition",
  "oblique side-light composition",
] as const;

function seriesAsJson(config: SeriesConfig): Record<string, unknown> {
  return {
    created: config.created,
    defaultAspect: config.defaultAspect,
    defaultResolution: config.defaultResolution,
    id: config.id,
    look: config.look ?? null,
    mood: config.mood ?? null,
    name: config.name,
    outputCount: config.outputs.length,
    refCount: config.refs.length,
    refs: config.refs,
    slug: config.slug,
    stylePrompt: config.stylePrompt,
    updated: config.updated,
  };
}

/**
 * Creative direction for one series call: CLI flags win, then the look and
 * mood pinned on the series. `--no-mood` drops the pinned mood for this call.
 */
function seriesCreativeDirection(
  flags: CreativeInput,
  series: SeriesConfig | null
): CreativeDirection | undefined {
  const pinned: CreativeDirection = {};
  if (hasText(series?.look)) {
    pinned.look = series.look;
  }
  if (hasText(series?.mood)) {
    pinned.mood = series.mood;
  }
  return resolveCreativeDirection(flags, pinned);
}

/**
 * The aspect and resolution a Series call sends: a flag's value, or a value
 * other than the 1:1 / 2K the Models default to. An unchosen default is left
 * to the Model so it never narrows the ranking alone.
 */
function sentSize(
  flags: { aspect?: string; resolution?: string },
  size: { aspect: AspectRatio; resolution: Resolution }
): { aspect?: AspectRatio; resolution?: Resolution } {
  return {
    ...((hasText(flags.aspect) || size.aspect !== "1:1") && {
      aspect: size.aspect,
    }),
    ...((hasText(flags.resolution) || size.resolution !== "2K") && {
      resolution: size.resolution,
    }),
  };
}

/**
 * The generate input a Series call sends. The Look and Mood go to the SDK,
 * which appends their clauses to the prompt and lets a Look choose its Model.
 */
function seriesInput(options: {
  count: number;
  creative?: CreativeDirection;
  model?: string;
  prompt: string;
  references: readonly string[];
  size: { aspect?: AspectRatio; resolution?: Resolution };
  tier?: Tier;
}): TaskInput {
  return {
    prompt: options.prompt,
    ...options.size,
    ...(options.tier !== undefined && { tier: options.tier }),
    ...(options.count > 1 && { count: options.count }),
    ...(options.references.length > 0 && { references: options.references }),
    ...(hasText(options.model) && { model: options.model }),
    ...(hasText(options.creative?.look) && { look: options.creative.look }),
    ...(hasText(options.creative?.mood) && { mood: options.creative.mood }),
  };
}

/** Run a Series generation, exiting with the mapped error when it fails. */
async function runSeriesTask(
  client: MotifClient,
  input: TaskInput,
  emitOpts: EmitOptions
): Promise<TaskOutput> {
  const ran = await client.run("generate", input);
  if (ran.isErr()) {
    exitTaskError(ran.error, emitOpts.format, {
      model: input.model,
      task: "generate",
    });
  }
  return ran.value;
}

function splitRefTags(refs: string | undefined): string[] | undefined {
  return refs
    ?.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/**
 * The theme as it reads mid-sentence: its first letter lower-cased unless the
 * second character is a capital, so "A ceramics studio" becomes "a ceramics
 * studio" and "BBC archive" stays as it is.
 */
export function midSentenceTheme(theme: string): string {
  const [first = "", second = ""] = theme;
  const acronym = second !== second.toLowerCase();
  return acronym ? theme : `${first.toLowerCase()}${theme.slice(1)}`;
}

export function buildSeriesRunStylePrompt(
  theme: string,
  style?: string
): string {
  const base = style?.trim();
  if (hasText(base)) {
    return base;
  }
  return [
    `Cohesive visual series about ${midSentenceTheme(theme)}`,
    "consistent tone, style, color palette, lighting, lens language, framing discipline, material treatment, and post-processing across every image",
  ].join(": ");
}

export function buildSeriesRunScenes(theme: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const focus = SERIES_RUN_SCENE_FOCI[index % SERIES_RUN_SCENE_FOCI.length];
    return [
      `Image ${index + 1} of ${count} in a cohesive visual series about ${midSentenceTheme(theme)}`,
      focus,
      "shared visual language, palette, lighting, lens, composition rhythm, and post-processing across the full set",
      "no text, no watermark",
    ].join("; ");
  });
}

export async function loadOrCreateRunSeries(options: {
  aspect: (typeof ASPECT_RATIOS)[number];
  look?: string;
  mood?: string;
  resolution: (typeof RESOLUTIONS)[number];
  series?: string;
  stylePrompt: string;
  theme: string;
}): Promise<SeriesConfig> {
  if (hasText(options.series)) {
    return await loadSeries(options.series);
  }

  // The same theme again continues the series it made the first time.
  const slug = slugify(options.theme);
  if (seriesExists(slug)) {
    return await loadSeries(slug);
  }
  return await createSeries({
    defaultAspect: options.aspect,
    defaultResolution: options.resolution,
    look: options.look,
    mood: options.mood,
    name: options.theme,
    stylePrompt: options.stylePrompt,
  });
}

// -- Commands --

async function cmdCreate(
  name: string,
  opts: {
    from?: string;
    look?: string;
    mood?: string;
    style?: string;
    aspect?: string;
    resolution?: string;
  },
  emitOpts: EmitOptions
): Promise<void> {
  try {
    const requested = resolveCreativeDirection(opts);
    const pinned = requested
      ? validateOption(
          emitOpts.format,
          () => validateCreativeDirection(requested).selected
        )
      : undefined;
    const look = hasText(pinned?.look) ? getLook(pinned.look) : undefined;

    const defaultAspect = hasText(opts.aspect)
      ? validateOption(emitOpts.format, () =>
          validateEnumOption(opts.aspect ?? "", ASPECT_RATIOS, "aspect")
        )
      : undefined;
    const defaultResolution = hasText(opts.resolution)
      ? validateOption(emitOpts.format, () =>
          validateEnumOption(opts.resolution ?? "", RESOLUTIONS, "resolution")
        )
      : undefined;

    // A pinned look fills in the aspect the caller left unset.
    const config = await createSeries({
      defaultAspect: defaultAspect ?? look?.aspect,
      defaultResolution,
      fromImage: hasText(opts.from) ? resolve(opts.from) : undefined,
      look: pinned?.look,
      mood: pinned?.mood,
      name,
      stylePrompt: opts.style,
    });

    if (isStructured(emitOpts.format)) {
      emit({ command: "series-create", ...seriesAsJson(config) }, emitOpts);
    } else {
      console.log(chalk.green(`✓ Created series: ${config.name}`));
      console.log(`  Slug:  ${chalk.cyan(config.slug)}`);
      if (hasText(config.look) || hasText(config.mood)) {
        console.log(
          `  Look:  ${chalk.dim(config.look ?? "none")} | Mood: ${chalk.dim(config.mood ?? "none")}`
        );
      }
      if (config.stylePrompt) {
        console.log(
          `  Style: ${chalk.dim(config.stylePrompt.slice(0, 80))}...`
        );
      }
      if (config.refs.length > 0) {
        console.log(
          `  Refs:  ${config.refs.map((r) => `${r.tag}:${r.filename}`).join(", ")}`
        );
      }
    }
  } catch (error) {
    handleError(error, "SERIES_CREATE_FAILED", emitOpts.format);
  }
}

async function cmdList(emitOpts: EmitOptions): Promise<void> {
  const series = await listSeries();

  if (emitOpts.format === "ndjson") {
    emitStream(series.map(seriesAsJson), emitOpts);
    return;
  }

  if (isStructured(emitOpts.format)) {
    emit(
      {
        command: "series-list",
        series: series.map(seriesAsJson),
        total: series.length,
      },
      emitOpts
    );
    return;
  }

  if (series.length === 0) {
    console.log(
      chalk.yellow(
        'No series found. Create one with: motif series create "My Series"'
      )
    );
    return;
  }

  console.log(chalk.bold(`\nSeries (${series.length}):\n`));
  for (const s of series) {
    console.log(`  ${chalk.cyan(s.slug)} — ${s.name}`);
    console.log(
      `    ${chalk.dim(`${s.refs.length} refs | ${s.outputs.length} outputs | ${new Date(s.updated).toLocaleDateString()}`)}`
    );
  }
}

async function cmdShow(slug: string, emitOpts: EmitOptions): Promise<void> {
  try {
    const config = await loadSeries(slug);

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "series-show",
          ...seriesAsJson(config),
          outputs: config.outputs,
        },
        emitOpts
      );
      return;
    }

    console.log(chalk.bold(`\n${config.name}`));
    console.log(`  ID:     ${chalk.dim(config.id)}`);
    console.log(`  Slug:   ${chalk.cyan(config.slug)}`);
    console.log(
      `  Aspect: ${config.defaultAspect} | Resolution: ${config.defaultResolution}`
    );
    if (hasText(config.look) || hasText(config.mood)) {
      console.log(
        `  Look:   ${config.look ?? "none"} | Mood: ${config.mood ?? "none"}`
      );
    }
    if (config.stylePrompt) {
      console.log(`  Style:  ${chalk.dim(config.stylePrompt)}`);
    }

    if (config.refs.length > 0) {
      console.log(chalk.bold("\n  References:"));
      for (const ref of config.refs) {
        console.log(`    ${chalk.yellow(ref.tag)} → ${ref.filename}`);
        if (ref.description) {
          console.log(`      ${chalk.dim(ref.description)}`);
        }
      }
    }

    if (config.outputs.length > 0) {
      console.log(chalk.bold(`\n  Outputs (${config.outputs.length}):`));
      for (const out of config.outputs.slice(-5)) {
        console.log(
          `    ${chalk.dim(out.filename)} — ${out.prompt.slice(0, 50)}... (${formatCost(out.cost)})`
        );
      }
      if (config.outputs.length > 5) {
        console.log(chalk.dim(`    ... and ${config.outputs.length - 5} more`));
      }
    }
  } catch (error) {
    handleError(error, "SERIES_NOT_FOUND", emitOpts.format);
  }
}

async function cmdRefAdd(
  slug: string,
  imagePath: string,
  opts: { tag: string; description?: string },
  emitOpts: EmitOptions
): Promise<void> {
  try {
    const ref = await addRef(
      slug,
      resolve(imagePath),
      opts.tag,
      opts.description ?? ""
    );

    if (isStructured(emitOpts.format)) {
      emit({ command: "series-ref-add", ref, series: slug }, emitOpts);
    } else {
      console.log(
        chalk.green(
          `✓ Added reference: ${chalk.yellow(ref.tag)} → ${ref.filename}`
        )
      );
    }
  } catch (error) {
    handleError(error, "SERIES_REF_ADD_FAILED", emitOpts.format);
  }
}

async function cmdRefRemove(
  slug: string,
  filename: string,
  emitOpts: EmitOptions
): Promise<void> {
  try {
    await removeRef(slug, filename);

    if (isStructured(emitOpts.format)) {
      emit(
        { command: "series-ref-remove", removed: filename, series: slug },
        emitOpts
      );
    } else {
      console.log(chalk.green(`✓ Removed reference: ${filename}`));
    }
  } catch (error) {
    handleError(error, "SERIES_REF_REMOVE_FAILED", emitOpts.format);
  }
}

async function cmdGenerate(
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

async function cmdRun(
  theme: string,
  opts: {
    aspect?: string;
    count?: string;
    dryRun?: boolean;
    look?: string;
    model?: string;
    mood?: string | false;
    open?: boolean;
    refs?: string;
    resolution?: string;
    series?: string;
    style?: string;
    tier?: string;
  },
  emitOpts: EmitOptions
): Promise<void> {
  try {
    const sanitizedTheme = sanitizePrompt(theme);
    if (!sanitizedTheme) {
      emitError(
        { code: "EMPTY_PROMPT", message: "Theme is empty after sanitization" },
        emitOpts.format
      );
      exitForErrorCode("EMPTY_PROMPT");
    }

    const existingSeries = hasText(opts.series)
      ? await loadSeries(opts.series)
      : null;

    if (hasText(opts.model)) {
      validateResourceId(opts.model, "model");
    }

    const count = validateOption(emitOpts.format, () =>
      parseIntegerOption(opts.count ?? "4", "series run count", {
        max: SERIES_RUN_MAX_COUNT,
        min: 1,
      })
    );
    const aspect = hasText(opts.aspect)
      ? validateOption(emitOpts.format, () =>
          validateEnumOption(opts.aspect ?? "", ASPECT_RATIOS, "aspect")
        )
      : (existingSeries?.defaultAspect ?? "1:1");
    const resolution = hasText(opts.resolution)
      ? validateOption(emitOpts.format, () =>
          validateEnumOption(opts.resolution ?? "", RESOLUTIONS, "resolution")
        )
      : (existingSeries?.defaultResolution ?? "2K");
    const tier = hasText(opts.tier)
      ? validateOption(emitOpts.format, () =>
          validateEnumOption(opts.tier ?? "", TIERS, "tier")
        )
      : undefined;
    const stylePrompt =
      opts.style ??
      existingSeries?.stylePrompt ??
      buildSeriesRunStylePrompt(sanitizedTheme);
    const refTags = splitRefTags(opts.refs);
    const refPaths = existingSeries ? resolveRefs(existingSeries, refTags) : [];
    const creative = seriesCreativeDirection(opts, existingSeries);
    const appConfig = await loadConfig();
    const dryRun = opts.dryRun === true;
    const client = motifClient(appConfig);

    // The style and the scene; the SDK appends the Look and Mood.
    const withStyle = (prompt: string) =>
      stylePrompt ? `${stylePrompt}. ${prompt}` : prompt;
    const scenes = buildSeriesRunScenes(sanitizedTheme, count).map(
      (baseScene) => {
        const enriched = creative
          ? validateOption(emitOpts.format, () =>
              enrichPrompt({ creative, prompt: baseScene })
            )
          : undefined;
        const scene = enriched?.prompt ?? baseScene;
        return {
          baseScene,
          clauses: enriched?.creative.clauses,
          full: withStyle(scene),
          request: withStyle(baseScene),
          scene,
        };
      }
    );
    const references = await imageSources(refPaths);
    const size = sentSize(opts, { aspect, resolution });
    const sceneInput = (index: number, model?: string, extra: string[] = []) =>
      seriesInput({
        count: 1,
        creative,
        model,
        prompt: scenes[index]?.request ?? sanitizedTheme,
        references: [...references, ...extra],
        size,
        tier,
      });

    // Every scene runs on the first scene's Model, so the set stays one style.
    const planned = client.plan("generate", sceneInput(0, opts.model), {
      dryRun,
    });
    if (planned.isErr()) {
      exitTaskError(planned.error, emitOpts.format, { task: "generate" });
    }
    const plan = planned.value;
    const maxRefs = modelProfile(plan.model)?.maxReferences ?? 0;
    const canUseAnchorReference = refPaths.length < maxRefs;
    const estimatedCost = plan.cost.usd === null ? null : plan.cost.usd * count;

    if (dryRun) {
      emit(
        {
          command: "series-run",
          count,
          dryRun: true,
          estimatedCost,
          ...identityFields(plan),
          aspect,
          resolution,
          series: existingSeries?.slug ?? null,
          stylePrompt,
          theme: sanitizedTheme,
          refTags: refTags ?? existingSeries?.refs.map((ref) => ref.tag) ?? [],
          refs: refPaths,
          usesAnchorReference: canUseAnchorReference,
          ...(creative && {
            creative: {
              clauses: scenes[0]?.clauses ?? [],
              selected: creative,
            },
          }),
          scenes: scenes.map(({ baseScene, full, scene }, index) => ({
            baseScenePrompt: baseScene,
            enrichedScenePrompt: scene,
            index: index + 1,
            prompt: full,
            scenePrompt: scene,
          })),
          valid: true,
        },
        emitOpts
      );
      if (!isStructured(emitOpts.format)) {
        console.log(chalk.bold("\nDry run: series run\n"));
        console.log(`  Theme:  ${chalk.dim(sanitizedTheme)}`);
        console.log(`  Count:  ${count}`);
        console.log(`  Cost:   ${chalk.yellow(formatCost(estimatedCost))}`);
      }
      return;
    }

    // A new Series pins the look and mood this run used.
    const config = await loadOrCreateRunSeries({
      aspect,
      look: creative?.look,
      mood: creative?.mood,
      resolution,
      series: opts.series,
      stylePrompt,
      theme: sanitizedTheme,
    });
    const outputDir = seriesOutputsDir(config.slug);
    const spinner = isStructured(emitOpts.format)
      ? null
      : ora(`Generating ${count} image series...`).start();
    const savedImages: {
      height?: number;
      path: string;
      scenePrompt: string;
      size: string;
      width?: number;
    }[] = [];
    let anchorPath: string | undefined;
    let totalCost: number | null = 0;
    let lastResult: TaskOutput | undefined;

    for (const [i, scene] of scenes.entries()) {
      const outputNum = String(config.outputs.length + i + 1).padStart(3, "0");
      const filename = `${outputNum}-${slugify(sanitizedTheme.slice(0, 40))}-${String(i + 1).padStart(2, "0")}.png`;
      const anchor =
        hasText(anchorPath) && canUseAnchorReference
          ? [await imageSource(anchorPath)]
          : [];
      const result = await runSeriesTask(
        client,
        sceneInput(i, plan.model, anchor),
        emitOpts
      );
      lastResult = result;
      const [file] = result.files;
      if (!file) {
        throw new Error("Series run returned no images");
      }
      // Recorded scene by scene: a later scene that fails must not lose the
      // ones already paid for.
      const prompt = result.prompt ?? scene.full;
      const saved = await saveGeneratedImages(
        [file],
        `${outputDir}/${filename}`,
        1,
        {
          aspect,
          costPerImage: result.cost.usd,
          look: creative?.look,
          model: result.model,
          mood: creative?.mood,
          prompt,
          resolution,
        }
      );
      const [image] = saved.images;
      if (image === undefined) {
        throw new Error("Series run saved no images");
      }
      anchorPath ??= image.path;
      totalCost =
        totalCost === null || result.cost.usd === null
          ? null
          : totalCost + result.cost.usd;
      savedImages.push({
        height: image.height,
        path: image.path,
        scenePrompt: scene.scene,
        size: image.size,
        width: image.width,
      });
      await recordOutput(config.slug, {
        aspect,
        cost: result.cost.usd,
        filename: basename(image.path),
        model: result.model,
        prompt,
        refsUsed: [
          ...(refTags ?? config.refs.map((ref) => ref.tag)),
          ...(anchor.length > 0 ? ["series-anchor"] : []),
        ],
        resolution,
        timestamp: new Date().toISOString(),
      });
    }

    spinner?.succeed("Generated series run");

    if (isStructured(emitOpts.format)) {
      emit(
        {
          aspect,
          command: "series-run",
          cost: totalCost,
          count,
          dryRun: false,
          images: savedImages,
          ...identityFields(lastResult ?? plan),
          resolution,
          series: config.slug,
          stylePrompt,
          theme: sanitizedTheme,
        },
        emitOpts
      );
    }

    openAfterRun(savedImages[0]?.path, opts.open);
  } catch (error) {
    handleError(error, "SERIES_GENERATE_FAILED", emitOpts.format);
  }
}

async function cmdDelete(slug: string, emitOpts: EmitOptions): Promise<void> {
  try {
    const config = await loadSeries(slug);
    await deleteSeries(slug);

    if (isStructured(emitOpts.format)) {
      emit({ command: "series-delete", name: config.name, slug }, emitOpts);
    } else {
      console.log(chalk.green(`✓ Deleted series: ${config.name}`));
    }
  } catch (error) {
    handleError(error, "SERIES_DELETE_FAILED", emitOpts.format);
  }
}

async function cmdHistory(
  slug: string,
  opts: { limit?: string; offset?: string },
  emitOpts: EmitOptions
): Promise<void> {
  try {
    const config = await loadSeries(slug);
    const all = [...config.outputs].reverse();
    const limit = validateOption(emitOpts.format, () =>
      parseIntegerOption(opts.limit ?? "10", "limit", { min: 1 })
    );
    const offset = validateOption(emitOpts.format, () =>
      parseIntegerOption(opts.offset ?? "0", "offset", { min: 0 })
    );
    const page = all.slice(offset, offset + limit);

    if (emitOpts.format === "ndjson") {
      // Spread into fresh literals: preserves key order, satisfies Record.
      emitStream(
        page.map((out) => ({ ...out })),
        emitOpts
      );
      return;
    }

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "series-history",
          hasMore: offset + limit < all.length,
          limit,
          offset,
          outputs: page,
          series: slug,
          total: all.length,
        },
        emitOpts
      );
      return;
    }

    if (page.length === 0) {
      console.log(chalk.yellow("No outputs yet in this series."));
      return;
    }

    console.log(
      chalk.bold(
        `\n${config.name} — Outputs (${offset + 1}-${offset + page.length} of ${all.length}):\n`
      )
    );
    for (const out of page) {
      console.log(`  ${chalk.dim(out.filename)}`);
      console.log(
        `    ${chalk.cyan(out.prompt.slice(0, 70))}${out.prompt.length > 70 ? "..." : ""}`
      );
      console.log(
        `    ${chalk.dim(`${formatCost(out.cost)} | refs: ${out.refsUsed.join(",")}`)}`
      );
    }
  } catch (error) {
    handleError(error, "SERIES_NOT_FOUND", emitOpts.format);
  }
}

// -- Router --

export async function runSeries(args: string[]): Promise<void> {
  const program = routeCommanderErrors(
    new Command()
      .name("motif series")
      .description("Manage image series for consistent styling")
      .option(
        "--format <format>",
        "Output format: json, human, ndjson (default: auto-detect from TTY)"
      )
      .option(
        "--fields <fields>",
        "Comma-separated fields to include in output"
      ),
    formatForParseErrors(args)
  );
  const emitOpts = (): EmitOptions => {
    const { fields, format } = program.opts<{
      fields?: string;
      format?: string;
    }>();
    return { fields, format: resolveFormat(format), sanitize: true };
  };

  program
    .command("create <name>")
    .description("Create a new series")
    .option("--from <image>", "Initial style reference image")
    .option("--style <prompt>", "Style prompt prefix for all generations")
    .option("--look <id>", "Pin a house look for every image, e.g. editorial")
    .option("--mood <id>", "Pin a light mood for every image, e.g. overcast")
    .option(
      "-a, --aspect <ratio>",
      "Default aspect ratio (default: the look's)"
    )
    .option("-r, --resolution <res>", "Default resolution")
    .action(async (name: string, opts: Parameters<typeof cmdCreate>[1]) => {
      await cmdCreate(name, opts, emitOpts());
    });

  program
    .command("list")
    .description("List all series")
    .action(async () => {
      await cmdList(emitOpts());
    });

  program
    .command("show <slug>")
    .description("Show series details")
    .action(async (slug: string) => {
      await cmdShow(slug, emitOpts());
    });

  program
    .command("ref-add <slug> <image>")
    .description("Add a reference image to a series")
    .option(
      "-t, --tag <tag>",
      "Tag for the reference (e.g. character, location)",
      "style"
    )
    .option("-d, --description <desc>", "Description of the reference")
    .action(
      async (
        slug: string,
        image: string,
        opts: Parameters<typeof cmdRefAdd>[2]
      ) => {
        await cmdRefAdd(slug, image, opts, emitOpts());
      }
    );

  program
    .command("ref-remove <slug> <filename>")
    .description("Remove a reference image from a series")
    .action(async (slug: string, filename: string) => {
      await cmdRefRemove(slug, filename, emitOpts());
    });

  program
    .command("gen <slug> <prompt>")
    .description("Generate an image in a series with consistent styling")
    .option(
      "--refs <tags>",
      "Comma-separated ref tags to include (default: all)"
    )
    .option("-a, --aspect <ratio>", "Aspect ratio (overrides series default)")
    .option("-r, --resolution <res>", "Resolution (overrides series default)")
    .option("-m, --model <model>", "Model (overrides series default)")
    .option("-o, --output <file>", "Output filename")
    .option("-n, --num <count>", "Number of images 1-4")
    .option("--look <id>", "House look id, e.g. editorial")
    .option("--mood <id>", "Light mood id, e.g. overcast")
    .option("--no-mood", "Drop any mood, including the series' pinned one")
    .option("--open", "Open the result in a viewer")
    .option("--dry-run", "Validate without API call")
    .action(
      async (
        slug: string,
        prompt: string,
        opts: Parameters<typeof cmdGenerate>[2]
      ) => {
        await cmdGenerate(slug, prompt, opts, emitOpts());
      }
    );

  program
    .command("run <theme>")
    .description("Plan and generate a themed multi-image series run")
    .option("-c, --count <n>", "Number of images to generate", "4")
    .option("--series <slug>", "Existing series to run inside")
    .option("--style <prompt>", "Shared style prompt for the run")
    .option(
      "--refs <tags>",
      "Comma-separated ref tags to include from an existing series"
    )
    .option("-a, --aspect <ratio>", "Aspect ratio")
    .option("-r, --resolution <res>", "Resolution")
    .option("-m, --model <model>", "Model")
    .option("--tier <tier>", `Trade cost against quality: ${TIERS.join(", ")}`)
    .option("--look <id>", "House look id, e.g. editorial")
    .option("--mood <id>", "Light mood id, e.g. overcast")
    .option("--no-mood", "Drop any mood, including the series' pinned one")
    .option("--open", "Open the result in a viewer")
    .option("--dry-run", "Validate and plan without API call")
    .action(async (theme: string, opts: Parameters<typeof cmdRun>[1]) => {
      await cmdRun(theme, opts, emitOpts());
    });

  program
    .command("history <slug>")
    .description("Show generation history for a series")
    .option("--limit <n>", "Entries per page", "10")
    .option("--offset <n>", "Skip first N entries", "0")
    .action(async (slug: string, opts: Parameters<typeof cmdHistory>[1]) => {
      await cmdHistory(slug, opts, emitOpts());
    });

  program
    .command("delete <slug>")
    .description("Delete a series and all its data")
    .action(async (slug: string) => {
      await cmdDelete(slug, emitOpts());
    });

  await program.parseAsync(["node", "motif-series", ...args]);
}
