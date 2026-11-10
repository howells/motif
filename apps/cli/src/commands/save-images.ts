/**
 * Save generated images to disk and record them in history.
 *
 * Shared by generate and vary. fal returns URLs to download, or data URLs
 * whose bytes are written directly. Either way the saved paths are the ones
 * actually written, which can differ from the requested path when the
 * extension is corrected.
 */

import { resolve } from "node:path";

import { sumCosts } from "@howells/motif-sdk";
import type {
  AspectRatio,
  MotifClient,
  Resolution,
  TaskFile,
} from "@howells/motif-sdk";
import chalk from "chalk";

import { hasTransparentPixels, TransparencyMissingError } from "../utils/alpha";
import {
  addGenerations,
  loadConfig,
  loadHistory,
  newGeneration,
} from "../utils/config";
import { formatTotal } from "../utils/cost";
import { exitForErrorCode } from "../utils/errors";
import { decodeDataUrl, indexedOutputPath, openImage } from "../utils/image";
import { emitError, isStructured, savedLine } from "../utils/output";
import type { EmitOptions, OutputFormat } from "../utils/output";
import { saveFiles } from "../utils/output-files";
import { hasText } from "../utils/text";

export interface SavedImage {
  height?: number;
  path: string;
  /**
   * The provider-hosted URL the image was downloaded from.
   *
   * Kept so callers that need an HTTPS source — design tools, previews, anything
   * that cannot read a local file — do not have to re-upload an image that is
   * already served somewhere. Absent once the provider expires it, so treat it
   * as a convenience rather than durable storage.
   */
  remoteUrl?: string;
  size: string;
  width?: number;
}

/** What history records about the run, plus save-time checks. */
export interface SaveMeta {
  aspect: AspectRatio;
  /** Per-image USD from the plan, or null when unknown. */
  costPerImage: number | null;
  editPaths?: string[];
  look?: string;
  model: string;
  mood?: string;
  prompt: string;
  /** Check every saved file for transparent pixels before recording it. */
  requireTransparency?: boolean;
  resolution: Resolution;
}

export interface SaveResult {
  cost: number | null;
  historyRecorded: boolean;
  id: string;
  images: SavedImage[];
  timestamp: string;
}

/** Throw when a transparent run saved any image with no transparent pixels. */
async function assertTransparent(paths: string[]): Promise<void> {
  const checks = await Promise.all(
    paths.map(async (path) => ({
      ok: await hasTransparentPixels(path),
      path: resolve(path),
    }))
  );
  const opaque = checks.filter((check) => !check.ok).map((check) => check.path);
  if (opaque.length > 0) {
    throw new TransparencyMissingError(opaque);
  }
}

export async function saveGeneratedImages(
  files: readonly TaskFile[],
  outputPath: string,
  numImages: number,
  meta: SaveMeta,
  config: Awaited<ReturnType<typeof loadConfig>>,
  emitOpts: EmitOptions,
  noOpen?: boolean,
  historyRecorded = true
): Promise<SaveResult> {
  const written = await saveFiles(files, {
    paths: files.map((_, i) =>
      numImages > 1 ? indexedOutputPath(outputPath, i) : outputPath
    ),
  });

  if (meta.requireTransparency === true) {
    await assertTransparent(written.map((file) => file.path));
  }

  const now = new Date().toISOString();
  const firstEditPath = meta.editPaths?.[0];
  const editedFrom = hasText(firstEditPath)
    ? resolve(firstEditPath)
    : undefined;
  const generations = written.map((file) =>
    newGeneration({
      aspect: meta.aspect,
      cost: meta.costPerImage,
      editedFrom,
      look: meta.look,
      model: meta.model,
      mood: meta.mood,
      output: file.path,
      prompt: meta.prompt,
      resolution: meta.resolution,
      timestamp: now,
    })
  );
  const savedImages = written.map((file, i): SavedImage => {
    const url = files[i]?.url;
    return {
      height: file.height,
      path: file.path,
      remoteUrl:
        url === undefined || decodeDataUrl(url) !== null ? undefined : url,
      size: file.size,
      width: file.width,
    };
  });

  if (!isStructured(emitOpts.format)) {
    for (const file of written) {
      console.log(savedLine(file));
    }
  }

  if (historyRecorded) {
    await addGenerations(generations);
  }

  const { known: totalCost, unknown } = sumCosts(
    generations.map((g) => g.cost)
  );
  // biome-ignore lint/style/noNonNullAssertion: generations is non-empty since files is non-empty
  const lastGen = generations.at(-1)!;

  if (historyRecorded && !isStructured(emitOpts.format)) {
    const history = await loadHistory();
    const totals = history.totalCost;
    console.log(
      chalk.dim(
        `\nSession: ${formatTotal(totals.session, totals.unknown.session)} | Today: ${formatTotal(totals.today, totals.unknown.today)}`
      )
    );
  }

  // Open the first image after all downloads complete, by the path actually
  // written: the extension may have been corrected from the file's content.
  if (config.openAfterGenerate && noOpen !== true) {
    // biome-ignore lint/style/noNonNullAssertion: written[0] exists since files is non-empty
    openImage(written[0]!.path);
  }

  return {
    cost: unknown > 0 ? null : totalCost,
    historyRecorded,
    id: lastGen.id,
    images: savedImages,
    timestamp: lastGen.timestamp,
  };
}

/** Delete fal's stored payloads once an ephemeral run has saved locally. */
export async function deleteEphemeralPayloads(
  client: MotifClient,
  requestId: string | undefined,
  format: OutputFormat
): Promise<{ payloadDeleteError?: string; payloadsDeleted: boolean }> {
  if (!hasText(requestId)) {
    return {
      payloadDeleteError: "fal response did not include a request_id",
      payloadsDeleted: false,
    };
  }
  const deleted = await client.deletePayloads(requestId);
  if (deleted.isOk()) {
    return { payloadsDeleted: true };
  }
  const payloadDeleteError = deleted.error.message;
  if (!isStructured(format)) {
    console.warn(
      chalk.yellow(
        `Warning: saved locally, but fal payload deletion failed: ${payloadDeleteError}`
      )
    );
  }
  return { payloadDeleteError, payloadsDeleted: false };
}

/** Exit with TRANSPARENCY_MISSING when a save failed the transparency check. */
export function exitIfTransparencyMissing(
  error: unknown,
  format: OutputFormat
): void {
  if (!(error instanceof TransparencyMissingError)) {
    return;
  }
  emitError(
    {
      code: "TRANSPARENCY_MISSING",
      details: { paths: error.paths },
      message: error.message,
    },
    format
  );
  exitForErrorCode("TRANSPARENCY_MISSING");
}
