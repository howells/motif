/**
 * Transparency check for saved images.
 *
 * A transparent-background request can come back opaque, so the saved file is
 * read back and checked before the run is reported as a success.
 */

import sharp from "sharp";

/**
 * True when the image has an alpha channel and at least one fully transparent
 * pixel. An alpha channel that is opaque everywhere counts as no transparency.
 */
export async function hasTransparentPixels(path: string): Promise<boolean> {
  const image = sharp(path);
  const { hasAlpha } = await image.metadata();
  if (!hasAlpha) {
    return false;
  }
  const { channels } = await image.stats();
  const alpha = channels.at(-1);
  return alpha !== undefined && alpha.min === 0;
}

/** Thrown when a transparent-background run saved an image with no transparency. */
export class TransparencyMissingError extends Error {
  readonly code = "TRANSPARENCY_MISSING";
  /** Saved files that have no transparent pixels. They are left on disk. */
  readonly paths: string[];

  constructor(paths: string[]) {
    super(
      `Transparent output was requested, but ${paths.length === 1 ? "the saved image has" : "the saved images have"} no transparent pixels: ${paths.join(", ")}`
    );
    this.name = "TransparencyMissingError";
    this.paths = paths;
  }
}
