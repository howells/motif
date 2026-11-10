import { FORMAT_PRESETS } from "@howells/motif-sdk";
import type { FormatPreset } from "@howells/motif-sdk";
import type { Command } from "commander";

/** Every format preset id, in the SDK table's display order. */
export const PRESET_IDS = Object.keys(FORMAT_PRESETS);

export function findPreset(id: string): FormatPreset | undefined {
  return Object.hasOwn(FORMAT_PRESETS, id) ? FORMAT_PRESETS[id] : undefined;
}

/** The first preset flag set to true in parsed options, in table order. */
export function chosenPreset(options: object): string | undefined {
  const flags = new Map(Object.entries(options));
  return PRESET_IDS.find((id) => flags.get(id) === true);
}

function presetHelp(id: string, preset: FormatPreset): string {
  const ratio =
    preset.resolution === undefined
      ? preset.aspect
      : `${preset.aspect}, ${preset.resolution}`;
  const size = preset.size === undefined ? "" : ` (${preset.size})`;
  return `${preset.description}: ${ratio}${size}`;
}

/** Adds one boolean flag per id, each with the table's help text. */
export function addPresetOptions(
  command: Command,
  ids: readonly string[]
): Command {
  for (const id of ids) {
    const preset = findPreset(id);
    if (preset === undefined) {
      throw new Error(`No format preset named ${id}`);
    }
    command.option(`--${id}`, presetHelp(id, preset));
  }
  return command;
}
