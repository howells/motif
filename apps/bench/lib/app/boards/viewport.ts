/**
 * Where the canvas looks and where new nodes go, as plain geometry: keep the
 * selected node in view beside the settings panel, and put a new node to
 * the right of the node it is wired from without landing on another.
 */
import { IMAGE_HEIGHT } from "./canvas";
import type { NodeKind } from "./model";

/** A rectangle in the canvas's own coordinates. */
export interface Box {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** A card's header, property rows and footer around its image, roughly. */
export const CARD_CHROME = 160;

/** A card's height before the canvas has measured it. */
export const estimatedHeight = (kind: NodeKind): number =>
  IMAGE_HEIGHT[kind] + CARD_CHROME;

/** Room kept between a revealed node and the pane's edges, in pixels. */
const MARGIN = 32;

/** The shift along one axis that brings `[start, end]` inside
 * `[MARGIN, size - MARGIN]`, favouring the leading edge. */
const shiftInto = (start: number, end: number, size: number): number => {
  let shift = 0;
  if (end > size - MARGIN) {
    shift = size - MARGIN - end;
  }
  if (start + shift < MARGIN) {
    shift = MARGIN - start;
  }
  return shift;
};

/**
 * The viewport that shows all of `box` in a pane of `pane` pixels, moving as
 * little as it can; `null` when it is already in view. A box too big for
 * the pane at this zoom is zoomed out to fit and centred.
 */
export const revealViewport = (
  box: Box,
  viewport: Viewport,
  pane: { readonly height: number; readonly width: number }
): Viewport | null => {
  const room = {
    height: Math.max(1, pane.height - MARGIN * 2),
    width: Math.max(1, pane.width - MARGIN * 2),
  };
  const fit = Math.min(room.width / box.width, room.height / box.height);
  if (fit < viewport.zoom) {
    const zoom = fit;
    return {
      x: pane.width / 2 - (box.x + box.width / 2) * zoom,
      y: pane.height / 2 - (box.y + box.height / 2) * zoom,
      zoom,
    };
  }
  const left = box.x * viewport.zoom + viewport.x;
  const top = box.y * viewport.zoom + viewport.y;
  const dx = shiftInto(left, left + box.width * viewport.zoom, pane.width);
  const dy = shiftInto(top, top + box.height * viewport.zoom, pane.height);
  if (dx === 0 && dy === 0) {
    return null;
  }
  return { x: viewport.x + dx, y: viewport.y + dy, zoom: viewport.zoom };
};

/** The gap between a node and the one placed beside or below it. */
const GAP = { x: 64, y: 32 } as const;

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width + GAP.y &&
  b.x < a.x + a.width + GAP.y &&
  a.y < b.y + b.height + GAP.y &&
  b.y < a.y + a.height + GAP.y;

/**
 * Where a new node of `size` goes beside `from`: to its right, level with
 * it, then lower down past anything already there.
 */
export const besidePlacement = (
  from: Box,
  size: { readonly height: number; readonly width: number },
  others: readonly Box[]
) =>
  clearPlacement(
    { ...size, x: from.x + from.width + GAP.x, y: from.y },
    others
  );

/**
 * The first spot at or below `wanted` that lands on nothing in `others`:
 * a node dropped where another already sits moves down past it.
 */
export const clearPlacement = (wanted: Box, others: readonly Box[]) => {
  const spot = { ...wanted };
  for (;;) {
    const blocker = others.find((other) => overlaps(spot, other));
    if (blocker === undefined) {
      return { x: spot.x, y: spot.y };
    }
    spot.y = blocker.y + blocker.height + GAP.y;
  }
};
