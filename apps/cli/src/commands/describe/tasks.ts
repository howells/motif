/**
 * What the SDK knows about each Task, as `--describe` states it: the Models a
 * Task ranks, its Tiers and modes, and the task table.
 */

import { isTaskId, modelProfile, TASKS, TIERS } from "@howells/motif-sdk";
import type { ModelSizing, TaskDefinition, TaskId } from "@howells/motif-sdk";

import { COMMAND_TASKS, TASK_INDEX, taskRouting } from "../verbs/tasks";

/** The Model ids a Task ranks, in rank order and without repeats. */
export function taskModelIds(task: TaskId): string[] {
  return [...new Set(TASKS[task].models.map((entry) => entry.model))];
}

/**
 * What a Task verb's row adds in `--describe tasks`: the SDK's summary and
 * notFor, the Tiers its ranking offers, its modes, and the Model ids `-m`
 * accepts as overrides, best-ranked first.
 */
export function taskDetails(command: string): Record<string, unknown> {
  if (!isTaskId(command)) {
    return {};
  }
  const definition: TaskDefinition = TASKS[command];
  const plain = definition.models.filter((entry) => entry.mode === undefined);
  return {
    task: command,
    taskSummary: definition.summary,
    notFor: definition.notFor,
    tiers: TIERS.filter((tier) => plain.some((entry) => entry.tier === tier)),
    modes: (definition.modes ?? []).map(({ id, summary }) => ({ id, summary })),
    models: [...new Set(definition.models.map((entry) => entry.model))],
    rankedFrom: definition.rankedFrom,
    rankedAt: definition.rankedAt,
    basis: definition.basis,
    ranking: definition.models.map((entry) => ({
      model: entry.model,
      name: rankedName(entry.model),
      sizing: rankedSizing(entry.model),
      ...rankedLimits(entry.model, definition.generationModels === true),
      tier: entry.tier,
      ...(entry.mode === undefined ? {} : { mode: entry.mode }),
      benchmark: entry.benchmark ?? null,
    })),
    ...(command === "generate" ? { referenceRankingTask: "vary" } : {}),
  };
}

/** What a resolution tier means for a ranked Model, from the SDK's tables. */
function rankedSizing(model: string): ModelSizing {
  const profile = modelProfile(model);
  if (profile === undefined) {
    throw new Error(`Ranked Model ${model} is in no registry.`);
  }
  return profile.sizing;
}

/**
 * The limits a ranked Model's tables state: the upscale factors it takes
 * (`scaleRange`) and, for a generation Task, the most images one request makes
 * (`maxCount`, null where the Model takes a count but states no maximum).
 */
function rankedLimits(
  model: string,
  generation: boolean
): { maxCount?: number | null; scaleRange?: { max: number; min: number } } {
  const profile = modelProfile(model);
  if (profile === undefined) {
    throw new Error(`Ranked Model ${model} is in no registry.`);
  }
  return {
    ...(profile.scaleRange !== undefined && { scaleRange: profile.scaleRange }),
    ...(generation && {
      maxCount:
        profile.maxCount ?? (profile.capabilities.has("count") ? null : 1),
    }),
  };
}

/** The display name of a ranked Model; every ranked Model is in a registry. */
function rankedName(model: string): string {
  const profile = modelProfile(model);
  if (profile === undefined) {
    throw new Error(`Ranked Model ${model} is in no registry.`);
  }
  return profile.name;
}

/** The task table alone: `motif --describe tasks`. */
export function tasksSchema() {
  return {
    command: "tasks",
    description:
      "Which command does which job. `tasks` maps a task word to its command; `commands` says when to use each, what to use instead, how to invoke it, and for each Task its Tiers, modes and the Model ids -m accepts.",
    tasks: TASK_INDEX,
    commands: Object.fromEntries(
      COMMAND_TASKS.map((row) => [
        row.command,
        {
          summary: row.summary,
          usage: row.usage,
          ...taskRouting(row),
          ...taskDetails(row.command),
        },
      ])
    ),
  };
}
