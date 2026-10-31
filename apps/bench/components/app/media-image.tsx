import Image from "next/image";

/**
 * A private image from the person's Library. Served by the App's own media
 * route, which checks ownership on every request, so it is never passed
 * through the image optimiser: that would fetch it without the person's
 * session. The parent sets the size; this fills it.
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
      sizes={sizes}
      src={src}
      unoptimized
    />
  );
}
