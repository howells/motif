"use client";

import { useBoard } from "@/components/app/boards/board-context";
import { Section, Segments } from "@/components/app/boards/inspector-controls";
import { useNodeOptions } from "@/components/app/boards/use-node-options";
import type { NodeViewOf } from "@/lib/app/boards/canvas";
import type { BoardQuality, SettingsPatch } from "@/lib/app/boards/model";

const QUALITY_LABEL: Readonly<Record<BoardQuality, string>> = {
  high: "High",
  low: "Low",
  max: "Max",
  medium: "Medium",
  xhigh: "Extra high",
};

/** fal's GIF defaults: nine frames, 200 ms each. */
const FRAME_COUNTS = [4, 6, 9, 12, 16, 24, 32, 48, 64] as const;
const FRAME_LENGTHS = [60, 100, 150, 200, 300, 500, 1000] as const;
const DEFAULT_FRAMES = 9;
const DEFAULT_FRAME_MS = 200;

type OutputNode = NodeViewOf<"generate" | "vary">;

/**
 * What a Generate or Vary makes: a flat image, an animated GIF or (from
 * text) an SVG, with a GIF's frames and the Model's quality. Frames and
 * quality are settings only some Models take, so setting one names the
 * Model Motif would choose, which then shows as chosen.
 */
export function OutputFields({ node }: { readonly node: OutputNode }) {
  const { editSettings } = useBoard();
  const options = useNodeOptions(node);
  const { format, frameCount, frameMs, model, quality } = node.settings;
  const chosen = model ?? options.data?.motifChoice ?? undefined;
  const qualities =
    options.data?.models.find((entry) => entry.model === chosen)?.qualities ??
    [];

  /** A Model-only setting, naming the Model it applies to. */
  const editNamed = (patch: SettingsPatch) => {
    editSettings(node, { ...patch, model: chosen });
  };

  const formats =
    node.kind === "generate"
      ? ([
          { label: "Image", value: "image" },
          { label: "GIF", value: "gif" },
          { label: "SVG", value: "svg" },
        ] as const)
      : ([
          { label: "Image", value: "image" },
          { label: "GIF", value: "gif" },
        ] as const);

  return (
    <>
      <Section label="Format">
        <Segments
          label="Format"
          onChange={(value) => {
            editSettings(node, {
              format: value === "image" ? undefined : value,
            });
          }}
          options={formats}
          value={format ?? "image"}
        />
      </Section>
      {format === "gif" ? (
        <div className="grid grid-cols-2 gap-3">
          <Section label="Frames">
            <select
              aria-label="Frames"
              className="board-field"
              disabled={chosen === undefined}
              onChange={(event) => {
                editNamed({ frameCount: Number(event.target.value) });
              }}
              value={frameCount ?? DEFAULT_FRAMES}
            >
              {FRAME_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </Section>
          <Section label="Each frame">
            <select
              aria-label="How long each frame shows"
              className="board-field"
              disabled={chosen === undefined}
              onChange={(event) => {
                editNamed({ frameMs: Number(event.target.value) });
              }}
              value={frameMs ?? DEFAULT_FRAME_MS}
            >
              {FRAME_LENGTHS.map((length) => (
                <option key={length} value={length}>
                  {length < 1000 ? `${length} ms` : "1 s"}
                </option>
              ))}
            </select>
          </Section>
        </div>
      ) : null}
      {qualities.length > 0 ? (
        <Section label="Quality">
          <select
            aria-label="Quality"
            className="board-field"
            onChange={(event) => {
              const level = qualities.find(
                (entry) => entry === event.target.value
              );
              if (level === undefined) {
                editSettings(node, { quality: undefined });
                return;
              }
              editNamed({ quality: level });
            }}
            value={quality ?? ""}
          >
            <option value="">The Model’s default</option>
            {qualities.map((level) => (
              <option key={level} value={level}>
                {QUALITY_LABEL[level]}
              </option>
            ))}
          </select>
        </Section>
      ) : null}
    </>
  );
}
