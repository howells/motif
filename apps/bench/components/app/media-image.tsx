"use client";

import Image from "next/image";
import type { ImageLoaderProps } from "next/image";

import { mediaUrl } from "@/lib/app/views";

const MEDIA_PREFIX = mediaUrl("");

/** Asks the App's own media route for the image at the width the browser
 * needs, so a small card never downloads a full-size original. */
const mediaLoader = ({ src, width }: ImageLoaderProps): string =>
  src.startsWith(MEDIA_PREFIX) ? `${src}?w=${width}` : src;

/**
 * A private image from the person's Library. Served by the App's own media
 * route, which checks ownership on every request, so it never goes through
 * Next's image optimiser: that would fetch it without the person's session.
 * The route resizes it instead. The parent sets the size; this fills it.
 */
export function MediaImage({
  alt,
  fit = "cover",
  sizes,
  src,
}: {
  readonly alt: string;
  readonly fit?: "contain" | "cover";
  readonly sizes: string;
  readonly src: string;
}) {
  return (
    <Image
      alt={alt}
      className={fit === "contain" ? "object-contain" : "object-cover"}
      fill
      loader={mediaLoader}
      sizes={sizes}
      src={src}
    />
  );
}
