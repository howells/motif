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
import { chosenPreset, findPreset, PRESET_IDS } from "./presets";
import { hasText } from "./text";

// -- Constants --

export const OUTPUT_FORMATS = ["jpeg", "png", "webp", "gif", "svg"] as const;
export function resolvePreset(
  options: CliOptions,
  stdinPreset: string | undefined,
  stdinAspect: string | undefined,
  stdinResolution: string | undefined,
  defaultAspect: AspectRatio,
  defaultResolution: Resolution
): { aspect: AspectRatio; resolution: Resolution } {
  const preset = chosenPreset(options) ?? stdinPreset;

  if (hasText(preset)) {
    const found = findPreset(preset);
    if (found === undefined) {
      throw new Error(
        `preset must be one of ${PRESET_IDS.toSorted().join(", ")}: ${JSON.stringify(preset)}`
      );
    }
    return {
      aspect: found.aspect,
      resolution: found.resolution ?? defaultResolution,
    };
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
