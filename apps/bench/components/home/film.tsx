"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import type { Figure } from "@/lib/site/home/types";

/** A still, passed in as `children`, with a play button over it. The film
 * loads only when the reader presses play, then runs in the still's place
 * with the browser's own controls. */
export function Film({
  children,
  film,
}: {
  readonly children: ReactNode;
  readonly film: NonNullable<Figure["film"]>;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative">
      {children}
      {playing ? (
        // oxlint-disable-next-line jsx-a11y/media-has-caption -- the film has no speech or sound to caption
        <video
          autoPlay
          className="bg-surface absolute inset-0 size-full object-cover"
          controls
          playsInline
          src={film.src}
        />
      ) : (
        <button
          aria-label={film.play}
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
