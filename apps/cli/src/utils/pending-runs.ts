/**
 * Runs fal accepted into its queue and Motif has not finished with, one small
 * file each under `~/.motif/pending`, so `motif resume <requestId>` can fetch
 * the job after a restart, a timeout or a failed poll.
 *
 * A record is written when fal accepts the run and removed once the files are
 * saved and recorded, or when fal reports the job failed. It holds the plan
 * the run was made with (its body with every data URL replaced by its size)
 * and what the save and report need; never an image. Ephemeral runs write
 * none: they ask fal to keep nothing.
 */

import { rmSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { TaskPlan } from "@howells/motif-sdk";

import { atomicWrite, MOTIF_DIR } from "./config";
import { redactDataUrls } from "./motif-client";
import {
  isRecord,
  readJsonFile,
  requiredFieldProblem,
  StorageError,
} from "./stored-json";

const PENDING_DIR = join(MOTIF_DIR, "pending");

/** A request id as fal issues it: safe to use as a file name. */
const REQUEST_ID_REGEX = /^[\w-]+$/;

/** What a run needs once its output is fetched, beyond the output itself. */
export interface PendingRun {
  /** The command as the original run emitted it, e.g. `erase`. */
  command: string;
  /** The plan the run was made with; the body holds no image bytes. */
  plan: TaskPlan;
  requestId: string;
  /** What the save, record and report read: the pipeline's own context. */
  run: Record<string, unknown>;
  /** Which pipeline finishes the run. */
  pipeline: "generation" | "task";
  submittedAt: string;
}

/** Whether `id` is shaped like a fal request id. */
export function isRequestId(id: string): boolean {
  return REQUEST_ID_REGEX.test(id);
}

function pathFor(requestId: string): string {
  if (!isRequestId(requestId)) {
    throw new TypeError(`Not a request id: ${JSON.stringify(requestId)}`);
  }
  return join(PENDING_DIR, `${requestId}.json`);
}

function pendingProblem(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return "expected a JSON object";
  }
  return (
    requiredFieldProblem(value, "requestId", "string") ??
    requiredFieldProblem(value, "command", "string") ??
    requiredFieldProblem(value, "pipeline", "string") ??
    requiredFieldProblem(value, "submittedAt", "string") ??
    (isRecord(value.plan) ? undefined : '"plan" must be an object') ??
    (isRecord(value.run) ? undefined : '"run" must be an object')
  );
}

/** A plan fit to store: its body without image bytes. */
export function storablePlan(plan: TaskPlan): TaskPlan {
  const body = redactDataUrls(plan.body);
  return { ...plan, body: isRecord(body) ? body : {} };
}

/** The record of a run fal has just accepted. */
export function pendingRun(
  requestId: string,
  command: string,
  plan: TaskPlan,
  pipeline: PendingRun["pipeline"],
  run: object
): PendingRun {
  return {
    command,
    pipeline,
    plan: storablePlan(plan),
    requestId,
    run: { ...run },
    submittedAt: new Date().toISOString(),
  };
}

async function writePending(run: PendingRun): Promise<void> {
  await mkdir(PENDING_DIR, { mode: 0o700, recursive: true });
  await atomicWrite(pathFor(run.requestId), JSON.stringify(run, null, 2));
}

/** The pending run for `requestId`, or undefined when there is none. */
export async function loadPendingRun(
  requestId: string
): Promise<PendingRun | undefined> {
  return await readJsonFile<PendingRun>(pathFor(requestId), pendingProblem);
}

/** Every pending run, oldest first. */
export async function listPendingRuns(): Promise<PendingRun[]> {
  let names: string[];
  try {
    names = await readdir(PENDING_DIR);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw new StorageError(PENDING_DIR, "read", error);
  }
  const runs = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(
        async (name) =>
          await readJsonFile<PendingRun>(
            join(PENDING_DIR, name),
            pendingProblem
          )
      )
  );
  return runs
    .filter((run): run is PendingRun => run !== undefined)
    .toSorted((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

/** Forget a pending run: its files are saved, or fal says the job is over. */
export function removePendingRun(requestId: string): void {
  rmSync(pathFor(requestId), { force: true });
}

/** {@link removePendingRun} for the id a finished run reports, which may be none. */
export function forgetPendingRun(requestId: string | undefined): void {
  if (requestId !== undefined && isRequestId(requestId)) {
    removePendingRun(requestId);
  }
}

/** Whether the record of a submitted run landed, and why not when it did not. */
export interface PendingOutcome {
  failure?: string;
  /** The id of the run, when its record was written. */
  requestId?: string;
}

/**
 * Keeps the pending record of one run. `onSubmitted` goes to the SDK, which
 * calls it the moment fal accepts the run; `written` then says whether the
 * record landed, so a failure that follows offers `motif resume` only when it
 * can be honoured, and says why when it cannot.
 */
export function trackSubmission(
  describe: (requestId: string) => PendingRun | undefined
): {
  onSubmitted: (requestId: string) => void;
  written: () => Promise<PendingOutcome>;
} {
  let stored: Promise<PendingOutcome> = Promise.resolve({});
  return {
    onSubmitted(requestId) {
      const run = describe(requestId);
      if (run !== undefined) {
        stored = writePending(run).then(
          () => ({ requestId }),
          (error: unknown) => ({
            failure: error instanceof Error ? error.message : String(error),
          })
        );
      }
    },
    written: async () => await stored,
  };
}
