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

import { resolve } from "node:path";

import { formatCost, MotifError } from "@howells/motif-sdk";
import type {
  AspectRatio,
  MotifClient,
  Resolution,
  TaskId,
  TaskInput,
  TaskOutput,
  TaskPlan,
} from "@howells/motif-sdk";
import chalk from "chalk";
import ora from "ora";
import type { Ora } from "ora";

import type { Generation, MotifConfig } from "../utils/config";
import {
  addGeneration,
  loadHistory,
  getLastGeneration,
  historyPrompt,
  newGeneration,
} from "../utils/config";
import {
  exitIfNotRecorded,
  exitIfNotSaved,
  exitNoPrevious,
  handleError,
  recordingFailure,
  validateOutput,
} from "../utils/errors";
import {
  generateFilename,
  withExtension,
  withFileExtension,
} from "../utils/image";
import {
  imageSource,
  isVideoPath,
  motifClient,
  planForOutput,
  redactDataUrls,
  REMOTE_URL_REGEX,
  videoSource,
} from "../utils/motif-client";
import { emit, isStructured, savedLine } from "../utils/output";
import type { EmitOptions } from "../utils/output";
import {
  derivedOutputPath,
  openAfterRun,
  prepareOutput,
  saveFiles,
} from "../utils/output-files";
import type { WrittenFile } from "../utils/output-files";
import {
  exitAfterRunFailed,
  exitTaskError,
  taskFields,
} from "../utils/task-model";
import { hasText } from "../utils/text";
import { readVideoHeader } from "../utils/video-header";

export interface TaskRunSpec {
  /** The verb, as emitted and recorded in history. */
  command: string;
  task: TaskId;
  /** Everything but the source, which the kernel fills in. */
  input: TaskInput;
  /** Reference image paths as given, recorded in history beside the source. */
  referencePaths?: readonly string[];
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
  open?: boolean;
}

export interface ResolvedSource {
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
    exitNoPrevious(
      `No previous generation to run ${spec.command} against`,
      emitOpts.format
    );
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
    const name = withExtension(generateFilename(spec.command), extension);
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
  return target.directoryMode
    ? target.path
    : withFileExtension(target.path, outputExtension(spec, video));
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
    if (!video) {
      return { image: await imageSource(source.path) };
    }
    const header = REMOTE_URL_REGEX.test(source.path)
      ? undefined
      : await readVideoHeader(source.path);
    return {
      ...(header !== undefined && { sourceVideo: header }),
      video: await videoSource(client, source.path, dryRun),
    };
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

/** The history entry for a run that wrote files. */
export function generationRecord(
  spec: TaskRunSpec,
  output: Pick<TaskOutput, "cost" | "model">,
  source: ResolvedSource | undefined,
  primary: Pick<WrittenFile, "path">
): Generation {
  return newGeneration({
    aspect: source?.aspect ?? "1:1",
    cost: output.cost.usd,
    editedFrom: source === undefined ? undefined : resolve(source.path),
    model: output.model,
    output: primary.path,
    prompt: historyPrompt(spec.command, source?.prompt ?? spec.input.prompt),
    references: (spec.referencePaths ?? []).map((path) =>
      REMOTE_URL_REGEX.test(path) ? path : resolve(path)
    ),
    resolution: source?.resolution ?? "1K",
  });
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
  await addGeneration(generationRecord(spec, output, source, primary));
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
        size: plan.size,
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

  // Spending comes last: a history file that cannot be used must fail before
  // fal bills anything, not after.
  if (spec.writesFiles) {
    await loadHistory();
    await prepareOutput(
      target.path,
      target.directoryMode ? "directory" : "file",
      emitOpts.format
    );
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
    const { failed, written } = await saveFiles(
      output.files,
      target.directoryMode
        ? { directory: target.path }
        : { paths: [target.path] }
    );
    spinner?.succeed(`${spec.verb} complete`);
    if (withChrome) {
      for (const file of written) {
        console.log(savedLine(file));
      }
    }
    const [primary] = written;
    const recording = await recordingFailure(async () => {
      await recordRun(spec, output, source, primary);
    });

    const fields = {
      command: spec.command,
      ...taskFields(output),
      source: source?.path ?? null,
      files: written,
      requestId: output.requestId,
      ...(failed.length > 0 && { failed }),
      ...(recording === undefined
        ? {}
        : { historyFailure: recording, historyRecorded: false }),
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
    openAfterRun(primary?.path, input.open);
    exitIfNotSaved(
      failed,
      { ...context, requestId: output.requestId },
      emitOpts.format
    );
    exitIfNotRecorded(recording, emitOpts.format);
  } catch (error) {
    spinner?.fail(`${spec.verb} failed`);
    exitAfterRunFailed(error, context, emitOpts.format);
  }
}
