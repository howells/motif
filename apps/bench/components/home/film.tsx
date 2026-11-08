"use client";

import { useState } from "react";

import type { Crop } from "@/components/home/plate";
import { Plate } from "@/components/home/plate";
import type { Figure } from "@/lib/site/home/types";

/** A still with a play button over it. The film loads only when the reader
 * presses play, then runs in the still's place with the browser's own
 * controls. */
export function Film({
  crop,
  figure,
  sizes,
}: {
  readonly crop: Crop;
  readonly figure: Figure & { readonly film: NonNullable<Figure["film"]> };
  readonly sizes: string;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative">
      <Plate crop={crop} image={figure.image} sizes={sizes} />
      {playing ? (
        // oxlint-disable-next-line jsx-a11y/media-has-caption -- the film has no speech or sound to caption
        <video
          autoPlay
          className="bg-surface absolute inset-0 size-full object-cover"
          controls
          playsInline
          src={figure.film.src}
        />
      ) : (
        <button
          aria-label={figure.film.play}
          className="group absolute inset-0 grid cursor-pointer place-items-center"
          onClick={() => {
            setPlaying(true);
          }}
          type="button"
        >
          <span className="bg-background/90 text-ink group-hover:bg-background grid size-18 place-items-center rounded-full transition-colors">
            <svg aria-hidden="true" height="22" viewBox="0 0 20 22" width="20">
              <path d="M2 1.5 L18.5 11 L2 20.5 Z" fill="currentcolor" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}
