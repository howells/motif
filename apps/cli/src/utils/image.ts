import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, parse, resolve } from "node:path";

import sharp from "sharp";

import { atomicWrite } from "./config";

const URL_TAIL_REGEX = /[?#]/;
const FILE_EXTENSION_REGEX = /^\.[a-z0-9]{1,8}$/i;
const DATA_URL_REGEX = /^data:([^;,]+);base64,(.*)$/s;

/** Extensions a raster image file may carry; its bytes decide which. */
const RASTER_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);

/** Minimal environment for child processes — excludes secrets like FAL_KEY */
const SAFE_ENV = { PATH: process.env.PATH ?? "" };

function detectImageExtension(
  buffer: Buffer,
  contentType: string | null
): ".gif" | ".jpg" | ".png" | ".svg" | ".webp" | null {
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
  if (normalized === "image/svg+xml") {
    return ".svg";
  }
  const head = buffer.subarray(0, 256).toString("utf-8").trimStart();
  if (
    head.startsWith("<svg") ||
    (head.startsWith("<?xml") && head.includes("<svg"))
  ) {
    return ".svg";
  }

  return null;
}

/**
 * `path` with `extension` in place of its own. A path that already ends in it
 * (`.jpeg` counts for `.jpg`) is returned as it is.
 */
export function withExtension(path: string, extension: string): string {
  const current = extname(path).toLowerCase();
  if (current === extension || (current === ".jpeg" && extension === ".jpg")) {
    return path;
  }
  return current === ""
    ? `${path}${extension}`
    : `${path.slice(0, -current.length)}${extension}`;
}

/**
 * `path` with the extension of a file that cannot be a raster image: a video,
 * an SVG or a mesh named `.png` would open as a broken image. Raster
 * mismatches are corrected from the bytes by {@link saveBytes}.
 */
export function withFileExtension(path: string, extension: string): string {
  return extension === "" || RASTER_EXTENSIONS.has(extension)
    ? path
    : withExtension(path, extension);
}

/** Extension carried by a URL path, ignoring query and fragment. */
export function urlExtension(url: string): string {
  const extension = extname(url.split(URL_TAIL_REGEX)[0] ?? "").toLowerCase();
  return FILE_EXTENSION_REGEX.test(extension) ? extension : "";
}

/** The bytes and content type of a `data:<type>;base64,` URL, else null. */
export function decodeDataUrl(
  url: string
): { buffer: Buffer; contentType: string } | null {
  const match = DATA_URL_REGEX.exec(url);
  return match?.[1] === undefined || match[2] === undefined
    ? null
    : { buffer: Buffer.from(match[2], "base64"), contentType: match[1] };
}

/**
 * Write image bytes to `outputPath`, with the extension their content calls
 * for, through a temporary file renamed into place. Returns the path actually
 * written. The exact path the caller named may be replaced; a different path,
 * reached only because the bytes are not what the name says, is never
 * overwritten: a file the user did not name is not Motif's to replace.
 */
export async function saveBytes(
  buffer: Buffer,
  contentType: string | null,
  outputPath: string
): Promise<string> {
  const detected = detectImageExtension(buffer, contentType);
  const actualPath =
    detected === null ? outputPath : withExtension(outputPath, detected);
  if (actualPath !== outputPath && existsSync(actualPath)) {
    throw new Error(
      `${outputPath} would be saved as ${actualPath} to match the image it holds, but ${actualPath} already exists: name the output ${actualPath}, or move that file`
    );
  }
  await atomicWrite(actualPath, buffer, 0o666);
  return actualPath;
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

  return await saveBytes(
    Buffer.from(await response.arrayBuffer()),
    response.headers.get("content-type"),
    outputPath
  );
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
 * Pixel size of an image file, or null when sharp cannot read it.
 *
 * Outputs that are not images (a video clip, a GLB mesh) pass through here and
 * have no size to report. The size is only an annotation on a file that is
 * already saved, so an unreadable file reads as null rather than failing a run
 * that has been paid for.
 */
export async function getImageDimensions(
  imagePath: string
): Promise<{ width: number; height: number } | null> {
  try {
    const { height, pageHeight, width } = await sharp(imagePath).metadata();
    const pageOrWholeHeight = pageHeight ?? height;
    return width === undefined || pageOrWholeHeight === undefined
      ? null
      : { height: pageOrWholeHeight, width };
  } catch {
    return null;
  }
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
