/**
 * The Edit screen's modes: which Task each runs, what it says while running,
 * where its file lands and how it is labelled in history.
 */

import type { TaskId } from "@howells/motif-sdk";

import { generateFilename } from "../utils/image";

const IMAGE_EXT_REGEX = /\.(png|jpg|jpeg|webp)$/i;

export type Mode = "edit" | "variations" | "upscale" | "rmbg";

export const TASK_FOR_MODE: Record<Mode, TaskId> = {
  edit: "generate",
  rmbg: "cutout",
  upscale: "upscale",
  variations: "vary",
};

export const STATUS_FOR_MODE: Record<Mode, string> = {
  edit: "Editing...",
  rmbg: "Removing background...",
  upscale: "Upscaling...",
  variations: "Making a variation...",
};

export const OPERATIONS: { key: Mode; label: string; description: string }[] = [
  { description: "Change it with a new prompt", key: "edit", label: "Edit" },
  {
    description: "Make similar images",
    key: "variations",
    label: "Variations",
  },
  { description: "Make it larger", key: "upscale", label: "Upscale" },
  {
    description: "Transparent PNG output",
    key: "rmbg",
    label: "Remove Background",
  },
];

export function outputPathFor(
  sourcePath: string,
  mode: Mode,
  scale: number
): string {
  if (mode === "upscale") {
    return sourcePath.replace(IMAGE_EXT_REGEX, `-up${scale}x.png`);
  }
  if (mode === "rmbg") {
    return sourcePath.replace(IMAGE_EXT_REGEX, "-nobg.png");
  }
  return generateFilename("motif-edit");
}

export function promptLabelFor(
  mode: Mode,
  prompts: { edit: string; scale: number; source: string }
): string {
  if (mode === "edit") {
    return prompts.edit;
  }
  if (mode === "upscale") {
    return `[upscale ${prompts.scale}x] ${prompts.source}`;
  }
  if (mode === "rmbg") {
    return `[rmbg] ${prompts.source}`;
  }
  return prompts.source;
}
