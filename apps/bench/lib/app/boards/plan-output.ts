/**
 * The parts of a Generate or Vary request that GPT Image 2.6 added: the
 * format (GIF or SVG), a GIF's frames, a quality level, and a Vary's markup.
 */
import type { BoardQuality, NodeSettings } from "./model";
import type { NodeInput } from "./plan";

/** fal's GIF defaults, used when a node sets only one of frames or speed. */
const GIF_FRAME_COUNT = 9;
const GIF_FRAME_MS = 200;

/** A node's format, frames and quality, as the Task request names them.
 * Frames are sent only for a GIF; they stay on the node otherwise. */
export const outputRequest = <F extends "gif" | "svg">(settings: {
  format?: F;
  frameCount?: number;
  frameMs?: number;
  quality?: BoardQuality;
}) => ({
  ...(settings.format !== undefined && { format: settings.format }),
  ...(settings.format === "gif" &&
    (settings.frameCount !== undefined || settings.frameMs !== undefined) && {
      frames: {
        count: settings.frameCount ?? GIF_FRAME_COUNT,
        durationMs: settings.frameMs ?? GIF_FRAME_MS,
      },
    }),
  ...(settings.quality !== undefined && { quality: settings.quality }),
});

/** The markup a Vary sends: none, the asset id, or why it can't go. Markup
 * is drawn on one image and is only sent with that image. */
export const markupFor = (
  vary: NodeSettings["vary"],
  input: Extract<NodeInput, { kind: "image" }>
): { readonly markupAssetId?: string } | { readonly reason: string } => {
  if (vary.markupAssetId === undefined) {
    return {};
  }
  if (input.pending) {
    return {
      reason:
        "The markup was drawn on the current Pick, and this run makes a new one. Run the step before first, then draw the markup again.",
    };
  }
  if (vary.markupDrawnOn !== input.assetId) {
    return {
      reason:
        "The markup was drawn on a different image. Draw it again on this one, or clear it.",
    };
  }
  return { markupAssetId: vary.markupAssetId };
};
