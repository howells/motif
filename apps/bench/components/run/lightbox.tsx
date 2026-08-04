"use client";

import Image from "next/image";
import { useEffect } from "react";

import { formatDimensions } from "@/lib/format";
import type { SampleRecord } from "@/lib/runs/types";

interface LightboxProps {
  readonly onClose: () => void;
  readonly sample: SampleRecord;
}

/** Full-res view. `unoptimized` is required here, not stylistic — Next's
 * image optimizer re-encodes on the way through, which silently changes the
 * pixels a viewer is trying to judge (`docs/arc/bench/BRIEF.md`, UI section:
 * "the optimizer re-encodes, which is invalid when comparing image
 * quality"). Thumbnails in `image-grid.tsx` intentionally do NOT set this —
 * only the full-res comparison view needs untouched bytes.
 *
 * The backdrop click-to-dismiss is a real `<button>` positioned *behind*
 * the content as a sibling, not a wrapping element with an `onClick` — a
 * `<button>` cannot contain the content's own "Close" `<button>` (invalid
 * HTML), and a non-interactive `<div onClick>` needs a role and a keyboard
 * handler it would otherwise be faking. Making it an actual button gives
 * keyboard/AT support for free and content, layered on top via z-index,
 * never needs `stopPropagation()` — a click on it simply never reaches the
 * backdrop element underneath. */
export const Lightbox = ({ sample, onClose }: LightboxProps) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  if (sample.imageUrl === null) {
    return null;
  }

  return (
    <div className="lightbox-backdrop">
      <button
        aria-label="Close lightbox"
        className="lightbox-backdrop-button"
        onClick={onClose}
        type="button"
      />
      <div className="lightbox-content">
        <Image
          alt={`${sample.modelName ?? sample.modelAlias} — sample ${sample.sampleIndex}, full resolution`}
          height={sample.height ?? 1024}
          src={sample.imageUrl}
          unoptimized
          width={sample.width ?? 1024}
        />
        <div className="run-meta">
          <span>{sample.modelName ?? sample.modelAlias}</span>
          <span>{formatDimensions(sample.width, sample.height)}</span>
          <span>endpoint: {sample.endpoint}</span>
          <button className="btn" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
