"use client";

import type { KeyboardEvent, UIEvent } from "react";
import { useState } from "react";

/** The shared scroll machinery for every Blossom row on the page: the
 * catalogue carousels, source-and-takes, Looks and Moods. One file, no
 * components, so the Fast Refresh rule stays quiet and the chrome cannot
 * drift into separate systems. */

export function pad(index: number) {
  return String(index).padStart(2, "0");
}

export function progressOf(root: HTMLElement) {
  const max = root.scrollWidth - root.clientWidth;
  if (max <= 0) {
    return { index: 1, ratio: 0 };
  }
  const ratio = Math.min(1, Math.max(0, root.scrollLeft / max));
  const slides = root.children.length;
  const index = Math.min(
    slides,
    Math.max(1, Math.round(ratio * (slides - 1)) + 1)
  );
  return { index, ratio };
}

/** Shared scroll position for one carousel: which slide reads as current and
 * how far the track has moved. The wrapper owns one of these; the track
 * reports scrolling and the controls read the position back. */
export function useCarousel() {
  const [index, setIndex] = useState(1);
  const [ratio, setRatio] = useState(0);

  function onScroll(event: UIEvent<HTMLElement>) {
    const next = progressOf(event.currentTarget);
    setIndex(next.index);
    setRatio(next.ratio);
  }

  return { index, onScroll, ratio };
}

export function onTrackKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }
  /* The controls sit beside the track rather than around it in takes, so
     climb to the shared wrapper instead of assuming the parent holds them. */
  const root = event.currentTarget.closest("[data-carousel]");
  if (root === null) {
    return;
  }
  const label = event.key === "ArrowRight" ? "Next" : "Previous";
  const control = root.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  );
  control?.click();
  event.preventDefault();
}
