/**
 * Writing what a run returned: each output file to disk, as the bytes of a URL
 * or of inline data, and the description of the file that landed. Every
 * command and Studio save through here, so a file is named, extension-checked
 * and measured one way.
 */

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { TaskFile } from "@howells/motif-sdk";

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

async function writeAll(
  writes: readonly { file: TaskFile; path: string }[]
): Promise<WrittenFile[]> {
  return await Promise.all(
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
}

/** Write a run's output files, in parallel, and describe what landed. */
export async function saveFiles(
  files: readonly TaskFile[],
  target: SaveTarget
): Promise<WrittenFile[]> {
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
