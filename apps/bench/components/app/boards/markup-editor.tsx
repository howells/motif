"use client";

import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { Segments } from "@/components/app/boards/inspector-controls";
import { MediaImage } from "@/components/app/media-image";

interface Point {
  readonly x: number;
  readonly y: number;
}

type Shape =
  | { readonly kind: "pen"; readonly points: readonly Point[] }
  | { readonly kind: "arrow"; readonly from: Point; readonly to: Point }
  | { readonly kind: "circle"; readonly from: Point; readonly to: Point }
  | { readonly kind: "note"; readonly at: Point; readonly text: string };

type Tool = Shape["kind"];

const INK = "rgb(226 40 32)";

export interface MarkupImage {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

const drawShape = (
  context: CanvasRenderingContext2D,
  shape: Shape,
  line: number
) => {
  context.strokeStyle = INK;
  context.fillStyle = INK;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = line;
  switch (shape.kind) {
    case "pen": {
      const [first, ...rest] = shape.points;
      if (first === undefined) {
        return;
      }
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (const point of rest) {
        context.lineTo(point.x, point.y);
      }
      context.stroke();
      return;
    }
    case "arrow": {
      const { from, to } = shape;
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const head = line * 4;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      context.beginPath();
      context.moveTo(to.x, to.y);
      context.lineTo(
        to.x - head * Math.cos(angle - Math.PI / 6),
        to.y - head * Math.sin(angle - Math.PI / 6)
      );
      context.lineTo(
        to.x - head * Math.cos(angle + Math.PI / 6),
        to.y - head * Math.sin(angle + Math.PI / 6)
      );
      context.closePath();
      context.fill();
      return;
    }
    case "circle": {
      const { from, to } = shape;
      context.beginPath();
      context.ellipse(
        (from.x + to.x) / 2,
        (from.y + to.y) / 2,
        Math.abs(to.x - from.x) / 2,
        Math.abs(to.y - from.y) / 2,
        0,
        0,
        Math.PI * 2
      );
      context.stroke();
      return;
    }
    case "note": {
      context.font = `600 ${line * 7}px system-ui, sans-serif`;
      context.textBaseline = "middle";
      context.fillText(shape.text, shape.at.x, shape.at.y);
      return;
    }
    default: {
      throw new TypeError("Unknown markup shape.");
    }
  }
};

const toBlob = async (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });

/**
 * Draw arrows, circles, notes and freehand marks over an image, at the
 * image's own pixel size. The marks alone, on a transparent background,
 * become the markup PNG that guides the edit.
 */
export function MarkupEditor({
  image,
  onChange,
}: {
  readonly image: MarkupImage;
  /** The markup as a PNG, or `null` when nothing is drawn. */
  readonly onChange: (markup: Blob | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("arrow");
  const [note, setNote] = useState("");
  const [shapes, setShapes] = useState<readonly Shape[]>([]);
  const [undone, setUndone] = useState<readonly Shape[]>([]);
  const [current, setCurrent] = useState<Shape | null>(null);
  const line = Math.max(
    3,
    Math.round(Math.max(image.width, image.height) / 220)
  );

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (element === null || context === null || context === undefined) {
      return;
    }
    context.clearRect(0, 0, element.width, element.height);
    for (const shape of current === null ? shapes : [...shapes, current]) {
      drawShape(context, shape, line);
    }
  }, [current, line, shapes]);

  const commit = async (next: readonly Shape[]) => {
    setShapes(next);
    if (next.length === 0) {
      onChange(null);
      return;
    }
    // The marks alone, at the image's size, on a transparent background.
    const offscreen = document.createElement("canvas");
    offscreen.width = image.width;
    offscreen.height = image.height;
    const context = offscreen.getContext("2d");
    if (context === null) {
      throw new Error("The markup couldn’t be drawn.");
    }
    for (const shape of next) {
      drawShape(context, shape, line);
    }
    onChange(await toBlob(offscreen));
  };

  const pointOf = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(
        image.width,
        Math.max(0, ((event.clientX - rect.left) / rect.width) * image.width)
      ),
      y: Math.min(
        image.height,
        Math.max(0, ((event.clientY - rect.top) / rect.height) * image.height)
      ),
    };
  };

  const down = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointOf(event);
    if (tool === "note") {
      if (note.trim() !== "") {
        setUndone([]);
        void commit([
          ...shapes,
          { at: point, kind: "note", text: note.trim() },
        ]);
      }
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setCurrent(
      tool === "pen"
        ? { kind: "pen", points: [point] }
        : { from: point, kind: tool, to: point }
    );
  };

  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (current === null) {
      return;
    }
    const point = pointOf(event);
    setCurrent(
      current.kind === "pen"
        ? { ...current, points: [...current.points, point] }
        : current.kind === "note"
          ? current
          : { ...current, to: point }
    );
  };

  const up = () => {
    if (current === null) {
      return;
    }
    setCurrent(null);
    setUndone([]);
    void commit([...shapes, current]);
  };

  const undo = () => {
    const last = shapes.at(-1);
    if (last !== undefined) {
      setUndone([...undone, last]);
      void commit(shapes.slice(0, -1));
    }
  };

  const redo = () => {
    const last = undone.at(-1);
    if (last !== undefined) {
      setUndone(undone.slice(0, -1));
      void commit([...shapes, last]);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segments
          label="Draw"
          onChange={setTool}
          options={[
            { label: "Arrow", value: "arrow" },
            { label: "Circle", value: "circle" },
            { label: "Pen", value: "pen" },
            { label: "Note", value: "note" },
          ]}
          value={tool}
        />
        {tool === "note" ? (
          <input
            aria-label="Note text"
            className="board-field min-w-40 flex-1"
            onChange={(event) => {
              setNote(event.target.value);
            }}
            placeholder="Type a note, then click to place it"
            value={note}
          />
        ) : null}
        <div className="ml-auto flex">
          <button
            aria-label="Undo"
            className="board-quiet disabled:opacity-40"
            disabled={shapes.length === 0}
            onClick={undo}
            type="button"
          >
            <Undo2 aria-hidden="true" size={18} strokeWidth={1.5} />
          </button>
          <button
            aria-label="Redo"
            className="board-quiet disabled:opacity-40"
            disabled={undone.length === 0}
            onClick={redo}
            type="button"
          >
            <Redo2 aria-hidden="true" size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <div className="bg-surface rounded-panel flex min-h-0 flex-1 items-center justify-center p-3">
        <div
          className="relative max-h-full w-full"
          style={{
            aspectRatio: `${image.width} / ${image.height}`,
            maxWidth: `calc((100dvh - 14rem) * ${image.width / image.height})`,
          }}
        >
          <MediaImage
            alt="The image to mark up"
            fit="contain"
            sizes="(max-width: 767px) 100vw, 60vw"
            src={image.url}
          />
          <canvas
            aria-label="Markup"
            className="absolute inset-0 size-full cursor-crosshair touch-none"
            height={image.height}
            onPointerCancel={up}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            ref={canvas}
            width={image.width}
          />
        </div>
      </div>
    </div>
  );
}
