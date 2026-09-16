/**
 * Option resolution for the generate command: preset/aspect/resolution,
 * edit-reference paths, and the output format table.
 * Extracted from cli.ts so the generate command module stays focused.
 */

import { ASPECT_RATIOS, RESOLUTIONS } from "@howells/motif-sdk";
import type { AspectRatio, Resolution } from "@howells/motif-sdk";

import type { CliOptions } from "./cli-types";
import { handleError } from "./errors";
import { validateEditPath, validateEnumOption } from "./input";
import type { OutputFormat } from "./output";
import { hasText } from "./text";

// -- Constants --

export const OUTPUT_FORMATS = ["jpeg", "png", "webp"] as const;
export function resolvePreset(
  options: CliOptions,
  stdinPreset: string | undefined,
  stdinAspect: string | undefined,
  stdinResolution: string | undefined,
  defaultAspect: AspectRatio,
  defaultResolution: Resolution
): { aspect: AspectRatio; resolution: Resolution } {
  const PRESET_FLAGS = [
    "cover",
    "story",
    "reel",
    "feed",
    "og",
    "wallpaper",
    "ultra",
    "wide",
    "square",
    "landscape",
    "portrait",
  ] as const;
  const cliPreset = PRESET_FLAGS.find((flag) => options[flag] === true);
  const preset = cliPreset ?? stdinPreset;

  const PRESET_MAP: Record<
    string,
    { aspect: AspectRatio; resolution?: Resolution }
  > = {
    cover: { aspect: "2:3", resolution: "2K" },
    feed: { aspect: "4:5" },
    landscape: { aspect: "16:9" },
    og: { aspect: "16:9" },
    portrait: { aspect: "2:3" },
    reel: { aspect: "9:16" },
    square: { aspect: "1:1" },
    story: { aspect: "9:16" },
    ultra: { aspect: "21:9", resolution: "2K" },
    wallpaper: { aspect: "9:16", resolution: "2K" },
    wide: { aspect: "21:9" },
  };

  if (hasText(preset) && preset in PRESET_MAP) {
    // biome-ignore lint/style/noNonNullAssertion: Index is guaranteed to exist due to the `in` check
    const p = PRESET_MAP[preset]!;
    return {
      aspect: p.aspect,
      resolution: p.resolution ?? defaultResolution,
    };
  }
  if (hasText(preset)) {
    throw new Error(
      `preset must be one of ${Object.keys(PRESET_MAP).join(", ")}: ${JSON.stringify(preset)}`
    );
  }

  return {
    aspect: hasText(options.aspect ?? stdinAspect)
      ? validateEnumOption(
          options.aspect ?? stdinAspect ?? "",
          ASPECT_RATIOS,
          "aspect"
        )
      : defaultAspect,
    resolution: hasText(options.resolution ?? stdinResolution)
      ? validateEnumOption(
          options.resolution ?? stdinResolution ?? "",
          RESOLUTIONS,
          "resolution"
        )
      : defaultResolution,
  };
}

export function resolveEditPaths(
  editFiles: string[] | undefined,
  format: OutputFormat
): string[] | undefined {
  if (editFiles === undefined || editFiles.length === 0) {
    return undefined;
  }
  try {
    return editFiles.map((path) => validateEditPath(path));
  } catch (error) {
    handleError(error, "INVALID_EDIT_PATH", format);
  }
}
