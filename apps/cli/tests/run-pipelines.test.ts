import { existsSync, readFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLI_ROOT,
  history,
  INLINE_PNG,
  json,
  motif,
  objects,
  PNG_1X1,
  project,
  REMOTE_PNG,
} from "./pipeline-helpers";

/**
 * The CLI's run paths, end to end, against a fake fal (tests/fixtures/fake-fal):
 * generate and vary, the Task verbs, and `series gen` / `series run` each plan,
 * run, write the files, record history and print.
 */

const SAVED_LINE = /✓ Saved: (\S+) \(1x1, 70B\)/;

describe("generate", () => {
  it("saves, records and reports each image, naming -n results -1, -2", async () => {
    const dir = project();
    const run = await motif(
      dir,
      ["a cat", "-o", "cat.png", "-n", "2", "--format", "json"],
      { images: [REMOTE_PNG, REMOTE_PNG] }
    );

    expect(run.code).toBe(0);
    const payload = json(run.stdout);
    expect(payload).toMatchObject({ command: "generate", numImages: 2 });
    const images = objects(payload.images);
    expect(images.map((image) => image.path)).toStrictEqual([
      join(dir, "cat-1.png"),
      join(dir, "cat-2.png"),
    ]);
    expect(images[0]).toMatchObject({
      height: 1,
      remoteUrl: REMOTE_PNG.url,
      size: "70B",
      width: 1,
    });
    expect(existsSync(join(dir, "cat-2.png"))).toBe(true);

    const recorded = history(dir);
    expect(recorded).toHaveLength(2);
    expect(recorded[0]).toMatchObject({
      aspect: "1:1",
      output: join(dir, "cat-1.png"),
      resolution: "2K",
    });
    expect(recorded[0]).not.toHaveProperty("editedFrom");
  });

  it("names every file that came back, even when more came back than were asked for", async () => {
    const dir = project();
    const run = await motif(
      dir,
      ["a cat", "-o", "cat.png", "--format", "json"],
      { images: [REMOTE_PNG, REMOTE_PNG, REMOTE_PNG] }
    );

    expect(run.code).toBe(0);
    const images = objects(json(run.stdout).images);
    expect(images.map((image) => image.path)).toStrictEqual([
      join(dir, "cat-1.png"),
      join(dir, "cat-2.png"),
      join(dir, "cat-3.png"),
    ]);
    expect(history(dir).map((entry) => entry.output)).toStrictEqual([
      join(dir, "cat-1.png"),
      join(dir, "cat-2.png"),
      join(dir, "cat-3.png"),
    ]);
  });

  it("refuses --param num_images, which -n owns, before anything is sent", async () => {
    const dir = project();
    const log = join(dir, "fal.log");
    const run = await motif(
      dir,
      [
        "a vase",
        "-m",
        "gpt",
        "--param",
        "num_images=4",
        "-o",
        "batch.png",
        "--format",
        "json",
      ],
      { images: [REMOTE_PNG] },
      { FAKE_FAL_LOG: log }
    );

    expect(run.code).toBe(2);
    const error = json(run.stderr);
    expect(error).toMatchObject({ code: "INVALID_OPTION" });
    expect(String(error.message)).toContain("-n");
    expect(existsSync(log)).toBe(false);
  });

  it("prints a saved line and the session total in human output", async () => {
    const dir = project();
    const run = await motif(dir, ["a cat", "--format", "human"], {
      images: [REMOTE_PNG],
    });

    expect(run.code).toBe(0);
    const [, saved] = SAVED_LINE.exec(run.stdout) ?? [];
    expect(basename(saved ?? "")).toMatch(/^motif-\d{14}\.png$/);
    expect(run.stdout).toMatch(/Session: .* \| Today: /);
  });

  it("writes inline data outputs as the PNG they carry", async () => {
    const dir = project();
    const run = await motif(
      dir,
      ["a cat", "-o", "cat.png", "--format", "json"],
      { images: [INLINE_PNG] }
    );

    expect(run.code).toBe(0);
    expect(readFileSync(join(dir, "cat.png"))).toStrictEqual(PNG_1X1);
  });

  it("records the first reference as editedFrom, with look and mood", async () => {
    const dir = project();
    const run = await motif(
      dir,
      [
        "a cat",
        "-e",
        "in.png",
        "--look",
        "editorial",
        "--mood",
        "dawn",
        "-o",
        "edit.png",

        "--format",
        "json",
      ],
      { images: [REMOTE_PNG] }
    );

    expect(run.code).toBe(0);
    expect(history(dir)[0]).toMatchObject({
      editedFrom: join(dir, "in.png"),
      look: "editorial",
      mood: "dawn",
    });
  });
});

describe("a submission that fal does not confirm", () => {
  it("is posted once, reports SUBMISSION_UNCERTAIN and says it may be billed", async () => {
    const dir = project();
    const log = join(dir, "fal.log");
    const run = await motif(
      dir,
      ["a cat", "-o", "cat.png", "--format", "json"],
      { images: [REMOTE_PNG] },
      { FAKE_FAL_LOG: log, FAKE_FAL_POST_STATUS: "502" }
    );

    expect(run.code).toBe(5);
    const error = json(run.stderr);
    expect(error).toMatchObject({
      code: "SUBMISSION_UNCERTAIN",
      is_retriable: false,
    });
    expect(String(error.message)).toContain("may bill");
    const posts = readFileSync(log, "utf-8")
      .split("\n")
      .filter((line) => line.includes('"method":"POST"'));
    expect(posts).toHaveLength(1);
    expect(existsSync(join(dir, "cat.png"))).toBe(false);
  });
});

describe("vary", () => {
  it("saves to -o and records the source with its default aspect and resolution", async () => {
    const dir = project();
    const run = await motif(
      dir,
      ["vary", "in.png", "-o", "v.png", "--format", "json"],
      { images: [REMOTE_PNG] }
    );

    expect(run.code).toBe(0);
    expect(json(run.stdout)).toMatchObject({
      command: "vary",
      source: "in.png",
    });
    expect(history(dir)[0]).toMatchObject({
      aspect: "1:1",
      editedFrom: join(dir, "in.png"),
      output: join(dir, "v.png"),
      resolution: "1K",
    });
  });

  it("fails with NO_PREVIOUS when there is no history and no image", async () => {
    const dir = project();
    const run = await motif(dir, ["vary", "--format", "json"], {});

    expect(run.code).toBe(4);
    expect(json(run.stderr)).toMatchObject({ code: "NO_PREVIOUS" });
  });
});

describe("Task verbs", () => {
  it("writes beside the source, records one history entry and reports the file", async () => {
    const dir = project();
    const run = await motif(dir, ["cutout", "in.png", "--format", "json"], {
      image: REMOTE_PNG,
    });

    expect(run.code).toBe(0);
    const payload = json(run.stdout);
    expect(payload).toMatchObject({
      command: "cutout",
      height: 1,
      path: join(dir, "in-cutout.png"),
      size: "70B",
      source: "in.png",
      width: 1,
    });
    expect(payload.files).toHaveLength(1);
    expect(history(dir)).toMatchObject([
      {
        aspect: "1:1",
        editedFrom: join(dir, "in.png"),
        output: join(dir, "in-cutout.png"),
        prompt: "[cutout]",
        resolution: "1K",
      },
    ]);
  });

  it("prints the saved line in human output", async () => {
    const dir = project();
    const run = await motif(dir, ["cutout", "in.png", "--format", "human"], {
      image: REMOTE_PNG,
    });

    expect(run.code).toBe(0);
    expect(SAVED_LINE.exec(run.stdout)?.[1]).toBe(join(dir, "in-cutout.png"));
  });

  it("takes the last generation as the source and inherits its aspect", async () => {
    const dir = project();
    await motif(
      dir,
      ["a cat", "-a", "16:9", "-o", "cat.png", "--format", "json"],
      { images: [REMOTE_PNG] }
    );
    const run = await motif(dir, ["cutout", "--format", "json"], {
      image: REMOTE_PNG,
    });

    expect(run.code).toBe(0);
    expect(json(run.stdout)).toMatchObject({ source: join(dir, "cat.png") });
    expect(history(dir).at(-1)).toMatchObject({
      aspect: "16:9",
      prompt: "[cutout] a cat",
    });
  });

  it("fails with NO_PREVIOUS when there is no source and no history", async () => {
    const dir = project();
    const run = await motif(dir, ["cutout", "--format", "json"], {
      image: REMOTE_PNG,
    });

    expect(run.code).toBe(4);
    expect(json(run.stderr)).toMatchObject({ code: "NO_PREVIOUS" });
  });

  it("writes an output that arrives as inline data", async () => {
    const dir = project();
    const run = await motif(dir, ["cutout", "in.png", "--format", "json"], {
      image: INLINE_PNG,
    });

    expect(run.code).toBe(0);
    expect(readFileSync(join(dir, "in-cutout.png"))).toStrictEqual(PNG_1X1);
  });
});

describe("series gen", () => {
  it("saves into the series, records history and the series output", async () => {
    const dir = project();
    await motif(dir, ["series", "create", "Wax", "--format", "json"], {});
    const run = await motif(
      dir,
      ["series", "gen", "wax", "a candle", "--format", "json"],
      { images: [REMOTE_PNG] }
    );

    expect(run.code).toBe(0);
    const payload = json(run.stdout);
    expect(payload).toMatchObject({
      aspect: "1:1",
      command: "series-generate",
      outputIndex: 1,
      resolution: "2K",
      series: "wax",
    });
    const [image] = objects(payload.images);
    expect(image).toMatchObject({ height: 1, size: "70B", width: 1 });
    expect(String(image?.path)).toMatch(/001-a-candle\.png$/);
    expect(history(dir)).toHaveLength(1);
    const stored = json(
      readFileSync(join(dir, ".motif/series/wax/series.json"), "utf-8")
    );
    expect(stored.outputs).toHaveLength(1);
  });

  it("prints a saved line, and no JSON, in human output", async () => {
    const dir = project();
    await motif(dir, ["series", "create", "Wax", "--format", "json"], {});
    const run = await motif(
      dir,
      ["series", "gen", "wax", "a candle", "--format", "human"],
      { images: [REMOTE_PNG] }
    );

    expect(run.code).toBe(0);
    expect(SAVED_LINE.exec(run.stdout)?.[1]).toMatch(/001-a-candle\.png$/);
    expect(run.stdout).not.toContain("Session:");
  });

  it("sends an explicit --resolution 2K", async () => {
    const dir = project();
    await motif(dir, ["series", "create", "Wax", "--format", "json"], {});
    const sent = await requestsFor(dir, [
      "series",
      "gen",
      "wax",
      "a candle",
      "-r",
      "2K",
    ]);

    expect(sent.some((body) => "resolution" in body)).toBe(true);
  });
});

describe("series run", () => {
  it("saves one file per scene and reports them", async () => {
    const dir = project();
    const run = await motif(
      dir,
      ["series", "run", "Towers", "-c", "2", "--format", "json"],
      { images: [REMOTE_PNG] }
    );

    expect(run.code).toBe(0);
    const payload = json(run.stdout);
    expect(payload).toMatchObject({
      aspect: "1:1",
      command: "series-run",
      count: 2,
      resolution: "2K",
      series: "towers",
    });
    const images = objects(payload.images);
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({ height: 1, size: "70B", width: 1 });
    expect(history(dir)).toHaveLength(2);
  });

  it("sends an explicit --resolution 2K", async () => {
    const dir = project();
    const sent = await requestsFor(dir, [
      "series",
      "run",
      "Towers",
      "-c",
      "1",
      "-r",
      "2K",
    ]);

    expect(sent.some((body) => "resolution" in body)).toBe(true);
  });
});

/** The JSON bodies posted to fal by one run. */
async function requestsFor(dir: string, args: string[]) {
  const log = join(dir, "fal.log");
  const child = await motifWithLog(dir, args, log);
  expect(child.code).toBe(0);
  return readFileSync(log, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => json(line))
    .filter((entry) => entry.method === "POST")
    .map((entry) => json(String(entry.body)));
}

async function motifWithLog(dir: string, args: string[], log: string) {
  process.env.FAKE_FAL_LOG = log;
  try {
    return await motif(dir, [...args, "--format", "json"], {
      images: [REMOTE_PNG],
    });
  } finally {
    delete process.env.FAKE_FAL_LOG;
  }
}

/** What the stand-in viewer (tests/no-viewer/open) was asked to open. */
const OPENED_LOG = join(CLI_ROOT, "tests/no-viewer/opened.log");

function opened(): string[] {
  return existsSync(OPENED_LOG)
    ? readFileSync(OPENED_LOG, "utf-8").split("\n").filter(Boolean)
    : [];
}

const OPENING_RUNS: [string, string[], Record<string, unknown>][] = [
  ["generate", ["a cat", "-o", "cat.png"], { images: [REMOTE_PNG] }],
  ["vary", ["vary", "in.png", "-o", "v.png"], { images: [REMOTE_PNG] }],
  ["a Task verb", ["cutout", "in.png", "-o", "c.png"], { image: REMOTE_PNG }],
  [
    "series run",
    ["series", "run", "Towers", "-c", "2"],
    { images: [REMOTE_PNG] },
  ],
];

describe("opening results", () => {
  it.each(OPENING_RUNS)(
    "%s opens nothing without --open and the first file with it",
    async (_name, args, result) => {
      const dir = project();
      rmSync(OPENED_LOG, { force: true });
      const quiet = await motif(dir, [...args, "--format", "json"], result);
      expect(quiet.code).toBe(0);
      expect(opened()).toStrictEqual([]);

      const loud = await motif(
        dir,
        [...args, "--open", "--format", "json"],
        result
      );
      expect(loud.code).toBe(0);
      expect(opened()).toHaveLength(1);
      expect(opened()[0]).toContain(dir);
    }
  );

  it("series gen opens only with --open", async () => {
    const dir = project();
    await motif(dir, ["series", "create", "Wax", "--format", "json"], {});
    const args = ["series", "gen", "wax", "a candle", "--format", "json"];
    rmSync(OPENED_LOG, { force: true });

    await motif(dir, args, { images: [REMOTE_PNG] });
    expect(opened()).toStrictEqual([]);
    await motif(dir, [...args, "--open"], { images: [REMOTE_PNG] });
    expect(opened()).toHaveLength(1);
  });

  it("sheet opens only with --open", async () => {
    const dir = project();
    const args = ["sheet", "in.png", "-o", "s.png", "--format", "json"];
    rmSync(OPENED_LOG, { force: true });

    await motif(dir, args, {});
    expect(opened()).toStrictEqual([]);
    await motif(dir, [...args, "--open"], {});
    expect(opened()).toHaveLength(1);
  });

  it("refuses --no-open as an unknown option", async () => {
    const dir = project();
    const run = await motif(
      dir,
      ["a cat", "--no-open", "--dry-run", "--format", "json"],
      {}
    );

    expect(run.code).toBe(2);
    expect(json(run.stderr)).toMatchObject({ code: "INVALID_OPTION" });
    expect(run.stderr).toContain("--no-open");
  });
});
