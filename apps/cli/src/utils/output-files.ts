/**
 * Writing what a run returned: each output file to disk, as the bytes of a URL
 * or of inline data, and the description of the file that landed. Every
 * command and Studio save through here, so a file is named, extension-checked
 * and measured one way.
 */

import { access, constants, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { TaskFile } from "@howells/motif-sdk";

import { handleError } from "./errors";
import {
  decodeDataUrl,
  downloadImage,
  getFileSize,
  getImageDimensions,
  openImage,
  saveBytes,
  urlExtension,
  withFileExtension,
} from "./image";
import { validateOutputPath } from "./input";
import type { OutputFormat } from "./output";

/** Extensions `derivedOutputPath` strips before appending its suffix. */
const SOURCE_EXT_REGEX = /\.(png|jpg|jpeg|webp|mp4|mov|m4v|webm)$/i;

/** Open the first file of a run in the viewer, only when the caller passed `--open`. */
export function openAfterRun(path: string | undefined, open?: boolean): void {
  if (path !== undefined && open === true) {
    openImage(path);
  }
}

/** A file written to disk by {@link saveFiles}. */
export interface WrittenFile {
  height?: number;
  key: string;
  path: string;
  size: string;
  width?: number;
}

/**
 * Before anything is spent: the output's directory (the path itself for a
 * directory target) exists or can be created, and can be written to. The path
 * was already checked against the output root where the user named it; a
 * Series' own folder under `~/.motif` is outside that root by design. A run that would only find out after fal billed it
 * fails here with `INVALID_OUTPUT_PATH` instead.
 */
export async function prepareOutput(
  path: string,
  kind: "directory" | "file",
  format: OutputFormat
): Promise<void> {
  try {
    const directory = kind === "directory" ? path : dirname(path);
    await mkdir(directory, { recursive: true });
    await access(directory, constants.W_OK);
  } catch (error) {
    handleError(error, "INVALID_OUTPUT_PATH", format);
  }
}

/** A returned file that could not be written. */
export interface FailedFile {
  key: string;
  message: string;
  /** Where it would have been written. */
  path: string;
  /** The provider-hosted URL to fetch it from again, when it had one. */
  remoteUrl?: string;
}

/** What {@link saveFiles} did: the files that landed, and each that did not. */
export interface SaveOutcome {
  failed: FailedFile[];
  written: WrittenFile[];
}

/**
 * Where {@link saveFiles} puts a run's files: every file in a directory, named
 * for the output key that produced it, or file `i` at `paths[i]`. A file with
 * no path is not written.
 */
export type SaveTarget = { directory: string } | { paths: readonly string[] };

/**
 * The path next to `sourcePath` that a Task's output takes: the source's stem,
 * `suffix` and `extension`. A source outside the allowed output root takes the
 * same name in the current directory.
 */
export function derivedOutputPath(
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

/** Write one returned file to `target`; the path actually written. */
async function writeOutput(url: string, target: string): Promise<string> {
  const inline = decodeDataUrl(url);
  return inline === null
    ? await downloadImage(url, target)
    : await saveBytes(inline.buffer, inline.contentType, target);
}

async function describeFile(key: string, path: string): Promise<WrittenFile> {
  const dimensions = await getImageDimensions(path);
  return {
    key,
    path: resolve(path),
    size: getFileSize(path),
    ...(dimensions === null
      ? {}
      : { height: dimensions.height, width: dimensions.width }),
  };
}

/**
 * The file stem for `file` among the files of its key: its label when every
 * one of them has one, else the key, with a position after the first. A
 * mislabelled file is worse than a positional one because it reads as
 * authoritative, so labels are all or nothing.
 */
function stemFor(file: TaskFile, sameKey: readonly TaskFile[]): string {
  const position = sameKey.indexOf(file);
  const labels = sameKey.map((other) => other.label);
  const label = labels.every((name) => name !== undefined)
    ? labels[position]
    : undefined;
  return label ?? (position === 0 ? file.key : `${file.key}-${position + 1}`);
}

/** The URL a failed file can be fetched from again: never an inline data URL. */
function remoteUrlOf(url: string): string | undefined {
  return decodeDataUrl(url) === null ? url : undefined;
}

async function writeAll(
  writes: readonly { file: TaskFile; path: string }[]
): Promise<SaveOutcome> {
  const settled = await Promise.allSettled(
    writes.map(
      async ({ file, path }) =>
        await describeFile(
          file.key,
          await writeOutput(
            file.url,
            withFileExtension(path, urlExtension(file.url))
          )
        )
    )
  );
  const outcome: SaveOutcome = { failed: [], written: [] };
  for (const [index, result] of settled.entries()) {
    const write = writes[index];
    if (result.status === "fulfilled") {
      outcome.written.push(result.value);
    } else if (write !== undefined) {
      outcome.failed.push({
        key: write.file.key,
        message:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        path: resolve(write.path),
        remoteUrl: remoteUrlOf(write.file.url),
      });
    }
  }
  return outcome;
}

/**
 * Write a run's output files, in parallel, and say what landed and what did
 * not. A file that fails never hides the ones that were saved.
 */
export async function saveFiles(
  files: readonly TaskFile[],
  target: SaveTarget
): Promise<SaveOutcome> {
  if ("directory" in target) {
    await mkdir(target.directory, { recursive: true });
    return await writeAll(
      files.map((file) => ({
        file,
        path: join(
          target.directory,
          `${stemFor(
            file,
            files.filter((other) => other.key === file.key)
          )}${urlExtension(file.url)}`
        ),
      }))
    );
  }
  return await writeAll(
    [...files.entries()].flatMap(([index, file]) => {
      const path = target.paths[index];
      return path === undefined ? [] : [{ file, path }];
    })
  );
}
