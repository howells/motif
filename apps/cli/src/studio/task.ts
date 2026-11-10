/**
 * What Studio's screens share about running a Task: which Tiers are worth
 * offering, whether a request takes a resolution, how a cost reads, and the
 * save, record and open that end a run.
 */

import {
  formatCost,
  INVALID_OPTION,
  tierChangesChoice,
} from "@howells/motif-sdk";
import type {
  MotifClient,
  TaskId,
  TaskInput,
  TaskOutput,
  TaskRequest,
  Tier,
} from "@howells/motif-sdk";

import type { GenerationFields, MotifConfig } from "../utils/config";
import { addGeneration, newGeneration, taskPins } from "../utils/config";
import { openImage } from "../utils/image";
import { saveFiles } from "../utils/output-files";

export const TIER_OPTIONS: readonly { note: string; tier: Tier }[] = [
  { note: "Quickest and cheapest, with less detail", tier: "fast" },
  { note: "Good detail at a fair price", tier: "balanced" },
  { note: "Finest detail, slower and dearer", tier: "quality" },
];

/** Whether picking a Tier would change what runs for this request. */
export function tierMatters(
  config: MotifConfig,
  task: TaskId,
  request: Omit<TaskRequest, "tier">
): boolean {
  return tierChangesChoice(task, request, {
    keys: ["FAL_KEY"],
    pins: taskPins(config),
  });
}

/** Whether the request can carry a resolution, asked of the plan itself. */
export function acceptsResolution(
  client: MotifClient,
  task: TaskId,
  input: TaskInput
): boolean {
  const planned = client.plan(task, input, { dryRun: true });
  return !(
    planned.isErr() &&
    planned.error.code === INVALID_OPTION &&
    planned.error.details?.field === "resolution"
  );
}

/** A USD figure for a person, or "cost unknown" when nobody knows it. */
export function costLabel(usd: number | null): string {
  return usd === null ? "cost unknown" : formatCost(usd);
}

/** The projected cost of a request, or the reason it cannot run. */
export function planCost(
  client: MotifClient,
  task: TaskId,
  input: TaskInput
): { cost: string } | { error: string } {
  const planned = client.plan(task, input, { dryRun: true });
  return planned.isOk()
    ? { cost: costLabel(planned.value.cost.usd) }
    : { error: planned.error.message };
}

/** What a finished run shows on the done screen. */
export interface RunResult {
  dims: string;
  path: string;
  size: string;
}

/**
 * Save the first file a run returned, record it in history, and show it in the
 * viewer: the tail every Studio run shares. The extension follows the content.
 */
export async function saveRun(
  output: TaskOutput,
  outputPath: string,
  record: Pick<
    GenerationFields,
    "aspect" | "editedFrom" | "prompt" | "resolution"
  >
): Promise<RunResult> {
  const [file] = await saveFiles(output.files, { paths: [outputPath] });
  if (file === undefined) {
    throw new Error("The run returned no image.");
  }
  await addGeneration(
    newGeneration({
      ...record,
      cost: output.cost.usd,
      model: output.model,
      output: file.path,
    })
  );
  openImage(file.path);
  return {
    dims:
      file.width === undefined || file.height === undefined
        ? "?"
        : `${file.width}x${file.height}`,
    path: file.path,
    size: file.size,
  };
}

/** Run a Task and return its output, throwing the error a failed run carries. */
export async function runTask(
  client: MotifClient,
  task: TaskId,
  input: TaskInput
): Promise<TaskOutput> {
  const result = await client.run(task, input);
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}
