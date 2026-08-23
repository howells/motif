/**
 * Shared pipeline for single-source image operations.
 *
 * `upscaleLast` and `removeBackgroundLast` each spell out the same nine steps:
 * resolve a source image, derive an output path, short-circuit on --dry-run,
 * spin, call fal, download, measure, record history, emit. Every promoted verb
 * (segment, erase, reframe, enhance, layers, vectorize) needs the same nine,
 * and copying them per verb is how the drift starts.
 *
 * A verb is therefore a descriptor over `runImageOperation`, not a function
 * that repeats the pipeline. Two behaviours here have no precedent in
 * postprocess.ts and are the reason this is shared rather than duplicated:
 *
 *   - Operations may return several files (segmentation masks, layer sets,
 *     3D meshes plus textures). `-o` pointing at a directory writes all of
 *     them; `-o` pointing at a file writes the primary only.
 *   - Operations may return no file at all (`ask` returns text and boxes).
 *     Those emit and skip both download and history.
 */

import type { AspectRatio, Resolution } from "@howells/motif-sdk";
import chalk from "chalk";
import ora from "ora";
import type { Ora } from "ora";

import { addGeneration, generateId, getLastGeneration } from "../utils/config";
import { exitForErrorCode, handleError, validateOutput } from "../utils/errors";
import {
  downloadAll,
  imageToDataUrl,
  openImage,
  writeArtifact,
} from "../utils/image";
import type { UrlArtifact, WrittenFile } from "../utils/image";
import { validateEditPath, validateOutputPath } from "../utils/input";
import { emit, emitError, isStructured } from "../utils/output";
import type { EmitOptions } from "../utils/output";
import { hasText } from "../utils/text";

/** Extensions `derivedOutputPath` will strip before appending its suffix. */
const IMAGE_EXT_REGEX = /\.(png|jpg|jpeg|webp)$/i;

/**
 * Artefacts and written files use the shared shapes from `utils/image`, so a
 * verb and `motif tool run` write multi-file output identically — same naming,
 * same extension handling, same directory creation.
 */
export type { UrlArtifact, WrittenFile } from "../utils/image";

/**
 * Report progress from inside a long `run`, e.g. a queued job's position.
 * Updates the spinner in human format; a no-op under structured output and
 * under `quiet`, so a verb can pass it on without checking either.
 */
export type OperationProgress = (
  status: string,
  queuePosition?: number
) => void;

/**
 * The half of a spec that does not depend on the result type: everything the
 * dry-run, spinner and history entry need. Split out so presentation helpers
 * can take it without the call sites having to widen `TResult` to `unknown`.
 */
interface OperationPresentation {
  /** Command name used in emitted payloads and the history prompt prefix. */
  command: string;
  /**
   * Flat USD estimate, shown in dry-run and recorded against history.
   *
   * `null` where the registry price is metered or per-unit and the real cost
   * depends on output size — unknown before the call, and deliberately not
   * guessed. Rendered as "metered", never as $0.000: a zero that means
   * "we don't know" is indistinguishable from one that means "free". See
   * MOT-38 for the history side of the same problem.
   */
  estimatedCost: number | null;
  /** Error code passed to `handleError` when `run` throws. */
  errorCode: string;
  /** Model or fal tool id, shown in dry-run and recorded against history. */
  model: string;
  /**
   * Suffix appended to the source filename when the caller gives no `-o`,
   * e.g. `-nobg`. Ignored by operations that write nothing.
   */
  outputSuffix: string;
  /** Present participle for the spinner and headings, e.g. "Segmenting". */
  verb: string;
  /** Extra fields merged into both the dry-run and the success payload. */
  detail?: Record<string, unknown>;
  /**
   * Set false for operations whose output is data rather than files, so an
   * empty artefact list is a legitimate result instead of a failure.
   */
  writesFiles?: false;
  /**
   * Suppress the heading, spinner and per-file lines in human format.
   *
   * For operations whose output is prose rather than a file: an answer wrapped
   * in "Asking… / Source: … / ✓ complete" furniture is harder to read than the
   * answer alone, and impossible to pipe.
   */
  quiet?: boolean;
}

export interface ImageOperationSpec<TResult> extends OperationPresentation {
  /**
   * Perform the call. Receives the source image as a data URL, and a reporter
   * for long-running work — pass it straight to a queued SDK call's
   * `onProgress` so queue position reaches the spinner.
   */
  run: (sourceDataUrl: string, report: OperationProgress) => Promise<TResult>;
  /**
   * Downloadable artefacts in the result, most important first. Return an
   * empty array for operations whose output is data rather than files.
   */
  artifacts: (result: TResult) => UrlArtifact[];
  /** Non-file fields to merge into the emitted payload, e.g. boxes, scores, text. */
  data?: (result: TResult) => Record<string, unknown>;
  /** Human-format body printed after the operation, e.g. an answer. */
  render?: (result: TResult) => string | undefined;
}

export interface ImageOperationInput {
  /** Explicit source image path. Falls back to the last generation. */
  source?: string;
  /** Explicit output file, or a directory to receive every artefact. */
  output?: string;
  dryRun?: boolean;
  noOpen?: boolean;
  /** Whether the resolved config wants outputs opened after writing. */
  openAfterWrite?: boolean;
}

interface ResolvedSource {
  aspect: AspectRatio;
  path: string;
  prompt: string;
  resolution: Resolution;
}

/**
 * A trailing separator means "write everything here". Anything else is a
 * single file and only the primary artefact lands. Only the separator is
 * checked — an existing directory named without one is treated as a file
 * path, which is what `-o masks` does.
 */
function isDirectoryTarget(output: string): boolean {
  return output.endsWith("/");
}

function derivedOutputPath(sourcePath: string, suffix: string): string {
  const preferred = sourcePath.replace(IMAGE_EXT_REGEX, `${suffix}.png`);
  try {
    return validateOutputPath(preferred);
  } catch {
    const stem =
      sourcePath.split("/").at(-1)?.replace(IMAGE_EXT_REGEX, "") ?? "motif";
    return validateOutputPath(`${stem || "motif"}${suffix}.png`);
  }
}

/**
 * Resolve the image an operation runs against: an explicit path when given,
 * otherwise the last generation. Carries the source's aspect and resolution
 * so the history entry stays comparable with the generation it came from.
 */
async function resolveSource(
  input: ImageOperationInput,
  emitOpts: EmitOptions,
  command: string
): Promise<ResolvedSource> {
  if (hasText(input.source)) {
    try {
      return {
        aspect: "1:1",
        path: validateEditPath(input.source),
        prompt: `[${command}]`,
        resolution: "1K",
      };
    } catch (error) {
      handleError(error, "INVALID_IMAGE_PATH", emitOpts.format);
    }
  }

  const last = await getLastGeneration();
  if (!last) {
    emitError(
      {
        code: "NO_PREVIOUS",
        message: `No previous generation to run ${command} against`,
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

/** Where output lands: a directory receiving everything, or one exact file. */
function resolveTarget(
  input: ImageOperationInput,
  source: ResolvedSource,
  spec: OperationPresentation,
  emitOpts: EmitOptions
): { directoryMode: boolean; path: string } {
  if (!hasText(input.output)) {
    return {
      directoryMode: false,
      path: derivedOutputPath(source.path, spec.outputSuffix),
    };
  }
  if (isDirectoryTarget(input.output)) {
    // Validate the directory exactly as a file target is validated. Skipping
    // it let `-o ../../elsewhere/` and `-o /anywhere/` write outside CWD,
    // while the same path as a file was correctly rejected.
    return {
      directoryMode: true,
      path: validateOutput(emitOpts.format, input.output),
    };
  }
  return {
    directoryMode: false,
    path: validateOutput(emitOpts.format, input.output),
  };
}

function emitDryRun(
  spec: OperationPresentation,
  source: ResolvedSource,
  outputPath: string,
  emitOpts: EmitOptions
): void {
  emit(
    {
      command: spec.command,
      dryRun: true,
      estimatedCost: spec.estimatedCost,
      model: spec.model,
      output: outputPath,
      source: source.path,
      valid: true,
      ...spec.detail,
    },
    emitOpts
  );
  if (isStructured(emitOpts.format)) {
    return;
  }
  console.log(chalk.bold("\n🔍 Dry run — no API call made\n"));
  console.log(`  Source: ${chalk.dim(source.path)}`);
  console.log(`  Model:  ${spec.model}`);
  console.log(`  Output: ${chalk.dim(outputPath)}`);
  console.log(
    `  Cost:   ${chalk.yellow(
      spec.estimatedCost === null
        ? "metered — billed on output size"
        : `~$${spec.estimatedCost.toFixed(3)}`
    )}`
  );
}

function reportWritten(written: WrittenFile[]): void {
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

/** Primary-artefact fields, flattened so `--fields path,cost` keeps working. */
function primaryFields(
  primary: WrittenFile | undefined
): Record<string, unknown> {
  if (!primary) {
    return {};
  }
  return {
    height: primary.height,
    path: primary.path,
    size: primary.size,
    width: primary.width,
  };
}

/**
 * Directory targets take every artefact; a file target takes the primary only.
 * An operation that produces no file (`ask`) writes nothing, which is not an
 * error — it is the whole point of that case.
 */
async function writeArtifacts(
  artifacts: UrlArtifact[],
  target: { directoryMode: boolean; path: string }
): Promise<WrittenFile[]> {
  if (target.directoryMode) {
    return await downloadAll(artifacts, target.path);
  }
  const primary = artifacts[0];
  if (!primary) {
    return [];
  }
  return [await writeArtifact(primary.key, primary.url, target.path)];
}

/** Human format, minus the operations that suppress their own chrome. */
function chrome(spec: OperationPresentation, emitOpts: EmitOptions): boolean {
  return !isStructured(emitOpts.format) && spec.quiet !== true;
}

/** Start the spinner, and the reporter that writes queue position into it. */
function startProgress(
  spec: OperationPresentation,
  source: ResolvedSource,
  withChrome: boolean
): { report: OperationProgress; spinner: Ora | null } {
  if (withChrome) {
    console.log(chalk.bold(`\n${spec.verb}...`));
    console.log(`Source: ${chalk.dim(source.path)}`);
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

/**
 * A verb that should have produced a file and produced none has failed,
 * however healthy the response looked: fal renaming an output key leaves the
 * registry claiming a field that is no longer there, and reporting success
 * with nothing written sends a pipeline on to a stale or absent file.
 * Operations whose output is data declare `writesFiles: false`.
 */
function requireArtifacts(
  spec: OperationPresentation,
  artifacts: UrlArtifact[]
): UrlArtifact[] {
  if (artifacts.length === 0 && spec.writesFiles !== false) {
    throw new Error(
      `${spec.command} produced no downloadable output — the endpoint's response did not carry the keys the registry expects`
    );
  }
  return artifacts;
}

/** Record the primary output in history so later commands can chain off it. */
async function recordOperation(
  spec: OperationPresentation,
  source: ResolvedSource,
  primary: WrittenFile | undefined
): Promise<void> {
  if (!primary) {
    return;
  }
  await addGeneration({
    aspect: source.aspect,
    // 0 stands in for unknown: `Generation.cost` is non-nullable. MOT-38.
    cost: spec.estimatedCost ?? 0,
    editedFrom: source.path,
    id: generateId(),
    model: spec.model,
    output: primary.path,
    prompt: `[${spec.command}] ${source.prompt}`,
    resolution: source.resolution,
    timestamp: new Date().toISOString(),
  });
}

export async function runImageOperation<TResult>(
  spec: ImageOperationSpec<TResult>,
  input: ImageOperationInput,
  emitOpts: EmitOptions
): Promise<void> {
  const source = await resolveSource(input, emitOpts, spec.command);
  const target = resolveTarget(input, source, spec, emitOpts);

  if (input.dryRun === true) {
    emitDryRun(spec, source, target.path, emitOpts);
    return;
  }

  const { report, spinner } = startProgress(
    spec,
    source,
    chrome(spec, emitOpts)
  );

  try {
    const sourceDataUrl = await imageToDataUrl(source.path);
    const result = await spec.run(sourceDataUrl, report);
    spinner?.succeed(`${spec.verb} complete`);

    const written = await writeArtifacts(
      requireArtifacts(spec, spec.artifacts(result)),
      target
    );

    if (chrome(spec, emitOpts)) {
      reportWritten(written);
    }

    const primary = written[0];
    await recordOperation(spec, source, primary);

    emit(
      {
        command: spec.command,
        cost: spec.estimatedCost,
        files: written,
        model: spec.model,
        source: source.path,
        ...primaryFields(primary),
        ...spec.detail,
        ...spec.data?.(result),
      },
      emitOpts
    );

    if (!isStructured(emitOpts.format)) {
      const body = spec.render?.(result);
      if (body !== undefined && body !== "") {
        console.log(body);
      }
    }

    if (primary && input.openAfterWrite === true && input.noOpen !== true) {
      openImage(primary.path);
    }
  } catch (error) {
    spinner?.fail(`${spec.verb} failed`);
    handleError(error, spec.errorCode, emitOpts.format);
  }
}
