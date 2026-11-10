/**
 * Option resolution for the generate command: preset/aspect/resolution,
 * edit-reference paths, and the output format table.
 * Extracted from cli.ts so the generate command module stays focused.
 */

import { ASPECT_RATIOS, RESOLUTIONS } from "@howells/motif-sdk";
import type { AspectRatio, Resolution } from "@howells/motif-sdk";

import type { CliOptions, StdinPayload } from "./cli-types";
import { handleError } from "./errors";
import { validateEditPath, validateEnumOption } from "./input";
import type { OutputFormat } from "./output";
import { chosenPreset, findPreset, PRESET_IDS } from "./presets";
import { hasText } from "./text";

// -- Constants --

export const OUTPUT_FORMATS = ["jpeg", "png", "webp", "gif", "svg"] as const;
/** The aspect and resolution a run reports, and the part of them it sends. */
export interface ResolvedSize {
  aspect: AspectRatio;
  /** What goes to the SDK: only what the caller, a preset or a Look chose. */
  request: { aspect?: AspectRatio; resolution?: Resolution };
  resolution: Resolution;
}

/**
 * The aspect and resolution of a generate run: a preset (flag, else stdin),
 * else `-a` / `-r` (flag, else stdin), else the Look's aspect and the config
 * defaults. An unchosen 1:1 aspect and an unchosen 2K resolution are reported
 * but not sent, so they never narrow the Models alone; a preset, a Look's
 * aspect, a flag, or a config default other than 1:1 / 2K is sent.
 */
export function resolveSize(
  options: CliOptions,
  stdin: Pick<StdinPayload, "aspect" | "preset" | "resolution"> | null,
  defaults: {
    aspect: AspectRatio;
    lookAspect?: AspectRatio;
    resolution: Resolution;
  }
): ResolvedSize {
  const flagResolution = options.resolution ?? stdin?.resolution;
  const flagAspect = options.aspect ?? stdin?.aspect;
  const presetId = chosenPreset(options) ?? stdin?.preset;
  const preset = hasText(presetId) ? findPreset(presetId) : undefined;
  if (hasText(presetId) && preset === undefined) {
    throw new Error(
      `preset must be one of ${PRESET_IDS.toSorted().join(", ")}: ${JSON.stringify(presetId)}`
    );
  }

  const aspect =
    preset?.aspect ??
    (hasText(flagAspect)
      ? validateEnumOption(flagAspect, ASPECT_RATIOS, "aspect")
      : (defaults.lookAspect ?? defaults.aspect));
  const resolution =
    preset === undefined
      ? hasText(flagResolution)
        ? validateEnumOption(flagResolution, RESOLUTIONS, "resolution")
        : defaults.resolution
      : (preset.resolution ?? defaults.resolution);

  const aspectChosen =
    preset !== undefined ||
    hasText(flagAspect) ||
    defaults.lookAspect !== undefined ||
    defaults.aspect !== "1:1";
  const resolutionChosen =
    hasText(flagResolution) ||
    defaults.resolution !== "2K" ||
    resolution !== "2K";
  return {
    aspect,
    request: {
      ...(aspectChosen && { aspect }),
      ...(resolutionChosen && { resolution }),
    },
    resolution,
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
