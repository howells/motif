import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { spawnEnv } from "./cli-env";

/**
 * The CLI's run paths, end to end, against a fake fal (tests/fixtures/fake-fal):
 * generate and vary, the Task verbs, and `series gen` / `series run` each plan,
 * run, write the files, record history and print. Nothing here reaches the
 * network; the project is a temp directory that is also HOME.
 */

const CLI_ROOT = join(import.meta.dirname, "..");
const TSX = pathToFileURL(
  join(CLI_ROOT, "node_modules/tsx/dist/esm/index.mjs")
);
const FAKE_FAL = pathToFileURL(join(CLI_ROOT, "tests/fixtures/fake-fal.ts"));
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const REMOTE_PNG = { url: "https://cdn.fake/out.png" };
const INLINE_PNG = {
  url: `data:image/png;base64,${PNG_1X1.toString("base64")}`,
};

const projects: string[] = [];

/** A fresh project directory holding `in.png`; it is also HOME. */
function project(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "motif-pipelines-")));
  projects.push(dir);
  writeFileSync(join(dir, "in.png"), PNG_1X1);
  return dir;
}

afterEach(() => {
  for (const dir of projects.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

interface Run {
  code: number;
  stderr: string;
  stdout: string;
}

async function motif(
  dir: string,
  args: string[],
  result: Record<string, unknown>
): Promise<Run> {
  const child = spawn(
    process.execPath,
    [
      "--import",
      TSX.href,
      "--import",
      FAKE_FAL.href,
      join(CLI_ROOT, "src/index.ts"),
      ...args,
    ],
    {
      cwd: dir,
      env: spawnEnv({
        CI: "1",
        FAKE_FAL_RESULT: JSON.stringify(result),
        FAL_KEY: "test-key",
        HOME: dir,
        USERPROFILE: dir,
      }),
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
  child.stdin.end();
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf-8");
  child.stderr.setEncoding("utf-8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const code = await new Promise<number>((resolve) => {
    child.on("close", (exitCode) => {
      resolve(exitCode ?? -1);
    });
  });
  return { code, stderr, stdout };
}

function json(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text.trim());
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`expected a JSON object, got ${text}`);
  }
  return Object.fromEntries(Object.entries(value));
}

function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new TypeError("expected an array");
  }
  return value.map((entry) => json(JSON.stringify(entry)));
}

function history(dir: string): Record<string, unknown>[] {
  const file = json(readFileSync(join(dir, ".motif/history.json"), "utf-8"));
  return objects(file.generations);
}

const SAVED_LINE = /✓ Saved: (\S+) \(1x1, 70B\)/;

describe("generate", () => {
  it("saves, records and reports each image, naming -n results -1, -2", async () => {
    const dir = project();
    const run = await motif(
      dir,
      ["a cat", "-o", "cat.png", "-n", "2", "--no-open", "--format", "json"],
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

  it("prints a saved line and the session total in human output", async () => {
    const dir = project();
    const run = await motif(dir, ["a cat", "--no-open", "--format", "human"], {
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
      ["a cat", "-o", "cat.png", "--no-open", "--format", "json"],
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
        "--no-open",
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

describe("vary", () => {
  it("saves to -o and records the source with its default aspect and resolution", async () => {
    const dir = project();
    const run = await motif(
      dir,
      ["vary", "in.png", "-o", "v.png", "--no-open", "--format", "json"],
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
    const run = await motif(dir, ["vary", "--no-open", "--format", "json"], {});

    expect(run.code).toBe(4);
    expect(json(run.stderr)).toMatchObject({ code: "NO_PREVIOUS" });
  });
});

describe("Task verbs", () => {
  it("writes beside the source, records one history entry and reports the file", async () => {
    const dir = project();
    const run = await motif(
      dir,
      ["cutout", "in.png", "--no-open", "--format", "json"],
      { image: REMOTE_PNG }
    );

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
    const run = await motif(
      dir,
      ["cutout", "in.png", "--no-open", "--format", "human"],
      { image: REMOTE_PNG }
    );

    expect(run.code).toBe(0);
    expect(SAVED_LINE.exec(run.stdout)?.[1]).toBe(join(dir, "in-cutout.png"));
  });

  it("takes the last generation as the source and inherits its aspect", async () => {
    const dir = project();
    await motif(
      dir,
      ["a cat", "-a", "16:9", "-o", "cat.png", "--no-open", "--format", "json"],
      { images: [REMOTE_PNG] }
    );
    const run = await motif(dir, ["cutout", "--no-open", "--format", "json"], {
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
    const run = await motif(dir, ["cutout", "--no-open", "--format", "json"], {
      image: REMOTE_PNG,
    });

    expect(run.code).toBe(4);
    expect(json(run.stderr)).toMatchObject({ code: "NO_PREVIOUS" });
  });

  it("writes an output that arrives as inline data", async () => {
    const dir = project();
    const run = await motif(
      dir,
      ["cutout", "in.png", "--no-open", "--format", "json"],
      { image: INLINE_PNG }
    );

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
      ["series", "gen", "wax", "a candle", "--no-open", "--format", "json"],
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
      ["series", "gen", "wax", "a candle", "--no-open", "--format", "human"],
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
      ["series", "run", "Towers", "-c", "2", "--no-open", "--format", "json"],
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
    return await motif(dir, [...args, "--no-open", "--format", "json"], {
      images: [REMOTE_PNG],
    });
  } finally {
    delete process.env.FAKE_FAL_LOG;
  }
}
