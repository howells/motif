"use client";

import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { MediaImage } from "@/components/app/media-image";
import type { Box, PickedImage } from "@/lib/app/client/task-draft";

interface Stroke {
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly size: number;
}

const MARK = "rgb(196 64 52 / 55%)";

const toBlob = async (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });

const drawStroke = (
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  colour: string
) => {
  const [first, ...rest] = stroke.points;
  if (first === undefined) {
    return;
  }
  context.strokeStyle = colour;
  context.fillStyle = colour;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = stroke.size;
  if (rest.length === 0) {
    context.beginPath();
    context.arc(first.x, first.y, stroke.size / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (const point of rest) {
    context.lineTo(point.x, point.y);
  }
  context.stroke();
};

/**
 * Paint over what to remove, or draw boxes around it, on the Source at its
 * own pixel size. A painted area becomes a PNG mask the size of the Source:
 * white where it should go, black where it stays.
 */
export function MaskEditor({
  boxes,
  mode,
  onBoxes,
  onMask,
  source,
}: {
  readonly boxes: readonly Box[];
  readonly mode: "boxes" | "paint";
  readonly onBoxes: (boxes: readonly Box[]) => void;
  readonly onMask: (mask: Blob | null) => void;
  readonly source: PickedImage;
}) {
  const overlay = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<readonly Stroke[]>([]);
  const [undone, setUndone] = useState<readonly Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);
  const anchor = useRef<{ x: number; y: number } | null>(null);
  const longest = Math.max(source.width, source.height);
  const [size, setSize] = useState(() => Math.round(longest * 0.04));

  // Redraw the visible marks whenever they change.
  useEffect(() => {
    const canvas = overlay.current;
    const context = canvas?.getContext("2d");
    if (canvas === null || context === null || context === undefined) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (mode === "paint") {
      for (const stroke of current === null ? strokes : [...strokes, current]) {
        drawStroke(context, stroke, MARK);
      }
      return;
    }
    context.lineWidth = Math.max(2, longest / 400);
    context.strokeStyle = "rgb(196 64 52)";
    context.fillStyle = "rgb(196 64 52 / 20%)";
    for (const box of draft === null ? boxes : [...boxes, draft]) {
      context.fillRect(box.x, box.y, box.width, box.height);
      context.strokeRect(box.x, box.y, box.width, box.height);
    }
  }, [boxes, current, draft, longest, mode, strokes]);

  const exportMask = async (all: readonly Stroke[]) => {
    if (all.length === 0) {
      onMask(null);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    if (context === null) {
      return;
    }
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (const stroke of all) {
      drawStroke(context, stroke, "#fff");
    }
    onMask(await toBlob(canvas));
  };

  const pointOf = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(
        source.width,
        Math.max(0, ((event.clientX - rect.left) / rect.width) * source.width)
      ),
      y: Math.min(
        source.height,
        Math.max(0, ((event.clientY - rect.top) / rect.height) * source.height)
      ),
    };
  };

  const down = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointOf(event);
    if (mode === "paint") {
      setCurrent({ points: [point], size });
    } else {
      anchor.current = point;
    }
  };

  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointOf(event);
    if (mode === "paint" && current !== null) {
      setCurrent({ ...current, points: [...current.points, point] });
    }
    const start = anchor.current;
    if (mode === "boxes" && start !== null) {
      setDraft({
        height: Math.round(Math.abs(point.y - start.y)),
        width: Math.round(Math.abs(point.x - start.x)),
        x: Math.round(Math.min(point.x, start.x)),
        y: Math.round(Math.min(point.y, start.y)),
      });
    }
  };

  const up = () => {
    if (mode === "paint" && current !== null) {
      const next = [...strokes, current];
      setStrokes(next);
      setUndone([]);
      setCurrent(null);
      void exportMask(next);
    }
    if (mode === "boxes") {
      if (draft !== null && draft.width >= 4 && draft.height >= 4) {
        onBoxes([...boxes, draft]);
      }
      setDraft(null);
      anchor.current = null;
    }
  };

  const undo = () => {
    if (mode === "boxes") {
      onBoxes(boxes.slice(0, -1));
      return;
    }
    const last = strokes.at(-1);
    if (last === undefined) {
      return;
    }
    const next = strokes.slice(0, -1);
    setStrokes(next);
    setUndone([...undone, last]);
    void exportMask(next);
  };

  const redo = () => {
    const last = undone.at(-1);
    if (last === undefined) {
      return;
    }
    const next = [...strokes, last];
    setStrokes(next);
    setUndone(undone.slice(0, -1));
    void exportMask(next);
  };

  const clear = () => {
    if (mode === "boxes") {
      onBoxes([]);
      return;
    }
    setStrokes([]);
    setUndone([]);
    onMask(null);
  };

  const marked = mode === "paint" ? strokes.length > 0 : boxes.length > 0;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="app-plate relative flex flex-1 items-center justify-center p-4 md:p-10">
        <div
          className="relative max-h-full w-full"
          style={{
            aspectRatio: `${source.width} / ${source.height}`,
            maxWidth: `calc((100dvh - 16rem) * ${source.width / source.height})`,
          }}
        >
          <MediaImage
            alt="The Source"
            fit="contain"
            sizes="(max-width: 767px) 100vw, 60vw"
            src={source.url}
          />
          <canvas
            aria-hidden="true"
            className="absolute inset-0 size-full cursor-crosshair touch-none"
            height={source.height}
            onPointerCancel={up}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            ref={overlay}
            width={source.width}
          />
        </div>
        <div className="absolute top-2 right-2 flex">
          <button
            aria-label="Undo"
            className="flex size-11 items-center justify-center disabled:opacity-40"
            disabled={!marked}
            onClick={undo}
            type="button"
          >
            <Undo2 aria-hidden="true" size={18} strokeWidth={1.5} />
          </button>
          {mode === "paint" ? (
            <button
              aria-label="Redo"
              className="flex size-11 items-center justify-center disabled:opacity-40"
              disabled={undone.length === 0}
              onClick={redo}
              type="button"
            >
              <Redo2 aria-hidden="true" size={18} strokeWidth={1.5} />
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="type-body">
            {mode === "paint"
              ? "Paint over what to remove"
              : "Drag a box around each thing to remove"}
          </span>
          <span className="app-value text-faint">
            {source.width} × {source.height}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {mode === "paint" ? (
            <label className="type-small text-muted flex items-center gap-2">
              Brush
              <input
                className="w-28 accent-[var(--ink)]"
                max={Math.round(longest * 0.15)}
                min={Math.max(4, Math.round(longest * 0.005))}
                onChange={(event) => {
                  setSize(Number(event.target.value));
                }}
                type="range"
                value={size}
              />
            </label>
          ) : (
            <span className="type-small text-muted">
              {boxes.length === 1 ? "1 box" : `${boxes.length} boxes`}
            </span>
          )}
          <button
            className="app-button"
            disabled={!marked}
            onClick={clear}
            type="button"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
