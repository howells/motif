import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
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
 * A command that spends and then records checks the state it will record into
 * before it spends, and a recording failure after the spend never hides the
 * files that were saved. Run against the fake fal, which logs every request.
 */

function corruptHistory(dir: string): void {
  mkdirSync(join(dir, ".motif"), { recursive: true });
  writeFileSync(join(dir, ".motif/history.json"), "not json");
}

async function expectRefusedBeforeSpending(
  dir: string,
  args: string[],
  result: Record<string, unknown>
): Promise<void> {
  const log = join(dir, "fal.log");
  const run = await motif(dir, [...args, "--format", "json"], result, {
    FAKE_FAL_LOG: log,
  });

  expect(run.code).toBe(2);
  expect(json(run.stderr)).toMatchObject({ code: "CORRUPT_FILE" });
  expect(existsSync(log)).toBe(false);
}

describe("corrupt history is found before anything is spent", () => {
  it("generate", async () => {
    const dir = project();
    corruptHistory(dir);

    await expectRefusedBeforeSpending(dir, ["a cat", "-o", "cat.png"], {
      images: [REMOTE_PNG],
    });
    expect(existsSync(join(dir, "cat.png"))).toBe(false);
  });

  it("a Task verb", async () => {
    const dir = project();
    corruptHistory(dir);

    await expectRefusedBeforeSpending(dir, ["cutout", "in.png"], {
      image: REMOTE_PNG,
    });
  });

  it("series gen", async () => {
    const dir = project();
    const created = await motif(
      dir,
      ["series", "create", "wax", "--style", "wax", "--format", "json"],
      {}
    );
    expect(created.code).toBe(0);
    corruptHistory(dir);

    await expectRefusedBeforeSpending(
      dir,
      ["series", "gen", "wax", "a candle"],
      { images: [REMOTE_PNG] }
    );
  });

  it("series run", async () => {
    const dir = project();
    corruptHistory(dir);

    await expectRefusedBeforeSpending(
      dir,
      ["series", "run", "candles", "--count", "2"],
      { images: [REMOTE_PNG] }
    );
  });
});

describe("a history that cannot be written after the spend", () => {
  it("still reports the saved files, then fails with its own code and exit code", async () => {
    const dir = project();
    mkdirSync(join(dir, ".motif"));
    chmodSync(join(dir, ".motif"), 0o500);
    try {
      const run = await motif(
        dir,
        ["a cat", "-o", "cat.png", "--format", "json"],
        { images: [REMOTE_PNG] }
      );

      expect(run.code).toBe(2);
      const result = json(run.stdout);
      expect(result).toMatchObject({
        historyRecorded: false,
        requestId: "fake-request",
      });
      expect(typeof result.model).toBe("string");
      expect(objects(result.images)[0]).toMatchObject({
        path: join(dir, "cat.png"),
      });
      expect(existsSync(join(dir, "cat.png"))).toBe(true);
      const error = json(run.stderr);
      expect(error).toMatchObject({ code: "FILE_ACCESS_FAILED" });
      expect(String(error.message)).toContain("files are saved");
    } finally {
      chmodSync(join(dir, ".motif"), 0o700);
    }
  });
});

describe("output that cannot be written is refused before the spend", () => {
  it("refuses an output directory that cannot be created", async () => {
    const dir = project();
    writeFileSync(join(dir, "blocker"), "a file where a directory should be");
    const log = join(dir, "fal.log");

    const run = await motif(
      dir,
      ["a cat", "-o", "blocker/cat.png", "--format", "json"],
      { images: [REMOTE_PNG] },
      { FAKE_FAL_LOG: log }
    );

    expect(run.code).toBe(2);
    expect(json(run.stderr)).toMatchObject({ code: "INVALID_OUTPUT_PATH" });
    expect(existsSync(log)).toBe(false);
  });
});

describe("a run whose files do not all save", () => {
  it("reports the saved files, records them, and names the one that failed with its URL", async () => {
    const dir = project();
    const run = await motif(
      dir,
      ["a cat", "-o", "cat.png", "-n", "2", "--format", "json"],
      {
        images: [REMOTE_PNG, { url: "https://cdn.fake/broken.png" }],
      }
    );

    expect(run.code).toBe(5);
    const result = json(run.stdout);
    expect(objects(result.images).map((image) => image.path)).toStrictEqual([
      join(dir, "cat-1.png"),
    ]);
    expect(existsSync(join(dir, "cat-1.png"))).toBe(true);
    expect(history(dir).map((entry) => entry.output)).toStrictEqual([
      join(dir, "cat-1.png"),
    ]);
    expect(objects(result.failed)[0]).toMatchObject({
      path: join(dir, "cat-2.png"),
      remoteUrl: "https://cdn.fake/broken.png",
    });
    const error = json(run.stderr);
    expect(error).toMatchObject({
      code: "FILES_NOT_SAVED",
      instance: "urn:fal:request:fake-request",
    });
    expect(error.details).toMatchObject({
      failed: [{ remoteUrl: "https://cdn.fake/broken.png" }],
    });
  });

  it("still reports the run when no file saves", async () => {
    const dir = project();
    const run = await motif(
      dir,
      ["a cat", "-o", "cat.png", "--format", "json"],
      { images: [{ url: "https://cdn.fake/broken.png" }] }
    );

    expect(run.code).toBe(5);
    expect(objects(json(run.stdout).failed)).toHaveLength(1);
    expect(json(run.stderr)).toMatchObject({ code: "FILES_NOT_SAVED" });
  });
});
