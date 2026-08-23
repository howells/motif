import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, statSync, unlinkSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, parse, resolve } from "node:path";

import { hasText } from "./text";

const DIMENSION_REGEX = /(\d+)\s*x\s*(\d+)/g;
const URL_TAIL_REGEX = /[?#]/;
const FILE_EXTENSION_REGEX = /^\.[a-z0-9]{1,8}$/i;
const SIPS_HEIGHT_REGEX = /pixelHeight:\s*(\d+)/;
const SIPS_WIDTH_REGEX = /pixelWidth:\s*(\d+)/;

/** Minimal environment for child processes — excludes secrets like FAL_KEY */
const SAFE_ENV = { PATH: process.env.PATH ?? "" };

/** Run a command and return { stdout, exitCode } */
async function exec(
  cmd: string,
  args: string[]
): Promise<{ stdout: string; exitCode: number }> {
  return await new Promise((resolve) => {
    execFile(cmd, args, { env: SAFE_ENV }, (error, stdout) => {
      resolve({
        exitCode:
          error === null ? 0 : typeof error.code === "number" ? error.code : 1,
        stdout: stdout ?? "",
      });
    });
  });
}

function detectImageExtension(
  buffer: Buffer,
  contentType: string | null
): ".gif" | ".jpg" | ".png" | ".webp" | null {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return ".jpg";
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return ".png";
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return ".webp";
  }
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return ".gif";
  }

  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    return ".jpg";
  }
  if (normalized === "image/png") {
    return ".png";
  }
  if (normalized === "image/webp") {
    return ".webp";
  }
  if (normalized === "image/gif") {
    return ".gif";
  }

  return null;
}

function withDetectedExtension(outputPath: string, extension: string | null) {
  if (!hasText(extension)) {
    return outputPath;
  }

  const currentExtension = extname(outputPath).toLowerCase();
  if (
    currentExtension === extension ||
    (currentExtension === ".jpeg" && extension === ".jpg")
  ) {
    return outputPath;
  }

  if (!hasText(currentExtension)) {
    return `${outputPath}${extension}`;
  }
  return `${outputPath.slice(0, -currentExtension.length)}${extension}`;
}

/** Download an image from a URL and save it to a file */
export async function downloadImage(
  url: string,
  outputPath: string
): Promise<string> {
  if (!url.startsWith("https://")) {
    throw new Error(`Refusing to download from non-HTTPS URL: ${url}`);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const actualPath = withDetectedExtension(
    outputPath,
    detectImageExtension(buffer, response.headers.get("content-type"))
  );
  await writeFile(actualPath, buffer);
  return actualPath;
}

/** One downloadable artefact and the registry output key that produced it. */
export interface UrlArtifact {
  key: string;
  url: string;
}

/** A file written to disk by {@link downloadAll}. */
export interface WrittenFile {
  height?: number;
  key: string;
  path: string;
  size: string;
  width?: number;
}

/**
 * Extract a downloadable URL from an object-shaped value.
 *
 * Checks `url` directly, then one level into the object's own values. Some
 * endpoints wrap the file a level deeper alongside its metadata — Seedream's
 * layerize returns `layers: [{ image: { url }, z_index, name, bounding_box }]`,
 * and a direct-only lookup silently downloaded nothing for the half of the
 * response that carries the actual layers. One level, not arbitrary recursion:
 * deeper searching starts finding thumbnails and previews that were never the
 * artefact being asked for.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function urlOf(value: unknown): string | undefined {
  return isRecord(value) && typeof value.url === "string"
    ? value.url
    : undefined;
}

function extractUrl(value: unknown): string | undefined {
  // Arrays are flattened by the caller. Walking into one here would return its
  // first element's URL and drop the rest.
  if (!isRecord(value)) {
    return undefined;
  }
  return urlOf(value) ?? Object.values(value).map(urlOf).find(Boolean);
}

function isDownloadableUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("https://");
}

/** Every URL reachable from one result value: a string, an object, or an array of either. */
function urlsFrom(value: unknown): string[] {
  if (isDownloadableUrl(value)) {
    return [value];
  }
  const direct = extractUrl(value);
  if (direct !== undefined) {
    return [direct];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item: unknown) => {
    if (isDownloadableUrl(item)) {
      return [item];
    }
    const itemUrl = extractUrl(item);
    return itemUrl === undefined ? [] : [itemUrl];
  });
}

/** Collect every downloadable URL under `keys`, in key order, arrays flattened. */
export function collectUrls(
  result: Record<string, unknown>,
  keys: string[]
): UrlArtifact[] {
  return keys.flatMap((key) =>
    urlsFrom(result[key]).map((url) => ({ key, url }))
  );
}

/** Extension carried by a URL path, ignoring query and fragment. */
function urlExtension(url: string): string {
  const extension = extname(url.split(URL_TAIL_REGEX)[0] ?? "");
  return FILE_EXTENSION_REGEX.test(extension) ? extension : "";
}

/** Name for `key` at `occurrence` (0-based): masks.png, masks-2.png, masks-3.png. */
function artifactFilename(
  key: string,
  occurrence: number,
  url: string
): string {
  const suffix = occurrence === 0 ? "" : `-${occurrence + 1}`;
  return `${key}${suffix}${urlExtension(url)}`;
}

/**
 * Semantic names for the positions of an array-valued output key, as published
 * by the SDK registry's `outputLabels`.
 */
export type OutputLabels = Record<string, readonly string[]>;

/**
 * Labels for `key`, but only when there is exactly one label per URL that key
 * produced. Callers resolve the names from the request before getting here;
 * this is the last guard against a count that still does not line up, such as
 * patina-extract multiplying its array by `num_images`. A mislabelled file is
 * worse than a positional one because it reads as authoritative.
 */
function usableLabels(
  labels: OutputLabels | undefined,
  key: string,
  count: number
): readonly string[] | undefined {
  const candidate = labels?.[key];
  return candidate?.length === count ? candidate : undefined;
}

/**
 * Download every artefact into `directory`, named by the output key that
 * produced it, with a positional suffix when a key yields several files.
 * Where `labels` names the positions of a key and the count matches exactly,
 * those names are used as the filename stems instead.
 */
export async function downloadAll(
  artifacts: UrlArtifact[],
  directory: string,
  labels?: OutputLabels
): Promise<WrittenFile[]> {
  await mkdir(directory, { recursive: true });

  const totals = new Map<string, number>();
  for (const { key } of artifacts) {
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const targets = artifacts.map((artifact) => {
    const occurrence = seen.get(artifact.key) ?? 0;
    seen.set(artifact.key, occurrence + 1);
    const named = usableLabels(
      labels,
      artifact.key,
      totals.get(artifact.key) ?? 0
    )?.[occurrence];
    return {
      ...artifact,
      target: join(
        directory,
        named === undefined
          ? artifactFilename(artifact.key, occurrence, artifact.url)
          : `${named}${urlExtension(artifact.url)}`
      ),
    };
  });

  return await Promise.all(
    targets.map(
      async ({ key, target, url }) => await writeArtifact(key, url, target)
    )
  );
}

/** Download one URL to `target` and describe the file that landed. */
export async function writeArtifact(
  key: string,
  url: string,
  target: string
): Promise<WrittenFile> {
  const actualPath = await downloadImage(url, target);
  const dimensions = await getImageDimensions(actualPath);
  return {
    key,
    path: resolve(actualPath),
    size: getFileSize(actualPath),
    ...(dimensions === null
      ? {}
      : { height: dimensions.height, width: dimensions.width }),
  };
}

/** Convert a local image file to a base64 data URL */
export async function imageToDataUrl(imagePath: string): Promise<string> {
  if (!existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const buffer = await readFile(imagePath);
  const base64 = buffer.toString("base64");

  // Detect MIME type from file content (magic bytes) rather than extension,
  // because sips can output JPEG data with a .png extension
  let mimeType = "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    mimeType = "image/jpeg";
  } else if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46
  ) {
    mimeType = "image/webp";
  }

  return `data:${mimeType};base64,${base64}`;
}

/**
 * Resize an image using sips (macOS)
 * Returns the path to the resized image (temp file if resized)
 */
export async function resizeImage(
  imagePath: string,
  maxSize = 1024
): Promise<string> {
  const tempPath = `/tmp/motif-resize-${randomUUID()}.png`;

  try {
    const result = await exec("sips", [
      "-Z",
      String(maxSize),
      imagePath,
      "--out",
      tempPath,
    ]);

    if (result.exitCode === 0 && existsSync(tempPath)) {
      return tempPath;
    }
  } catch {
    // sips not available, fall through
  }

  return imagePath;
}

/** Get image dimensions from a file */
export async function getImageDimensions(
  imagePath: string
): Promise<{ width: number; height: number } | null> {
  try {
    const result = await exec("sips", [
      "-g",
      "pixelWidth",
      "-g",
      "pixelHeight",
      imagePath,
    ]);
    const width = SIPS_WIDTH_REGEX.exec(result.stdout)?.[1];
    const height = SIPS_HEIGHT_REGEX.exec(result.stdout)?.[1];

    if (result.exitCode === 0 && hasText(width) && hasText(height)) {
      return {
        height: Number.parseInt(height, 10),
        width: Number.parseInt(width, 10),
      };
    }
  } catch {
    // sips not available, fall back to file
  }

  try {
    const result = await exec("file", [imagePath]);
    const matches = [...result.stdout.matchAll(DIMENSION_REGEX)];
    const match = matches.at(-1);

    if (match !== undefined && hasText(match[1]) && hasText(match[2])) {
      return {
        height: Number.parseInt(match[2], 10),
        width: Number.parseInt(match[1], 10),
      };
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/** Get file size in human-readable format */
export function getFileSize(filePath: string): string {
  const { size: bytes } = statSync(filePath);

  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Path for image `index` in a multi-image batch: out.jpg -> out-1.jpg */
export function indexedOutputPath(outputPath: string, index: number): string {
  const { dir, name, ext } = parse(outputPath);
  return join(dir, `${name}-${index + 1}${ext || ".png"}`);
}

/** Generate a timestamped filename */
export function generateFilename(prefix = "motif"): string {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replaceAll(/[-:T]/g, "");
  return `${prefix}-${timestamp}.png`;
}

/**
 * Open an image in Preview (macOS) or default viewer.
 *
 * Best-effort: never throws. Opening a viewer is a convenience and must not
 * fail an otherwise-successful (and billed) generation. Returns false when
 * the file is missing or the platform has no known opener.
 */
export function openImage(imagePath: string): boolean {
  if (!existsSync(imagePath)) {
    return false;
  }

  const absolutePath = resolve(imagePath);

  if (process.platform === "darwin") {
    execFile("open", [absolutePath], { env: SAFE_ENV }, () => {
      // Fire-and-forget: viewer errors are non-fatal
    });
    return true;
  }
  if (process.platform === "linux") {
    execFile("xdg-open", [absolutePath], { env: SAFE_ENV }, () => {
      // Fire-and-forget: viewer errors are non-fatal
    });
    return true;
  }
  return false;
}

/** Delete a temporary file safely */
export function deleteTempFile(filePath: string): void {
  try {
    if (filePath.startsWith("/tmp/motif-") && existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}
