import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CREATIVE_TAXONOMY, FAL_TOOL_IDS, MODELS } from "@howells/motif-sdk";
import type { CreativeField } from "@howells/motif-sdk";
import { afterEach, describe, expect, it } from "vitest";

import { historyPrompt } from "../src/commands/task-run";
import { TASK_VERBS } from "../src/commands/verbs/task-verbs";
import { withoutEndpoints } from "../src/utils/task-model";
import { runMotifIn } from "./cli-env";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const tempHomes: string[] = [];

/** A fresh HOME holding `in.png`, a 1x1 source image. */
function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "motif-verbs-test-"));
  tempHomes.push(dir);
  writeFileSync(join(dir, "in.png"), PNG_1X1);
  return dir;
}

afterEach(() => {
  while (tempHomes.length > 0) {
    const dir = tempHomes.pop();
    if (dir !== undefined) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("expected a JSON object");
  }
  return { ...value };
}

/**
 * The prompt sentence the SDK appends for one creative option id, less its
 * first letter, which the sentence join capitalises.
 */
function clause(field: CreativeField, id: string): string {
  const option = CREATIVE_TAXONOMY[field].find((entry) => entry.id === id);
  if (option === undefined) {
    throw new Error(`no ${field} option ${id}`);
  }
  return option.clause.slice(1);
}

function parseJson(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text.trim());
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`expected a JSON object: ${text}`);
  }
  return { ...value };
}

const SOURCE = "{source}";

/** A last generation at `in.png`, as history records it. */
function seedHistory(home: string): void {
  mkdirSync(join(home, ".motif"), { recursive: true });
  writeFileSync(
    join(home, ".motif", "history.json"),
    JSON.stringify({
      generations: [
        {
          aspect: "1:1",
          cost: 0.04,
          id: "gen-one",
          model: "flux-fast",
          output: join(home, "in.png"),
          prompt: "a cat",
          resolution: "1K",
          timestamp: "2026-07-01T00:00:00.000Z",
        },
      ],
      lastSessionDate: "2026-07-01",
      totalCost: { allTime: 0.04, session: 0, today: 0 },
    })
  );
}

/** One dry run per verb, plain, and one per verb that has modes. */
const DRY_RUNS: { args: string[]; mode?: string }[] = [
  { args: ["generate", "a cat"] },
  { args: ["vary", SOURCE] },
  { args: ["animate", "slow pan", SOURCE] },
  { args: ["ask", "what is it?", SOURCE] },
  { args: ["ask", "--caption", SOURCE], mode: "caption" },
  { args: ["cutout", SOURCE] },
  { args: ["erase", "the car", SOURCE] },
  { args: ["erase", "--text", SOURCE], mode: "text" },
  { args: ["layers", SOURCE] },
  { args: ["layers", "--text", SOURCE], mode: "text" },
  { args: ["map", SOURCE] },
  { args: ["map", "--normals", SOURCE], mode: "normals" },
  { args: ["material", SOURCE] },
  { args: ["material", "--extract", "the rug", SOURCE], mode: "extract" },
  { args: ["mesh", SOURCE] },
  { args: ["mesh", "--objects", SOURCE], mode: "objects" },
  { args: ["reframe", "--og", SOURCE] },
  { args: ["reframe", "--margin", "64", SOURCE], mode: "margin" },
  { args: ["relight", "warm dusk light", SOURCE] },
  { args: ["relight", "--even", SOURCE], mode: "even" },
  { args: ["restore", SOURCE] },
  { args: ["restore", "--noise", SOURCE], mode: "noise" },
  { args: ["restore", "--dark", SOURCE], mode: "dark" },
  { args: ["segment", "the chair", SOURCE] },
  { args: ["segment", "--auto", SOURCE], mode: "auto" },
  { args: ["tile", "oak planks", SOURCE] },
  { args: ["tile", "--upscale", SOURCE], mode: "upscale" },
  { args: ["upscale", SOURCE] },
  { args: ["upscale", "--creative", SOURCE], mode: "creative" },
  { args: ["vectorize", SOURCE] },
];

function withSource(args: string[], home: string): string[] {
  return args.map((arg) => (arg === SOURCE ? join(home, "in.png") : arg));
}

describe("Task verbs: dry runs", () => {
  it("covers every verb, and one mode of every verb that has modes", () => {
    const covered = new Set(DRY_RUNS.map((run) => run.args[0]));
    for (const definition of TASK_VERBS) {
      expect(covered, definition.command).toContain(definition.command);
      if (definition.modes.length > 0) {
        expect(
          DRY_RUNS.some(
            (run) =>
              run.args[0] === definition.command && run.mode !== undefined
          ),
          definition.command
        ).toBeTruthy();
      }
    }
  });

  it.each(DRY_RUNS)("prices $args", async ({ args, mode }) => {
    const home = tempHome();
    const result = await runMotifIn(home, [
      ...withSource(args, home),
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    const payload = parseJson(result.stdout);
    expect(payload).toMatchObject({ dryRun: true, task: args[0] });
    expect(payload.model).toBeTypeOf("string");
    expect(payload.tier).toBeTypeOf("string");
    expect(payload).toHaveProperty("cost");
    expect(payload.request).toBeTypeOf("object");
    if (mode !== undefined) {
      expect(payload.mode).toBe(mode);
    }
  });

  it("refuses two modes at once", async () => {
    const home = tempHome();
    const result = await runMotifIn(home, [
      "restore",
      "--noise",
      "--tone",
      join(home, "in.png"),
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(2);
    expect(parseJson(result.stderr).code).toBe("INVALID_OPTION");
  });

  it("refuses --param without -m", async () => {
    const home = tempHome();
    const result = await runMotifIn(home, [
      "upscale",
      join(home, "in.png"),
      "--param",
      "upscale_factor=4",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(2);
    expect(parseJson(result.stderr).code).toBe("INVALID_OPTION");
  });

  it("sends --param with -m in the request", async () => {
    const home = tempHome();
    const result = await runMotifIn(home, [
      "upscale",
      join(home, "in.png"),
      "-m",
      "clarity",
      "--param",
      "creativity=0.5",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.stderr).toBe("");
    const payload = parseJson(result.stdout);
    expect(payload).toMatchObject({ chosenBy: "model", model: "clarity" });
    expect(payload.request).toMatchObject({ creativity: 0.5 });
  });
});

describe("Task verbs: sources and output names", () => {
  it("runs plain tile from its prompt, never the last generation", async () => {
    const home = tempHome();
    seedHistory(home);
    const result = await runMotifIn(home, [
      "tile",
      "brick wall",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.stderr).toBe("");
    const payload = parseJson(result.stdout);
    expect(payload.source).toBeNull();
    expect(payload.request).toMatchObject({ prompt: "brick wall" });
    expect(payload.request).not.toHaveProperty("image_url");
  });

  it("reads a lone existing image argument to tile as the source", async () => {
    const home = tempHome();
    const result = await runMotifIn(home, [
      "tile",
      join(home, "in.png"),
      "--dry-run",
      "--format",
      "json",
    ]);

    // Whether the Model also needs a prompt is the SDK's call; the path
    // must never arrive as the prompt.
    const text = result.stdout === "" ? result.stderr : result.stdout;
    const payload = parseJson(text);
    if (result.code === 0) {
      expect(payload.source).toBe(join(home, "in.png"));
    }
    expect(JSON.stringify(payload.request ?? {})).not.toContain("in.png");
  });

  it.each([
    [["layers", "--text", SOURCE], "in-layers-text.png"],
    [["erase", "--text", SOURCE], "in-erase-text.png"],
    [["animate", "slow pan", SOURCE], "in-animate.mp4"],
    [["mesh", SOURCE], "in-mesh.glb"],
    [["animate", "slow pan", SOURCE, "-o", "clip.png"], "clip.mp4"],
  ])("names the dry-run output of %j", async (args, name) => {
    const home = tempHome();
    const result = await runMotifIn(home, [
      ...withSource(args, home),
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.stderr).toBe("");
    expect(
      String(parseJson(result.stdout).output).endsWith(`/${name}`)
    ).toBeTruthy();
  });

  it("reports no output for a Task that writes no file", async () => {
    const home = tempHome();
    const result = await runMotifIn(home, [
      "ask",
      "what is it?",
      join(home, "in.png"),
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(parseJson(result.stdout).output).toBeNull();
  });

  it("takes --tier on series run", async () => {
    const home = tempHome();
    const result = await runMotifIn(home, [
      "series",
      "run",
      "brick houses",
      "--count",
      "2",
      "--tier",
      "quality",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.stderr).toBe("");
    expect(parseJson(result.stdout).tier).toBe("quality");
  });
});

describe("relight", () => {
  it("lights to a mood, with the image first and no prompt", async () => {
    const home = tempHome();
    const result = await runMotifIn(home, [
      "relight",
      join(home, "in.png"),
      "--mood",
      "dawn",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.stderr).toBe("");
    const payload = parseJson(result.stdout);
    expect(payload).toMatchObject({
      source: join(home, "in.png"),
      task: "relight",
    });
    expect(String(asRecord(payload.request).prompt)).toContain(
      clause("mood", "dawn")
    );
  });

  it("takes a described light after the image, with a mood alongside", async () => {
    const home = tempHome();
    const result = await runMotifIn(home, [
      "relight",
      join(home, "in.png"),
      "low sun from the left",
      "--mood",
      "dawn",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.stderr).toBe("");
    const prompt = String(asRecord(parseJson(result.stdout).request).prompt);
    expect(prompt).toContain("ow sun from the left");
    expect(prompt).toContain(clause("mood", "dawn"));
  });

  it("refuses an unknown mood and a missing light", async () => {
    const home = tempHome();
    const unknown = await runMotifIn(home, [
      "relight",
      join(home, "in.png"),
      "--mood",
      "noon",
      "--dry-run",
      "--format",
      "json",
    ]);
    expect(unknown.code).toBe(2);
    expect(parseJson(unknown.stderr).code).toBe("INVALID_OPTION");

    const bare = await runMotifIn(home, [
      "relight",
      join(home, "in.png"),
      "--dry-run",
      "--format",
      "json",
    ]);
    expect(bare.code).toBe(2);
    expect(String(parseJson(bare.stderr).message)).toContain("--mood");
  });
});

describe("history prompts", () => {
  it("tags a Task run once, replacing an earlier Task's tag (MOT-48 #3)", () => {
    expect(historyPrompt("layers", "[layers]")).toBe("[layers]");
    expect(historyPrompt("layers", "[layers] a poster")).toBe(
      "[layers] a poster"
    );
    expect(historyPrompt("upscale", "[cutout] a cat")).toBe("[upscale] a cat");
    expect(historyPrompt("erase", "")).toBe("[erase]");
  });
});

describe("TASK_FAILED messages", () => {
  it("names the Task instead of a fal endpoint", () => {
    expect(
      withoutEndpoints(
        "Cannot access application fal-ai/flux-2-pro",
        "generate"
      )
    ).toBe("Cannot access application generate");
    expect(withoutEndpoints("Rate limited", "upscale")).toBe("Rate limited");
  });
});

describe("removed surface", () => {
  it.each([
    [["a cat", "--rmbg"], "--rmbg", "motif cutout"],
    [["a cat", "--up"], "--up", "motif upscale"],
    [["--vary"], "--vary", "motif vary"],
    [["a cat", "--video"], "--video", "motif animate"],
    [["a cat", "--video-duration", "5"], "--video-duration", "motif animate"],
    [["--up", "--scale", "4"], "--up", "motif upscale"],
    [["enhance", "in.png"], "motif enhance", undefined],
    [["tool", "list"], "motif tool", undefined],
    [["a cat", "--style", "vivid"], "--style", "--param style=<value> with -m"],
    [["a cat", "--thinking", "high"], "--thinking", "--tier"],
  ])("refuses %j", async (args, removed, use) => {
    const home = tempHome();
    const result = await runMotifIn(home, [...args, "--format", "json"]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    const error = parseJson(result.stderr);
    expect(error.code).toBe("REMOVED_COMMAND");
    expect(error.details).toMatchObject({ removed });
    if (use !== undefined) {
      expect(error.details).toMatchObject({ use });
    }
  });

  it.each([
    "rmbg",
    "vary",
    "upscale",
    "video",
    "tool",
    "tool-run",
    "tool-list",
    "tool-describe",
  ])("refuses the stdin command %s", async (command) => {
    const home = tempHome();
    const child = await import("node:child_process");
    const { spawnEnv } = await import("./cli-env");
    const result = await new Promise<{ code: number; stderr: string }>(
      (resolve, reject) => {
        const proc = child.spawn(
          process.execPath,
          ["--import", "tsx", "src/index.ts", "--format", "json"],
          {
            cwd: process.cwd(),
            env: spawnEnv({ CI: "1", FAL_KEY: "", HOME: home }),
          }
        );
        let stderr = "";
        proc.stderr.setEncoding("utf-8");
        proc.stderr.on("data", (chunk: string) => {
          stderr += chunk;
        });
        proc.on("error", reject);
        proc.on("close", (code) => {
          resolve({ code: code ?? 0, stderr });
        });
        proc.stdin.end(JSON.stringify({ command, dryRun: true }));
      }
    );

    expect(result.code).toBe(2);
    expect(parseJson(result.stderr)).toMatchObject({
      code: "REMOVED_COMMAND",
    });
  });
});

/**
 * Ids that are also a verb, mode flag or task word, so they legitimately
 * appear in human output without naming a Model.
 */
const NAME_EXCLUSIONS = new Set(["lineart", "rmbg", "scribble"]);

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

const MODEL_WORDS = [
  ...Object.keys(MODELS),
  ...FAL_TOOL_IDS,
  ...Object.values(MODELS).map((model) => model.name),
].filter((word) => !NAME_EXCLUSIONS.has(word));

const MODEL_PATTERN = new RegExp(
  `(?<![\\w-])(${[...new Set(MODEL_WORDS)].map(escapeRegExp).join("|")})(?![\\w-])`
);

function expectNoModelNames(text: string, label: string): void {
  const match = MODEL_PATTERN.exec(text);
  expect(
    match?.[0],
    `${label}: ${match?.input.slice(Math.max(0, match.index - 40), match.index + 40)}`
  ).toBeUndefined();
}

describe("no model names in human output", () => {
  it("keeps them out of --help", async () => {
    const result = await runMotifIn(tempHome(), ["--help"]);
    expect(result.code).toBe(0);
    expectNoModelNames(result.stdout, "--help");
  });

  it.each([...TASK_VERBS.map((definition) => definition.command), "vary"])(
    "keeps them out of %s --help",
    async (command) => {
      const result = await runMotifIn(tempHome(), [command, "--help"]);
      expect(result.code).toBe(0);
      expectNoModelNames(result.stdout, `${command} --help`);
    }
  );

  it.each([
    ["a cat", "-m", "flux2-pro"],
    ["erase", "the car", SOURCE],
    ["upscale", SOURCE],
    ["segment", "the chair", SOURCE],
    ["relight", SOURCE, "--mood", "dawn"],
  ])("keeps them out of the human dry run of %j", async (...args) => {
    const home = tempHome();
    const result = await runMotifIn(home, [
      ...withSource(args, home),
      "--dry-run",
      "--format",
      "human",
    ]);
    expect(result.code).toBe(0);
    expectNoModelNames(result.stdout, args.join(" "));
  });
});

describe("history field masks", () => {
  it("masks each generation, not the envelope", async () => {
    const home = tempHome();
    seedHistory(home);

    const result = await runMotifIn(home, [
      "--history",
      "--fields",
      "id,prompt",
      "--format",
      "json",
    ]);

    expect(result.stderr).toBe("");
    const payload = parseJson(result.stdout);
    expect(payload.generations).toStrictEqual([
      { id: "gen-one", prompt: "a cat" },
    ]);
  });
});
