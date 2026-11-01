/**
 * Smaller copies of private images, made on request by the media route so a
 * card or a thumbnail never downloads a full-size original. Only the widths
 * `next/image` asks for are made, so the set of copies stays small.
 */
import sharp from "sharp";

/** `next/image`'s default `imageSizes` and `deviceSizes`, together. */
export const PREVIEW_WIDTHS: ReadonlySet<number> = new Set([
  32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840,
]);

/** The width asked for in `?w=`: `null` for the original, `undefined` for a
 * width the route doesn't make. */
export const previewWidthOf = (
  value: string | null
): number | null | undefined => {
  if (value === null) {
    return null;
  }
  const width = Number(value);
  return PREVIEW_WIDTHS.has(width) ? width : undefined;
};

/** A copy of `bytes` at most `width` pixels wide, as WebP. */
export const resizeImage = async (
  bytes: Uint8Array,
  width: number
): Promise<Uint8Array> =>
  await sharp(bytes, { limitInputPixels: 300_000_000 })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
