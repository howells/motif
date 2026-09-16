/**
 * Surface removed when the CLI moved to one verb per Task. Each exits 2 with
 * REMOVED_COMMAND, naming what replaced it in `details.use`, so an agent with
 * a stale picture of the CLI learns the new shape from the error.
 */

import { exitForErrorCode } from "../utils/errors";
import { emitError } from "../utils/output";
import type { OutputFormat } from "../utils/output";

const TASK_VERB_HINT =
  "the Task verb that does the job; see `motif --describe tasks`";

/** Removed flags and commands, and what to use instead. */
export const REMOVED_SURFACE: Readonly<Record<string, string>> = {
  "--rmbg": "motif cutout",
  "--scale": "motif upscale --scale",
  "--up": "motif upscale",
  "--vary": "motif vary",
  "--video": "motif animate",
  "--video-cfg-scale": "motif animate",
  "--video-duration": "motif animate",
  "--video-negative": "motif animate",
  "--video-no-audio": "motif animate",
  enhance: "`motif upscale` or `motif restore`",
  tool: TASK_VERB_HINT,
  tools: TASK_VERB_HINT,
};

/** Removed stdin `command` values. */
export const REMOVED_STDIN_COMMANDS: Readonly<Record<string, string>> = {
  rmbg: "motif cutout",
  "tool-describe": TASK_VERB_HINT,
  "tool-list": TASK_VERB_HINT,
  "tool-run": TASK_VERB_HINT,
  tool: TASK_VERB_HINT,
  upscale: "motif upscale",
  vary: "motif vary",
  video: "motif animate",
};

const TIER_HINT = "--tier";

/**
 * Model-only generate flags, and the fal body field each used to set. A
 * finer control than a Tier now goes through `--param <field>=<value>` with
 * `-m` naming the Model.
 */
export const REMOVED_GENERATE_FLAGS: Readonly<Record<string, string>> = {
  "--background": "background",
  "--disable-limit-generations": "limit_generations",
  "--disable-safety-checker": "enable_safety_checker",
  "--enhance-prompt": "enhance_prompt",
  "--expand-prompt": "expand_prompt",
  "--google-search": "enable_google_search",
  "--guidance-scale": "guidance_scale",
  "--image-prompt-strength": "image_prompt_strength",
  "--image-size": "image_size",
  "--limit-generations": "limit_generations",
  "--loose": "input_fidelity",
  "--no-expand-prompt": "expand_prompt",
  "--raw": "raw",
  "--safety": "safety_tolerance",
  "--safety-checker": "enable_safety_checker",
  "--steps": "num_inference_steps",
  "--style": "style",
  "--sync-mode": "sync_mode",
  "--web-search": "enable_web_search",
};

/** Flags a Tier now covers, and the fal body field for finer control. */
export const TIER_FLAGS: Readonly<Record<string, string>> = {
  "--quality": "quality",
  "--rendering-speed": "rendering_speed",
  "--thinking": "thinking_level",
};

export function exitRemoved(
  removed: string,
  use: string,
  format: OutputFormat,
  note?: string
): never {
  emitError(
    {
      code: "REMOVED_COMMAND",
      details: { removed, use },
      message: `${removed} was removed. Use ${use} instead.${note === undefined ? "" : ` ${note}`}`,
    },
    format
  );
  exitForErrorCode("REMOVED_COMMAND");
}

/** The flag name of an argv token: `--style=x` and `--style` both give `--style`. */
function flagName(arg: string): string {
  const equals = arg.indexOf("=");
  return equals === -1 ? arg : arg.slice(0, equals);
}

/**
 * Refuse removed top-level flags before commander sees them. `enhance`, `tool`
 * and `tools` as the first argument are refused as commands.
 */
export function refuseRemovedArgs(
  args: readonly string[],
  format: OutputFormat
): void {
  const [first] = args;
  if (first !== undefined && !first.startsWith("-")) {
    const use = REMOVED_SURFACE[first];
    if (use !== undefined) {
      exitRemoved(`motif ${first}`, use, format);
    }
  }
  for (const arg of args) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const name = flagName(arg);
    const replacement = REMOVED_SURFACE[name];
    if (replacement !== undefined) {
      exitRemoved(name, replacement, format);
    }
    const field = REMOVED_GENERATE_FLAGS[name];
    if (field !== undefined) {
      exitRemoved(name, `--param ${field}=<value> with -m`, format);
    }
    const tierField = TIER_FLAGS[name];
    if (tierField !== undefined) {
      exitRemoved(
        name,
        TIER_HINT,
        format,
        `A finer value needs --param ${tierField}=<value> with -m.`
      );
    }
  }
}

/** Model-only stdin fields, and the fal body field each used to set. */
const REMOVED_STDIN_FIELDS: Readonly<Record<string, string>> = {
  background: "background",
  enableGoogleSearch: "enable_google_search",
  enableSafetyChecker: "enable_safety_checker",
  enableWebSearch: "enable_web_search",
  enhancePrompt: "enhance_prompt",
  expandPrompt: "expand_prompt",
  guidanceScale: "guidance_scale",
  imagePromptStrength: "image_prompt_strength",
  imageSize: "image_size",
  inputFidelity: "input_fidelity",
  limitGenerations: "limit_generations",
  numInferenceSteps: "num_inference_steps",
  quality: "quality",
  raw: "raw",
  renderingSpeed: "rendering_speed",
  safetyTolerance: "safety_tolerance",
  style: "style",
  syncMode: "sync_mode",
  thinkingLevel: "thinking_level",
};

/** Refuse a stdin payload carrying a removed Model-only field. */
export function refuseRemovedStdinFields(
  payload: object,
  format: OutputFormat
): void {
  for (const key of Object.keys(payload)) {
    const field = REMOVED_STDIN_FIELDS[key];
    if (field !== undefined) {
      exitRemoved(
        `stdin field ${JSON.stringify(key)}`,
        `--param ${field}=<value> with -m`,
        format
      );
    }
  }
}
