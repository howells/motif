/**
 * The one pipeline every Task verb runs through.
 *
 * A verb is a spec: which Task, the TaskInput its flags built, and how its
 * output reads. The kernel does the rest the same way for every verb: resolve
 * the source (an explicit path, else the last generation, unless the Task can
 * run from a prompt alone), work out where the
 * output lands, plan through the SDK client for a dry run or run for real,
 * download the files, record history and emit.
 *
 *   - A Task can return several files (masks, layers, PBR maps). `-o` ending
 *     in `/` writes all of them; `-o` naming a file writes the primary only.
 *   - A Task can return no file at all (`ask`). Those emit their data and
 *     record no history.
 */

import { extname, resolve } from "node:path";

import { formatCost, MotifError } from "@howells/motif-sdk";
import type {
  AspectRatio,
  MotifClient,
  Resolution,
  TaskFile,
  TaskId,
  TaskInput,
  TaskOutput,
  TaskPlan,
} from "@howells/motif-sdk";
import chalk from "chalk";
import ora from "ora";
import type { Ora } from "ora";

import type { MotifConfig } from "../utils/config";
import { addGeneration, generateId, getLastGeneration } from "../utils/config";
import { exitForErrorCode, handleError, validateOutput } from "../utils/errors";
import {
  downloadAll,
  generateFilename,
  openImage,
  writeArtifact,
} from "../utils/image";
import type { OutputLabels, WrittenFile } from "../utils/image";
import { validateOutputPath } from "../utils/input";
import {
  imageSource,
  isVideoPath,
  motifClient,
  planForOutput,
  redactDataUrls,
  videoSource,
} from "../utils/motif-client";
import { emit, emitError, isStructured } from "../utils/output";
import type { EmitOptions } from "../utils/output";
import { exitTaskError, exitTaskFailed } from "../utils/task-model";
import { hasText } from "../utils/text";

/** Extensions `derivedOutputPath` strips before appending its suffix. */
const SOURCE_EXT_REGEX = /\.(png|jpg|jpeg|webp|mp4|mov|m4v|webm)$/i;
const RASTER_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const URL_TAIL_REGEX = /[?#]/;
const FILE_EXTENSION_REGEX = /^\.[a-z0-9]{1,8}$/i;
/** A history prompt's leading `[verb] ` tag, from an earlier Task run. */
const HISTORY_TAG_REGEX = /^\[[\w-]+\]\s*/;

export interface TaskRunSpec {
  /** The verb, as emitted and recorded in history. */
  command: string;
  task: TaskId;
  /** Everything but the source, which the kernel fills in. */
  input: TaskInput;
  /** Whether a video path is a valid source. */
  sourceKind: "image" | "image-or-video";
  /**
   * The Task runs from its prompt when no source is given, so the kernel
   * doesn't fall back to the last generation.
   */
  sourceOptional?: boolean;
  /** Suffix on the source filename when there is no `-o`, e.g. `-erase`. */
  outputSuffix: string;
  /** Extension of the derived output path. Defaults to `.png`. */
  extension?: string;
  /** Present participle for the spinner, e.g. "Erasing". */
  verb: string;
  /** False when the output is data rather than files. */
  writesFiles: boolean;
  /** Suppress headings, spinner and saved lines in human format. */
  quiet?: boolean;
  /** Extra fields for both the dry-run and the success payload. */
  detail?: Record<string, unknown>;
  /** Non-file fields to emit. Defaults to the output's own data. */
  data?: (output: TaskOutput) => Record<string, unknown>;
  /** Human-format body printed after the run, e.g. an answer. */
  render?: (output: TaskOutput) => string | undefined;
}

export interface TaskRunInput {
  /** Explicit source path or URL. Falls back to the last generation. */
  source?: string;
  /** An output file, or a directory ending in `/` for every file. */
  output?: string;
  dryRun?: boolean;
  noOpen?: boolean;
}

interface ResolvedSource {
  aspect: AspectRatio;
  path: string;
  /** The prompt of the generation this came from; empty for a given path. */
  prompt: string;
  resolution: Resolution;
}

interface Target {
  directoryMode: boolean;
  path: string;
}

function derivedOutputPath(
  sourcePath: string,
  suffix: string,
  extension: string
): string {
  const stem = sourcePath.replace(SOURCE_EXT_REGEX, "");
  try {
    return validateOutputPath(`${stem}${suffix}${extension}`);
  } catch {
    const name =
      sourcePath.split("/").at(-1)?.replace(SOURCE_EXT_REGEX, "") ?? "motif";
    return validateOutputPath(`${name || "motif"}${suffix}${extension}`);
  }
}

async function resolveSource(
  input: TaskRunInput,
  spec: TaskRunSpec,
  emitOpts: EmitOptions
): Promise<ResolvedSource | undefined> {
  if (hasText(input.source)) {
    return {
      aspect: "1:1",
      path: input.source,
      prompt: "",
      resolution: "1K",
    };
  }
  if (spec.sourceOptional === true) {
    return undefined;
  }
  const last = await getLastGeneration();
  if (!last) {
    emitError(
      {
        code: "NO_PREVIOUS",
        message: `No previous generation to run ${spec.command} against`,
      },
      emitOpts.format
    );
    exitForErrorCode("NO_PREVIOUS");
  }
  return {
    aspect: last.aspect,
    path: last.output,
    prompt: last.prompt,
    resolution: last.resolution,
  };
}

/** The extension the written file takes: the spec's, `.mp4` for video, else `.png`. */
function outputExtension(spec: TaskRunSpec, video: boolean): string {
  return spec.extension ?? (video ? ".mp4" : ".png");
}

function resolveTarget(
  input: TaskRunInput,
  source: ResolvedSource | undefined,
  spec: TaskRunSpec,
  video: boolean,
  emitOpts: EmitOptions
): Target {
  if (hasText(input.output)) {
    return {
      directoryMode: input.output.endsWith("/"),
      path: validateOutput(emitOpts.format, input.output),
    };
  }
  const extension = outputExtension(spec, video);
  if (source === undefined) {
    const name = generateFilename(spec.command).replace(/\.png$/, extension);
    return {
      directoryMode: false,
      path: validateOutput(emitOpts.format, name),
    };
  }
  return {
    directoryMode: false,
    path: derivedOutputPath(source.path, spec.outputSuffix, extension),
  };
}

/**
 * Where a dry run says the file lands: null when the Task writes no file, and
 * a file target carries the extension the file will take, as `targetFor`
 * corrects it on a real run.
 */
function plannedOutput(
  spec: TaskRunSpec,
  target: Target,
  video: boolean
): string | null {
  if (!spec.writesFiles) {
    return null;
  }
  const extension = outputExtension(spec, video);
  const current = extname(target.path).toLowerCase();
  if (
    target.directoryMode ||
    RASTER_EXTENSIONS.has(extension) ||
    current === extension
  ) {
    return target.path;
  }
  return current === ""
    ? `${target.path}${extension}`
    : `${target.path.slice(0, -current.length)}${extension}`;
}

/** The source as the SDK takes it: `image` or `video`. */
async function sourceInput(
  client: MotifClient,
  spec: TaskRunSpec,
  source: ResolvedSource | undefined,
  video: boolean,
  dryRun: boolean,
  emitOpts: EmitOptions
): Promise<TaskInput> {
  if (source === undefined) {
    return {};
  }
  try {
    return video
      ? { video: await videoSource(client, source.path, dryRun) }
      : { image: await imageSource(source.path) };
  } catch (error) {
    exitSourceError(error, spec, emitOpts);
  }
}

function exitSourceError(
  error: unknown,
  spec: TaskRunSpec,
  emitOpts: EmitOptions
): never {
  if (error instanceof MotifError) {
    exitTaskError(error, emitOpts.format, { task: spec.task });
  }
  handleError(error, "INVALID_IMAGE_PATH", emitOpts.format);
}

/** Extension carried by a URL path, ignoring query and fragment. */
function urlExtension(url: string): string {
  const extension = extname(url.split(URL_TAIL_REGEX)[0] ?? "").toLowerCase();
  return FILE_EXTENSION_REGEX.test(extension) ? extension : "";
}

/**
 * A file target whose extension the file cannot honour takes the file's own:
 * a video, an SVG or a mesh named `.png` would open as a broken image. Raster
 * mismatches are corrected from the bytes when the download lands.
 */
function targetFor(path: string, file: TaskFile): string {
  const fileExtension = urlExtension(file.url);
  const current = extname(path).toLowerCase();
  if (
    fileExtension === "" ||
    RASTER_EXTENSIONS.has(fileExtension) ||
    current === fileExtension
  ) {
    return path;
  }
  return current === ""
    ? `${path}${fileExtension}`
    : `${path.slice(0, -current.length)}${fileExtension}`;
}

/** Label names per output key, for `downloadAll`'s file stems. */
function labelsOf(files: readonly TaskFile[]): OutputLabels {
  const labels: Record<string, string[]> = {};
  for (const file of files) {
    if (file.label !== undefined) {
      (labels[file.key] ??= []).push(file.label);
    }
  }
  return labels;
}

async function writeFiles(
  files: readonly TaskFile[],
  target: Target
): Promise<WrittenFile[]> {
  if (target.directoryMode) {
    return await downloadAll(
      files.map(({ key, url }) => ({ key, url })),
      target.path,
      labelsOf(files)
    );
  }
  const primary = files[0];
  if (!primary) {
    return [];
  }
  return [
    await writeArtifact(
      primary.key,
      primary.url,
      targetFor(target.path, primary)
    ),
  ];
}

function taskFields(
  plan: Pick<TaskPlan, "chosenBy" | "cost" | "mode" | "model" | "task" | "tier">
): Record<string, unknown> {
  return {
    task: plan.task,
    model: plan.model,
    tier: plan.tier,
    chosenBy: plan.chosenBy,
    ...(plan.mode === undefined ? {} : { mode: plan.mode }),
    cost: plan.cost.usd,
    costBasis: plan.cost.basis,
  };
}

function printDryRun(
  spec: TaskRunSpec,
  plan: TaskPlan,
  source: ResolvedSource | undefined,
  output: string | null
): void {
  console.log(chalk.bold("\nDry run: no API call made\n"));
  console.log(
    `  Task:   ${spec.command}${plan.mode === undefined ? "" : ` (${plan.mode})`} | Tier: ${plan.tier}`
  );
  console.log(
    `  Source: ${chalk.dim(source?.path ?? "none, from the prompt")}`
  );
  console.log(`  Output: ${chalk.dim(output ?? "none, data only")}`);
  console.log(`  Cost:   ${chalk.yellow(formatCost(plan.cost.usd))}`);
}

function reportWritten(written: readonly WrittenFile[]): void {
  for (const file of written) {
    const dims =
      file.width !== undefined && file.height !== undefined
        ? `${file.width}x${file.height}, `
        : "";
    console.log(
      chalk.green(`✓ Saved: ${file.path}`) + chalk.dim(` (${dims}${file.size})`)
    );
  }
}

function startProgress(
  spec: TaskRunSpec,
  source: ResolvedSource | undefined,
  withChrome: boolean
): {
  report: (status: string, queuePosition?: number) => void;
  spinner: Ora | null;
} {
  if (withChrome) {
    console.log(chalk.bold(`\n${spec.verb}...`));
    if (source !== undefined) {
      console.log(`Source: ${chalk.dim(source.path)}`);
    }
  }
  const spinner = withChrome ? ora(`${spec.verb}...`).start() : null;
  return {
    report: (status, queuePosition) => {
      if (spinner) {
        spinner.text =
          queuePosition === undefined
            ? `${spec.verb}... ${status}`
            : `${spec.verb}... ${status}, queue position ${queuePosition}`;
      }
    },
    spinner,
  };
}

/** Kernel fields win over any data field of the same name. */
function withoutKeys(
  data: Record<string, unknown>,
  reserved: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => !(key in reserved))
  );
}

/**
 * The history prompt for a Task run: `[verb]`, then the prompt it came from.
 * A source made by an earlier Task run already carries a tag, which is
 * replaced so history never reads "[layers] [layers]".
 */
export function historyPrompt(
  command: string,
  prompt: string | undefined
): string {
  const base = (prompt ?? "").replace(HISTORY_TAG_REGEX, "").trim();
  return hasText(base) ? `[${command}] ${base}` : `[${command}]`;
}

async function recordRun(
  spec: TaskRunSpec,
  output: TaskOutput,
  source: ResolvedSource | undefined,
  primary: WrittenFile | undefined
): Promise<void> {
  if (!primary) {
    return;
  }
  await addGeneration({
    aspect: source?.aspect ?? "1:1",
    cost: output.cost.usd,
    ...(source !== undefined && { editedFrom: resolve(source.path) }),
    id: generateId(),
    model: output.model,
    output: primary.path,
    prompt: historyPrompt(spec.command, source?.prompt ?? spec.input.prompt),
    resolution: source?.resolution ?? "1K",
    timestamp: new Date().toISOString(),
  });
}

export async function runTask(
  spec: TaskRunSpec,
  input: TaskRunInput,
  config: MotifConfig,
  emitOpts: EmitOptions
): Promise<void> {
  const dryRun = input.dryRun === true;
  const source = await resolveSource(input, spec, emitOpts);
  const video =
    source !== undefined &&
    spec.sourceKind === "image-or-video" &&
    isVideoPath(source.path);
  const target = resolveTarget(input, source, spec, video, emitOpts);
  const client = motifClient(config);
  const taskInput: TaskInput = {
    ...spec.input,
    ...(await sourceInput(client, spec, source, video, dryRun, emitOpts)),
  };

  const planned = planForOutput(
    client,
    spec.task,
    taskInput,
    target.directoryMode ? undefined : target.path,
    dryRun
  );
  if (planned.isErr()) {
    exitTaskError(planned.error, emitOpts.format, { task: spec.task });
  }
  const { plan } = planned.value;

  if (dryRun) {
    const output = plannedOutput(spec, target, video);
    emit(
      {
        command: spec.command,
        dryRun: true,
        ...taskFields(plan),
        output,
        source: source?.path ?? null,
        ...spec.detail,
        request: redactDataUrls(plan.body),
        valid: true,
      },
      emitOpts
    );
    if (!isStructured(emitOpts.format)) {
      printDryRun(spec, plan, source, output);
    }
    return;
  }

  const withChrome = !isStructured(emitOpts.format) && spec.quiet !== true;
  const { report, spinner } = startProgress(spec, source, withChrome);
  const context = { model: plan.model, task: spec.task };
  const ran = await client.run(spec.task, {
    ...planned.value.input,
    onProgress: report,
  });
  if (ran.isErr()) {
    spinner?.fail(`${spec.verb} failed`);
    exitTaskError(ran.error, emitOpts.format, context);
  }
  const output = ran.value;

  try {
    if (output.files.length === 0 && spec.writesFiles) {
      throw new Error(
        `${spec.command} produced no downloadable output: the response carried no files`
      );
    }
    const written = await writeFiles(output.files, target);
    spinner?.succeed(`${spec.verb} complete`);
    if (withChrome) {
      reportWritten(written);
    }
    const [primary] = written;
    await recordRun(spec, output, source, primary);

    const fields = {
      command: spec.command,
      ...taskFields(output),
      source: source?.path ?? null,
      files: written,
      ...(primary === undefined
        ? {}
        : {
            height: primary.height,
            path: primary.path,
            size: primary.size,
            width: primary.width,
          }),
      ...spec.detail,
    };
    const data = spec.data?.(output) ?? output.data;
    emit({ ...fields, ...withoutKeys(data, fields) }, emitOpts);

    if (!isStructured(emitOpts.format)) {
      const body = spec.render?.(output);
      if (hasText(body)) {
        console.log(body);
      }
    }
    if (primary && config.openAfterGenerate && input.noOpen !== true) {
      openImage(primary.path);
    }
  } catch (error) {
    spinner?.fail(`${spec.verb} failed`);
    exitTaskFailed(
      error instanceof Error ? error.message : String(error),
      context,
      emitOpts.format
    );
  }
}
