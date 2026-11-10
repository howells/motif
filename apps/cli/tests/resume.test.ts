import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  history,
  json,
  motif,
  objects,
  project,
  REMOTE_PNG,
} from "./pipeline-helpers";

/**
 * `motif resume`, against the fake fal: a run fal accepted but Motif could not
 * finish is collected by its request id and finished exactly as the original
 * command would have, once.
 */

const RESULT = { images: [REMOTE_PNG] };
/** A status poll whose body is not JSON: the run was accepted, then the poll failed. */
const POLL_FAILS = { FAKE_FAL_STATUS_BODY: "not json" };

function pendingFiles(dir: string): string[] {
  const path = join(dir, ".motif", "pending");
  return existsSync(path) ? readdirSync(path) : [];
}

function suggestionsOf(stderr: string): string[] {
  const { suggestions } = json(stderr);
  return Array.isArray(suggestions) ? suggestions.map(String) : [];
}

describe("a failed queued run", () => {
  it("prints the exact resume command and keeps a record to resume from", async () => {
    const dir = project();
    const run = await motif(
      dir,
      ["a cat", "-o", "cat.png", "--format", "json"],
      RESULT,
      POLL_FAILS
    );

    expect(run.code).toBe(5);
    const error = json(run.stderr);
    expect(error.instance).toBe("urn:fal:request:fake-request");
    expect(suggestionsOf(run.stderr).join("\n")).toContain(
      "motif resume fake-request"
    );
    expect(pendingFiles(dir)).toStrictEqual(["fake-request.json"]);
    expect(existsSync(join(dir, "cat.png"))).toBe(false);
  });

  it("is not resumable when fal says the job failed, and says fal's reason", async () => {
    const dir = project();
    const run = await motif(dir, ["a cat", "--format", "json"], RESULT, {
      FAKE_FAL_STATUS: "FAILED",
      FAKE_FAL_STATUS_ERROR: "out of memory",
    });

    expect(run.code).toBe(5);
    const error = json(run.stderr);
    expect(error).toMatchObject({
      code: "TASK_FAILED",
      message: "out of memory",
    });
    expect(suggestionsOf(run.stderr).join("\n")).not.toContain("motif resume");
    expect(pendingFiles(dir)).toStrictEqual([]);
  });

  it("leaves no record for a synchronous run, and says it cannot be resumed", async () => {
    const dir = project();
    const run = await motif(
      dir,
      ["erase", "the car", "in.png", "--format", "json"],
      RESULT,
      { FAKE_FAL_POST_STATUS: "500" }
    );

    expect(run.code).toBe(5);
    expect(json(run.stderr).code).toBe("SUBMISSION_UNCERTAIN");
    expect(suggestionsOf(run.stderr).join("\n")).toContain("cannot be resumed");
    expect(pendingFiles(dir)).toStrictEqual([]);
  });

  it("keeps no record for an ephemeral run, which asks fal to keep nothing", async () => {
    const dir = project();
    const run = await motif(
      dir,
      ["a cat", "--ephemeral", "--format", "json"],
      RESULT,
      POLL_FAILS
    );

    expect(run.code).toBe(5);
    expect(pendingFiles(dir)).toStrictEqual([]);
  });
});

describe("resume", () => {
  it("collects a generate run, saving and recording it as the original would, once", async () => {
    const dir = project();
    await motif(
      dir,
      ["a cat", "-o", "cat.png", "--format", "json"],
      RESULT,
      POLL_FAILS
    );

    const resumed = await motif(
      dir,
      ["resume", "fake-request", "--format", "json"],
      RESULT
    );

    expect(resumed.code).toBe(0);
    const payload = json(resumed.stdout);
    expect(payload).toMatchObject({
      command: "generate",
      requestId: "fake-request",
    });
    expect(objects(payload.images).map((image) => image.path)).toStrictEqual([
      join(dir, "cat.png"),
    ]);
    expect(history(dir)).toHaveLength(1);
    expect(history(dir)[0]).toMatchObject({
      output: join(dir, "cat.png"),
      prompt: "a cat",
    });
    expect(pendingFiles(dir)).toStrictEqual([]);

    const again = await motif(
      dir,
      ["resume", "fake-request", "--format", "json"],
      RESULT
    );
    expect(again.code).toBe(4);
    expect(json(again.stderr).code).toBe("PENDING_RUN_NOT_FOUND");
    expect(history(dir)).toHaveLength(1);
  });

  it("collects a Task run into the file the original was going to write", async () => {
    const dir = project();
    // segment --auto uses a Model that always runs through fal's queue.
    const result = {
      combined_mask: REMOTE_PNG,
      individual_masks: [REMOTE_PNG],
    };
    const run = await motif(
      dir,
      ["segment", "in.png", "--auto", "--format", "json"],
      result,
      POLL_FAILS
    );
    expect(run.code).toBe(5);
    expect(pendingFiles(dir)).toStrictEqual(["fake-request.json"]);

    const resumed = await motif(
      dir,
      ["resume", "fake-request", "--format", "json"],
      result
    );

    expect(resumed.code).toBe(0);
    expect(json(resumed.stdout)).toMatchObject({
      command: "segment",
      path: join(dir, "in-segment-auto.png"),
      requestId: "fake-request",
    });
    expect(history(dir)).toHaveLength(1);
    expect(pendingFiles(dir)).toStrictEqual([]);
  });

  it("saves to -o instead when asked", async () => {
    const dir = project();
    await motif(
      dir,
      ["a cat", "-o", "cat.png", "--format", "json"],
      RESULT,
      POLL_FAILS
    );

    const resumed = await motif(
      dir,
      ["resume", "fake-request", "-o", "elsewhere.png", "--format", "json"],
      RESULT
    );

    expect(resumed.code).toBe(0);
    expect(existsSync(join(dir, "elsewhere.png"))).toBe(true);
    expect(existsSync(join(dir, "cat.png"))).toBe(false);
  });

  it("waits for a job that is still running", async () => {
    const dir = project();
    await motif(
      dir,
      ["a cat", "-o", "cat.png", "--format", "json"],
      RESULT,
      POLL_FAILS
    );

    const resumed = await motif(
      dir,
      ["resume", "fake-request", "--format", "json"],
      RESULT,
      { FAKE_FAL_STATUS_SEQUENCE: "IN_PROGRESS,COMPLETED" }
    );

    expect(resumed.code).toBe(0);
    expect(existsSync(join(dir, "cat.png"))).toBe(true);
  }, 20_000);

  it("reports a job that failed at fal with fal's reason, and forgets it", async () => {
    const dir = project();
    await motif(dir, ["a cat", "--format", "json"], RESULT, POLL_FAILS);

    const resumed = await motif(
      dir,
      ["resume", "fake-request", "--format", "json"],
      RESULT,
      { FAKE_FAL_STATUS: "FAILED", FAKE_FAL_STATUS_ERROR: "out of memory" }
    );

    expect(resumed.code).toBe(5);
    expect(json(resumed.stderr)).toMatchObject({
      code: "TASK_FAILED",
      message: "out of memory",
    });
    expect(pendingFiles(dir)).toStrictEqual([]);
  });

  it.each([
    ["the id is unknown to fal", { FAKE_FAL_STATUS_HTTP: "404" }],
    ["the result has expired", { FAKE_FAL_RESULT_HTTP: "404" }],
  ])("says so when %s, and forgets the record", async (_name, env) => {
    const dir = project();
    await motif(dir, ["a cat", "--format", "json"], RESULT, POLL_FAILS);

    const resumed = await motif(
      dir,
      ["resume", "fake-request", "--format", "json"],
      RESULT,
      env
    );

    expect(resumed.code).toBe(4);
    expect(json(resumed.stderr).code).toBe("REQUEST_NOT_FOUND");
    expect(pendingFiles(dir)).toStrictEqual([]);
    expect(existsSync(join(dir, ".motif", "history.json"))).toBe(false);
  });

  it("refuses an id Motif has no record of before contacting fal", async () => {
    const dir = project();
    const log = join(dir, "fal.log");
    const resumed = await motif(
      dir,
      ["resume", "not-submitted-here", "--format", "json"],
      RESULT,
      { FAKE_FAL_LOG: log }
    );

    expect(resumed.code).toBe(4);
    expect(json(resumed.stderr).code).toBe("PENDING_RUN_NOT_FOUND");
    expect(existsSync(log)).toBe(false);
  });

  it("refuses something that is not a request id", async () => {
    const dir = project();
    const resumed = await motif(
      dir,
      ["resume", "../../history", "--format", "json"],
      RESULT
    );

    expect(resumed.code).toBe(2);
    expect(json(resumed.stderr).code).toBe("INVALID_OPTION");
  });

  it("reports what it would collect on --dry-run, without contacting fal", async () => {
    const dir = project();
    await motif(
      dir,
      ["a cat", "-o", "cat.png", "--format", "json"],
      RESULT,
      POLL_FAILS
    );
    const log = join(dir, "fal.log");

    const dry = await motif(
      dir,
      ["resume", "fake-request", "--dry-run", "--format", "json"],
      RESULT,
      { FAKE_FAL_LOG: log, FAL_KEY: "" }
    );

    expect(dry.code).toBe(0);
    expect(json(dry.stdout)).toMatchObject({
      command: "resume",
      dryRun: true,
      output: join(dir, "cat.png"),
      requestId: "fake-request",
      resumes: "generate",
      valid: true,
    });
    expect(existsSync(log)).toBe(false);
    expect(pendingFiles(dir)).toStrictEqual(["fake-request.json"]);
  });

  it("lists the runs that can be collected when given no id", async () => {
    const dir = project();
    await motif(
      dir,
      ["a cat", "-o", "cat.png", "--format", "json"],
      RESULT,
      POLL_FAILS
    );

    const listed = await motif(dir, ["resume", "--format", "json"], RESULT);

    expect(listed.code).toBe(0);
    const payload = json(listed.stdout);
    expect(payload).toMatchObject({ command: "resume", total: 1 });
    expect(objects(payload.pending)[0]).toMatchObject({
      command: "generate",
      output: join(dir, "cat.png"),
      requestId: "fake-request",
    });
  });
});
