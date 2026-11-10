/** Helpers the Series commands share: the size, input and creative direction one call sends. */

import type {
  AspectRatio,
  CreativeDirection,
  MotifClient,
  MotifError,
  Resolution,
  TaskInput,
  TaskOutput,
  TaskPlan,
  Tier,
} from "@howells/motif-sdk";

import { resolveCreativeDirection } from "../../utils/creative";
import type { CreativeInput } from "../../utils/creative";
import type { EmitOptions } from "../../utils/output";
import type { SeriesConfig } from "../../utils/series";
import { exitTaskError } from "../../utils/task-model";
import { hasText } from "../../utils/text";

/**
 * Creative direction for one series call: CLI flags win, then the look and
 * mood pinned on the series. `--no-mood` drops the pinned mood for this call.
 */
export function seriesCreativeDirection(
  flags: CreativeInput,
  series: SeriesConfig | null
): CreativeDirection | undefined {
  const pinned: CreativeDirection = {};
  if (hasText(series?.look)) {
    pinned.look = series.look;
  }
  if (hasText(series?.mood)) {
    pinned.mood = series.mood;
  }
  return resolveCreativeDirection(flags, pinned);
}

/**
 * The aspect and resolution a Series call sends: a flag's value, or a value
 * other than the 1:1 / 2K the Models default to. An unchosen default is left
 * to the Model so it never narrows the ranking alone.
 */
export function sentSize(
  flags: { aspect?: string; resolution?: string },
  size: { aspect: AspectRatio; resolution: Resolution }
): { aspect?: AspectRatio; resolution?: Resolution } {
  return {
    ...((hasText(flags.aspect) || size.aspect !== "1:1") && {
      aspect: size.aspect,
    }),
    ...((hasText(flags.resolution) || size.resolution !== "2K") && {
      resolution: size.resolution,
    }),
  };
}

/**
 * The size an anchored scene sends. The anchor is a reference, so the request
 * is an edit, and an edit with no aspect follows its source or the nearest
 * ratio a Model makes. Scene 1 with no aspect is a 1:1 render, so every
 * anchored scene names the Series' aspect (chosen or the 1:1 default) and
 * comes out the same shape as scene 1. A resolution is sent only when it was
 * chosen, as for scene 1.
 */
export function anchoredSize(
  flags: { aspect?: string; resolution?: string },
  size: { aspect: AspectRatio; resolution: Resolution }
): { aspect: AspectRatio; resolution?: Resolution } {
  return { ...sentSize(flags, size), aspect: size.aspect };
}

/** A 1x1 PNG that stands in for the anchor image while scenes are planned, before it exists. */
export const PLANNING_ANCHOR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/**
 * Plan every scene's real request before anything is paid for: `plan(i)` is
 * scene `i`'s request, anchored where the run will anchor it. The first
 * refusal ends the planning, so a run that cannot plan scene N spends nothing
 * on scenes 1 to N-1.
 */
export function planScenes(
  count: number,
  plan: (index: number) => ReturnType<MotifClient["plan"]>
): { plans: TaskPlan[] } | { error: MotifError } {
  const plans: TaskPlan[] = [];
  for (let index = 0; index < count; index++) {
    const planned = plan(index);
    if (planned.isErr()) {
      return { error: planned.error };
    }
    plans.push(planned.value);
  }
  return { plans };
}

/**
 * The generate input a Series call sends. The Look and Mood go to the SDK,
 * which appends their clauses to the prompt and lets a Look choose its Model.
 */
export function seriesInput(options: {
  count: number;
  creative?: CreativeDirection;
  model?: string;
  prompt: string;
  references: readonly string[];
  size: { aspect?: AspectRatio; resolution?: Resolution };
  tier?: Tier;
}): TaskInput {
  return {
    prompt: options.prompt,
    ...options.size,
    ...(options.tier !== undefined && { tier: options.tier }),
    ...(options.count > 1 && { count: options.count }),
    ...(options.references.length > 0 && { references: options.references }),
    ...(hasText(options.model) && { model: options.model }),
    ...(hasText(options.creative?.look) && { look: options.creative.look }),
    ...(hasText(options.creative?.mood) && { mood: options.creative.mood }),
  };
}

/** Run a Series generation, exiting with the mapped error when it fails. */
export async function runSeriesTask(
  client: MotifClient,
  input: TaskInput,
  emitOpts: EmitOptions
): Promise<TaskOutput> {
  const ran = await client.run("generate", input);
  if (ran.isErr()) {
    exitTaskError(ran.error, emitOpts.format, {
      model: input.model,
      task: "generate",
    });
  }
  return ran.value;
}

export function splitRefTags(refs: string | undefined): string[] | undefined {
  return refs
    ?.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
