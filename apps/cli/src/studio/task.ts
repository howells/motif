/**
 * What Studio's screens share about running a Task: which Tiers are worth
 * offering, whether a request takes a resolution, how a cost reads, and
 * saving the first file a run returned.
 */

import { writeFile } from "node:fs/promises";

import { tierChangesChoice } from "@howells/motif-sdk";
import type {
  MotifClient,
  TaskId,
  TaskInput,
  TaskOutput,
  TaskRequest,
  Tier,
} from "@howells/motif-sdk";

import type { MotifConfig } from "../utils/config";
import { taskPins } from "../utils/config";
import { downloadImage } from "../utils/image";

export const TIER_OPTIONS: readonly { note: string; tier: Tier }[] = [
  { note: "Quickest and cheapest, with less detail", tier: "fast" },
  { note: "Good detail at a fair price", tier: "balanced" },
  { note: "Finest detail, slower and dearer", tier: "quality" },
];

/** The SDK's code for a refused option; the package index does not export it. */
const INVALID_OPTION = "INVALID_OPTION";

const DATA_URL_REGEX = /^data:image\/(\w+);base64,(.*)$/;

const EXTENSION_REGEX = /\.\w+$/;

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
  return usd === null ? "cost unknown" : `$${usd.toFixed(3)}`;
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

/** Save the first file a run returned; the extension follows the content. */
export async function saveFirstFile(
  output: TaskOutput,
  outputPath: string
): Promise<string> {
  const file = output.files[0];
  if (file === undefined) {
    throw new Error("The run returned no image.");
  }
  const inline = DATA_URL_REGEX.exec(file.url);
  if (inline === null) {
    return await downloadImage(file.url, outputPath);
  }
  const [, extension = "png", base64 = ""] = inline;
  const path = `${outputPath.replace(EXTENSION_REGEX, "")}.${extension}`;
  await writeFile(path, Buffer.from(base64, "base64"));
  return path;
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
