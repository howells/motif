/** `motif series run`: a themed set of scenes, each generated in the one Series' style. */

import { basename } from "node:path";

import {
  ASPECT_RATIOS,
  enrichPrompt,
  formatCost,
  modelProfile,
  RESOLUTIONS,
  sanitizePrompt,
  TIERS,
} from "@howells/motif-sdk";
import type { TaskOutput } from "@howells/motif-sdk";
import chalk from "chalk";
import ora from "ora";

import { loadConfig, loadHistory } from "../../utils/config";
import {
  exitForErrorCode,
  exitIfNotRecorded,
  handleError,
  recordingFailure,
  validateOption,
} from "../../utils/errors";
import type { RecordingFailure } from "../../utils/errors";
import {
  parseIntegerOption,
  validateEnumOption,
  validateResourceId,
} from "../../utils/input";
import {
  imageSource,
  imageSources,
  motifClient,
} from "../../utils/motif-client";
import { emit, emitError, isStructured } from "../../utils/output";
import type { EmitOptions } from "../../utils/output";
import { openAfterRun } from "../../utils/output-files";
import {
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
  buildSeriesRunScenes,
  buildSeriesRunStylePrompt,
  loadOrCreateRunSeries,
  SERIES_RUN_MAX_COUNT,
} from "./scenes";
import {
  anchoredSize,
  PLANNING_ANCHOR,
  planScenes,
  runSeriesTask,
  sentSize,
  seriesCreativeDirection,
  seriesInput,
  splitRefTags,
} from "./shared";

/** The sum of the prices, or null when any is unknown. */
function sumKnown(prices: readonly (number | null)[]): number | null {
  let total = 0;
  for (const price of prices) {
    if (price === null) {
      return null;
    }
    total += price;
  }
  return total;
}

export async function cmdRun(
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
    const anchored = anchoredSize(opts, { aspect, resolution });
    const sceneInput = (index: number, model?: string, extra: string[] = []) =>
      seriesInput({
        count: 1,
        creative,
        model,
        prompt: scenes[index]?.request ?? sanitizedTheme,
        references: [...references, ...extra],
        size: extra.length > 0 ? anchored : size,
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

    // Planning is pure and free: plan every scene as the run will send it,
    // later scenes anchored on the first, and refuse the whole run now if any
    // cannot be planned, rather than after the first scenes are paid for.
    const scenePlans = planScenes(count, (index) =>
      index === 0
        ? planned
        : client.plan(
            "generate",
            sceneInput(
              index,
              plan.model,
              canUseAnchorReference ? [PLANNING_ANCHOR] : []
            ),
            { dryRun }
          )
    );
    if ("error" in scenePlans) {
      exitTaskError(scenePlans.error, emitOpts.format, { task: "generate" });
    }
    const estimatedCost = sumKnown(
      scenePlans.plans.map((scenePlan) => scenePlan.cost.usd)
    );

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
          size: plan.size,
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
            model: scenePlans.plans[index]?.model,
            prompt: full,
            scenePrompt: scene,
            size: scenePlans.plans[index]?.size,
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

    // Spending comes last: a history file that cannot be used must fail
    // before fal bills anything, not after.
    await loadHistory();

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
    let failure: RecordingFailure | undefined;

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
      const seriesFailure = await recordingFailure(async () => {
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
      });
      failure = saved.historyFailure ?? seriesFailure;
      if (failure !== undefined) {
        // Later scenes would be paid for and unrecorded too: stop here.
        break;
      }
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
          ...(failure !== undefined && {
            historyFailure: failure,
            historyRecorded: false,
          }),
        },
        emitOpts
      );
    }

    openAfterRun(savedImages[0]?.path, opts.open);
    exitIfNotRecorded(failure, emitOpts.format);
  } catch (error) {
    handleError(error, "SERIES_GENERATE_FAILED", emitOpts.format);
  }
}
