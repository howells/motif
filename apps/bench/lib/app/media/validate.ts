/**
 * What the App accepts as an image, decided from the bytes rather than from
 * the file name or the browser's declared type.
 *
 * An upload is sniffed by its magic bytes, decoded by sharp with a pixel
 * limit, checked for size, then re-encoded upright with its metadata removed:
 * a phone photo's location never reaches storage or a provider.
 */
import sharp from "sharp";
import type { Metadata } from "sharp";

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

/** Vercel caps a request body at 4.5 MB; the App's own client shrinks larger
 * photos before sending, and the server refuses anything over this. */
export const UPLOAD_LIMIT_BYTES = 4_400_000;

/** Longest side the App keeps for a Source or Reference. */
export const MAX_SIDE = 4096;

const MIN_SIDE = 16;

/** Decoder ceiling, well above the largest accepted image, so a crafted file
 * that claims a vast canvas is refused before it is decoded. */
const PIXEL_LIMIT = 40_000_000;

export interface InspectedImage {
  readonly bytes: Buffer;
  readonly contentType: ImageType;
  readonly height: number;
  readonly width: number;
}

export type Inspection =
  | ({ readonly ok: true } & InspectedImage)
  | { readonly ok: false; readonly code: string; readonly message: string };

const refuse = (code: string, message: string): Inspection => ({
  code,
  message,
  ok: false,
});

/** The image type the bytes themselves declare, or `null`. */
export const sniffImageType = (bytes: Uint8Array): ImageType | null => {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.length >= png.length &&
    png.every((byte, index) => bytes[index] === byte)
  ) {
    return "image/png";
  }
  const ascii = (start: number, end: number) =>
    String.fromCodePoint(...bytes.subarray(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
};

const SHARP_FORMAT: Readonly<Record<ImageType, string>> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Inspect and normalise an uploaded image. `kind` "mask" accepts PNG only
 * and keeps it exactly as drawn (no re-encode beyond PNG); a Source or
 * Reference may be JPEG, PNG or WebP.
 */
export const inspectUpload = async (
  input: Uint8Array,
  kind: "image" | "mask"
): Promise<Inspection> => {
  if (input.byteLength === 0) {
    return refuse("EMPTY_FILE", "The file is empty.");
  }
  if (input.byteLength > UPLOAD_LIMIT_BYTES) {
    return refuse("FILE_TOO_LARGE", "The file is larger than 4.4 MB.");
  }
  const sniffed = sniffImageType(input);
  if (sniffed === null) {
    return refuse(
      "NOT_AN_IMAGE",
      "Only JPEG, PNG and WebP images can be used."
    );
  }
  if (kind === "mask" && sniffed !== "image/png") {
    return refuse("MASK_NOT_PNG", "A mask must be a PNG.");
  }
  let metadata: Metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: PIXEL_LIMIT }).metadata();
  } catch {
    return refuse("UNREADABLE_IMAGE", "The image couldn't be read.");
  }
  if (metadata.format !== SHARP_FORMAT[sniffed]) {
    return refuse(
      "TYPE_MISMATCH",
      "The file's contents don't match its image type."
    );
  }
  const { height, width } = metadata;
  if (width === undefined || height === undefined) {
    return refuse("UNREADABLE_IMAGE", "The image has no size.");
  }
  if (Math.min(width, height) < MIN_SIDE) {
    return refuse(
      "IMAGE_TOO_SMALL",
      `Each side must be at least ${MIN_SIDE} pixels.`
    );
  }
  if (Math.max(width, height) > MAX_SIDE) {
    return refuse(
      "IMAGE_TOO_LARGE",
      `The longest side can be at most ${MAX_SIDE} pixels.`
    );
  }
  try {
    // `rotate()` with no angle applies the EXIF orientation; re-encoding
    // writes no metadata, so location and camera details are dropped.
    const pipeline = sharp(input, { limitInputPixels: PIXEL_LIMIT }).rotate();
    const encoded =
      sniffed === "image/png"
        ? pipeline.png()
        : sniffed === "image/webp"
          ? pipeline.webp({ quality: 92 })
          : pipeline.jpeg({ mozjpeg: true, quality: 92 });
    const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
    return {
      bytes: data,
      contentType: sniffed,
      height: info.height,
      ok: true,
      width: info.width,
    };
  } catch {
    return refuse("UNREADABLE_IMAGE", "The image couldn't be read.");
  }
};

/** Read the type and size of bytes a provider returned. Outputs are stored as
 * returned, but only if they are an image type the App serves. */
export const inspectOutput = async (
  bytes: Uint8Array
): Promise<{
  contentType: ImageType;
  height: number;
  width: number;
} | null> => {
  const sniffed = sniffImageType(bytes);
  if (sniffed === null) {
    return null;
  }
  try {
    const metadata = await sharp(bytes, {
      limitInputPixels: 300_000_000,
    }).metadata();
    if (
      metadata.format !== SHARP_FORMAT[sniffed] ||
      metadata.width === undefined ||
      metadata.height === undefined
    ) {
      return null;
    }
    return {
      contentType: sniffed,
      height: metadata.height,
      width: metadata.width,
    };
  } catch {
    return null;
  }
};
