"use client";

import Image from "next/image";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDimensions } from "@/lib/format";
import type { SampleRecord } from "@/lib/runs/types";

interface LightboxProps {
  readonly onClose: () => void;
  readonly sample: SampleRecord | null;
}

/** Full-res view, on the plate — the same neutral surround as the contact
 * sheet, for the same reason (`docs/design/specs/design-bench.md`).
 *
 * `unoptimized` is required here, not stylistic: Next's image optimizer
 * re-encodes on the way through, which silently changes the pixels a viewer
 * is trying to judge (`docs/arc/bench/BRIEF.md`, UI section — "the optimizer
 * re-encodes, which is invalid when comparing image quality"). Thumbnails in
 * `sample-frame.tsx` intentionally do NOT set this; only the full-res
 * comparison view needs untouched bytes.
 *
 * Built on shadcn's `dialog` rather than a hand-rolled backdrop: Radix
 * already owns focus trapping, `Escape`, scroll locking and the
 * click-outside-to-dismiss that the previous bespoke backdrop-button
 * approach was approximating. */
export const Lightbox = ({ onClose, sample }: LightboxProps) => {
  const imageUrl = sample?.imageUrl ?? null;
  const isOpen = sample !== null && imageUrl !== null;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={isOpen}
    >
      {sample !== null && imageUrl !== null ? (
        <DialogContent className="border-plate-edge bg-plate p-0">
          <DialogTitle className="sr-only">
            {sample.modelAlias}, sample {sample.sampleIndex}, full resolution
          </DialogTitle>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
            <Image
              alt={`${sample.modelName ?? sample.modelAlias} — sample ${sample.sampleIndex}, full resolution`}
              className="h-auto max-h-[calc(100dvh-9rem)] w-auto max-w-full rounded-frame object-contain"
              height={sample.height ?? 1024}
              src={imageUrl}
              unoptimized
              width={sample.width ?? 1024}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-plate-edge px-4 py-3 text-[11px] text-plate-muted">
            <span className="text-plate-ink">{sample.modelAlias}</span>
            <span className="bench-numeric">
              {formatDimensions(sample.width, sample.height)}
            </span>
            <span className="truncate">{sample.endpoint}</span>
            <DialogClose asChild>
              <Button className="ml-auto" size="sm" variant="plate">
                Close
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
};
