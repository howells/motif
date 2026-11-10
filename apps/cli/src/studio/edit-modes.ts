/**
 * The Edit screen's modes: which Task each runs, what it says while running,
 * where its file lands and how it is labelled in history.
 */

import type { TaskId } from "@howells/motif-sdk";

import { historyPrompt } from "../utils/config";
import { generateFilename } from "../utils/image";
import { derivedOutputPath } from "../utils/output-files";

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

/** Where a mode's file lands: the CLI verbs' name for it, beside the source. */
export function outputPathFor(sourcePath: string, mode: Mode): string {
  if (mode === "upscale") {
    return derivedOutputPath(sourcePath, "-upscale", ".png");
  }
  if (mode === "rmbg") {
    return derivedOutputPath(sourcePath, "-cutout", ".png");
  }
  return generateFilename("motif-edit");
}

/** The history prompt: the CLI verbs' `[upscale]` and `[cutout]` tags. */
export function promptLabelFor(
  mode: Mode,
  prompts: { edit: string; source: string }
): string {
  if (mode === "edit") {
    return prompts.edit;
  }
  if (mode === "upscale") {
    return historyPrompt("upscale", prompts.source);
  }
  if (mode === "rmbg") {
    return historyPrompt("cutout", prompts.source);
  }
  return prompts.source;
}
