/**
 * Save generated images to disk and record them in history.
 *
 * Shared by the fal and direct-provider generate routes. fal returns URLs to
 * download; a direct provider returns bytes. Either way the saved paths are
 * the ones actually written, which can differ from the requested path when
 * the extension is corrected.
 */

import { writeFile } from "node:fs/promises";
import { join, parse, resolve } from "node:path";

import { estimateCost, sumCosts } from "@howells/motif-sdk";
import type { AspectRatio, Resolution } from "@howells/motif-sdk";
import chalk from "chalk";

import { deletePayloads } from "../api/fal";
import { hasTransparentPixels, TransparencyMissingError } from "../utils/alpha";
import {
  addGenerations,
  generateId,
  loadConfig,
  loadHistory,
} from "../utils/config";
import type { Generation } from "../utils/config";
import { formatTotal } from "../utils/cost";
import { exitForErrorCode } from "../utils/errors";
import {
  downloadImage,
  getFileSize,
  getImageDimensions,
  indexedOutputPath,
  openImage,
} from "../utils/image";
import { emitError, isStructured } from "../utils/output";
import type { EmitOptions, OutputFormat } from "../utils/output";
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

/** An image to save: a provider URL to download, or bytes already in hand. */
export type ImageSource = { bytes: Uint8Array } | { url: string };

/** What history records about the run, plus save-time checks. */
export interface SaveMeta {
  aspect: AspectRatio;
  /** Per-image USD from the provider, or null when unknown. Omit to estimate from the registry. */
  costPerImage?: number | null;
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

/** Write one image, returning the path actually used. Bytes are always PNG. */
async function writeImage(image: ImageSource, path: string): Promise<string> {
  if ("url" in image) {
    return await downloadImage(image.url, path);
  }
  const { dir, name } = parse(path);
  const pngPath = join(dir, `${name}.png`);
  await writeFile(pngPath, image.bytes);
  return pngPath;
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
  images: ImageSource[],
  outputPath: string,
  numImages: number,
  meta: SaveMeta,
  config: Awaited<ReturnType<typeof loadConfig>>,
  emitOpts: EmitOptions,
  noOpen?: boolean,
  historyRecorded = true
): Promise<SaveResult> {
  // Build paths for each image
  const paths = images.map((_, i) =>
    numImages > 1 ? indexedOutputPath(outputPath, i) : outputPath
  );

  // Download or write all images in parallel
  const actualPaths = await Promise.all(
    images.map(
      async (image, i) =>
        // biome-ignore lint/style/noNonNullAssertion: Index is guaranteed within bounds by the map
        await writeImage(image, paths[i]!)
    )
  );

  if (meta.requireTransparency === true) {
    await assertTransparent(actualPaths);
  }

  // Collect metadata sequentially (dims via file command, console output ordering)
  const savedImages: SavedImage[] = [];
  const generations: Generation[] = [];
  const now = new Date().toISOString();
  const firstEditPath = meta.editPaths?.[0];
  const editedFrom = hasText(firstEditPath)
    ? resolve(firstEditPath)
    : undefined;

  for (let i = 0; i < images.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: Index is guaranteed within bounds by the loop condition
    const path = actualPaths[i]!;
    const source = images[i];
    const dims = await getImageDimensions(path);
    const size = getFileSize(path);

    savedImages.push({
      height: dims?.height,
      path: resolve(path),
      remoteUrl:
        source !== undefined && "url" in source ? source.url : undefined,
      size,
      width: dims?.width,
    });

    if (!isStructured(emitOpts.format)) {
      console.log(
        chalk.green(`✓ Saved: ${path}`) +
          chalk.dim(
            ` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`
          )
      );
    }

    generations.push({
      aspect: meta.aspect,
      cost:
        meta.costPerImage === undefined
          ? estimateCost(meta.model, meta.resolution, 1)
          : meta.costPerImage,
      editedFrom,
      id: generateId(),
      ...(hasText(meta.look) && { look: meta.look }),
      model: meta.model,
      ...(hasText(meta.mood) && { mood: meta.mood }),
      output: resolve(path),
      prompt: meta.prompt,
      resolution: meta.resolution,
      timestamp: now,
    });
  }

  if (historyRecorded) {
    await addGenerations(generations);
  }

  const { known: totalCost, unknown } = sumCosts(
    generations.map((g) => g.cost)
  );
  // biome-ignore lint/style/noNonNullAssertion: generations is non-empty since images is non-empty
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

  // Open first image after all downloads complete. Use the actual saved path:
  // downloadImage may rewrite the extension when fal returns a different
  // format than the requested filename implies (e.g. .png -> .jpg).
  if (config.openAfterGenerate && noOpen !== true) {
    // biome-ignore lint/style/noNonNullAssertion: actualPaths[0] exists since images is non-empty
    openImage(actualPaths[0]!);
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
  requestId: string | undefined,
  format: OutputFormat
): Promise<{ payloadDeleteError?: string; payloadsDeleted: boolean }> {
  if (!hasText(requestId)) {
    return {
      payloadDeleteError: "fal response did not include a request_id",
      payloadsDeleted: false,
    };
  }
  try {
    await deletePayloads(requestId);
    return { payloadsDeleted: true };
  } catch (error) {
    const payloadDeleteError =
      error instanceof Error ? error.message : String(error);
    if (!isStructured(format)) {
      console.warn(
        chalk.yellow(
          `Warning: saved locally, but fal payload deletion failed: ${payloadDeleteError}`
        )
      );
    }
    return { payloadDeleteError, payloadsDeleted: false };
  }
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
