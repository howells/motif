"use client";

import type { ComponentProps, SyntheticEvent } from "react";

/** Hide a picture only once script knows it is still loading, so without
 * script, or when it is already cached, it simply shows. One that failed
 * counts as complete but has no width; it stays hidden, so its frame keeps
 * the placeholder rather than a broken image. */
function holdUntilLoaded(image: HTMLImageElement | null) {
  if (image !== null && (!image.complete || image.naturalWidth === 0)) {
    image.dataset.loading = "";
  }
}

function revealLoaded(event: SyntheticEvent<HTMLImageElement>) {
  delete event.currentTarget.dataset.loading;
}

/** An `<img>` that fades in and settles once it has loaded. Give it the props
 * `getImageProps` returns, so the file still comes through Next's image
 * pipeline. */
export function FadeImage({
  alt,
  className,
  ...props
}: ComponentProps<"img"> & { readonly alt: string }) {
  return (
    // oxlint-disable-next-line next/no-img-element, react-doctor/nextjs-no-img-element -- the props come from getImageProps, so the files are optimised; a plate's <picture> needs a bare <img>, and one component serves both
    <img
      {...props}
      alt={alt}
      className={`home-fade ${className ?? ""}`}
      onLoad={revealLoaded}
      ref={holdUntilLoaded}
    />
  );
}
