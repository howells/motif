import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CREATIVE_TAXONOMY, EDIT_CAPABLE_MODELS } from "@howells/motif-sdk";
import type { CreativeField } from "@howells/motif-sdk";
import { afterEach, describe, expect, it } from "vitest";

import { spawnEnv } from "./cli-env";

/** Upper-case the first letter, as the SDK sentence join does. */
function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The prompt sentence the SDK appends for one creative option id. */
function clause(field: CreativeField, id: string): string {
  const option = CREATIVE_TAXONOMY[field].find(
    (candidate) => candidate.id === id
  );
  if (!option) {
    throw new Error(`no ${field} option ${id}`);
  }
  return option.clause;
}

interface CliResult {
  code: number;
  stderr: string;
  stdout: string;
}

const tempHomes: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "motif-cli-test-"));
  tempHomes.push(dir);
  return dir;
}

/** A 1x1 PNG; edit paths only need to exist and carry an image extension. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function runMotif(
  args: string[],
  stdin = "",
  home = tempHome(),
  env: Record<string, string> = {}
): Promise<CliResult> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts", ...args],
    {
      cwd: process.cwd(),
      env: spawnEnv({
        CI: "1",
        FAL_KEY: "",
        HOME: home,
        ...env,
      }),
      stdio: ["pipe", "pipe", "pipe"],
    }
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf-8");
  child.stderr.setEncoding("utf-8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  child.stdin.end(stdin);

  return await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stderr, stdout });
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonLine(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text.trim());
  if (!isRecord(value)) {
    throw new Error("expected a JSON object");
  }
  return value;
}

/** Narrow a nested JSON value to a keyed object for assertions. */
function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("expected a JSON object");
  }
  return value;
}

/** Narrow a nested JSON value to an array for assertions. */
function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError("expected a JSON array");
  }
  return value;
}

afterEach(() => {
  while (tempHomes.length > 0) {
    const dir = tempHomes.pop();
    if (dir !== undefined && dir !== "") {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe("CLI contract", () => {
  it("shows help when run with no arguments", async () => {
    const result = await runMotif([]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("motif studio");
    expect(result.stdout).toContain("Image generation prompt");
  });

  it("emits the full schema as structured JSON", async () => {
    const result = await runMotif(["--describe", "--format", "json"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const schema = parseJsonLine(result.stdout);
    expect(schema.name).toBe("motif");
    expect(schema).toHaveProperty("commands");
    expect(schema).toHaveProperty("models");
    expect(schema).toHaveProperty("leaderboards");
    expect(schema).toHaveProperty("tools");
    expect(schema).toHaveProperty("errors");
  });

  it("advertises the edit-capable model enum for the vary command", async () => {
    const result = await runMotif(["--describe", "--format", "json"]);

    expect(result.code).toBe(0);

    const schema = parseJsonLine(result.stdout);
    const commands = asRecord(schema.commands);
    const varyModel = asRecord(
      asRecord(asRecord(asRecord(commands.vary).input).properties).model
    );

    expect(varyModel.enum).toStrictEqual([...EDIT_CAPABLE_MODELS]);
  });

  it("advertises series commands in the primary schema", async () => {
    const result = await runMotif(["--describe", "--format", "json"]);

    expect(result.code).toBe(0);

    const schema = parseJsonLine(result.stdout);
    const commands = asRecord(schema.commands);
    const describeCommand = asRecord(
      asRecord(asRecord(asRecord(commands.describe).input).properties).command
    );
    const series = asRecord(commands.series);

    expect(describeCommand.enum).toContain("series");
    expect(series).toMatchObject({
      command: "series",
      supports_dry_run: true,
    });
    expect(series.subcommands).toContain("run");
  });

  it("describes creative direction options as generate enums", async () => {
    const result = await runMotif([
      "--describe",
      "generate",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const generate = parseJsonLine(result.stdout);
    const properties = asRecord(asRecord(generate.input).properties);
    expect(properties.look).toMatchObject({
      enum: CREATIVE_TAXONOMY.look.map((option) => option.id),
      type: "string",
    });
    expect(
      asRecord(asRecord(properties.look).enumDescriptions).ephemera
    ).toMatchObject({
      clause: clause("look", "ephemera"),
      defaultAspect: "2:3",
      defaultModel: "ideogram4",
      experimental: false,
      label: "Period ephemera",
    });
    expect(
      asRecord(asRecord(properties.look).enumDescriptions).drawing
    ).toMatchObject({ experimental: true });
    expect(properties.mood).toMatchObject({
      enum: ["window", "dawn", "raking", "overcast", "lamplit", "nocturne"],
      type: ["string", "null"],
    });
    expect(
      asRecord(asRecord(properties.mood).enumDescriptions).overcast
    ).not.toHaveProperty("defaultModel");
    for (const removed of ["recipe", "shot", "lighting", "genre", "camera"]) {
      expect(properties).not.toHaveProperty(removed);
    }
  });

  it("dry-runs a themed series run without FAL_KEY", async () => {
    const result = await runMotif([
      "series",
      "run",
      "brutalist architecture",
      "--count",
      "6",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "banana",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJsonLine(result.stdout);
    expect(payload).toMatchObject({
      command: "series-run",
      count: 6,
      dryRun: true,
      model: "banana",
      theme: "brutalist architecture",
      valid: true,
    });
    expect(payload).toHaveProperty("estimatedCost");
    expect(payload.scenes).toHaveLength(6);
    expect(result.stdout).not.toContain("[FILTERED]");
  });

  it("applies creative direction to series run dry-run scene prompts", async () => {
    const result = await runMotif([
      "series",
      "run",
      "luxury watch campaign",
      "--count",
      "2",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "banana",
      "--style",
      "quiet brand language",
      "--look",
      "still-life",
      "--mood",
      "raking",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const enrichment = `${clause("look", "still-life")}. ${cap(clause("mood", "raking"))}.`;
    const payload = parseJsonLine(result.stdout);
    expect(payload).toMatchObject({
      command: "series-run",
      creative: {
        clauses: [clause("look", "still-life"), clause("mood", "raking")],
        selected: {
          look: "still-life",
          mood: "raking",
        },
      },
      // Series never applies look defaults: the explicit model stands.
      model: "banana",
    });
    const firstScene = asRecord(asArray(payload.scenes)[0]);
    expect(firstScene).toMatchObject({
      baseScenePrompt:
        "Image 1 of 2 in a cohesive visual series about luxury watch campaign; wide establishing composition; shared visual language, palette, lighting, lens, composition rhythm, and post-processing across the full set; no text, no watermark",
      enrichedScenePrompt: `Image 1 of 2 in a cohesive visual series about luxury watch campaign; wide establishing composition; shared visual language, palette, lighting, lens, composition rhythm, and post-processing across the full set; no text, no watermark. ${enrichment}`,
    });
    expect(String(firstScene.prompt)).toContain(enrichment);
  });

  it("applies creative direction to series gen dry-run prompts", async () => {
    const home = tempHome();
    const created = await runMotif(
      [
        "series",
        "create",
        "Studio Campaign",
        "--style",
        "editorial product language",
        "--model",
        "banana",
        "--format",
        "json",
      ],
      "",
      home
    );
    expect(created.code).toBe(0);
    const series = parseJsonLine(created.stdout);

    const result = await runMotif(
      [
        "series",
        "gen",
        String(series.slug),
        "hero watch on steel table",
        "--dry-run",
        "--format",
        "json",
        "--look",
        "lived-in",
        "--mood",
        "window",
      ],
      "",
      home
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJsonLine(result.stdout);
    expect(payload).toMatchObject({
      command: "series-generate",
      creative: {
        clauses: [clause("look", "lived-in"), clause("mood", "window")],
        selected: {
          look: "lived-in",
          mood: "window",
        },
      },
      // Series keeps its own model rather than the look's flux2-pro default.
      model: "banana",
      scenePrompt: "hero watch on steel table",
    });
    expect(payload.prompt).toBe(
      `editorial product language. Hero watch on steel table. ${clause("look", "lived-in")}. ${cap(clause("mood", "window"))}.`
    );
  });

  it("pins a look and mood on a series and applies them to series gen", async () => {
    const home = tempHome();
    const created = await runMotif(
      [
        "series",
        "create",
        "Kitchen Stories",
        "--style",
        "warm family kitchens",
        "--look",
        "lived-in",
        "--mood",
        "overcast",
        "--format",
        "json",
      ],
      "",
      home
    );
    expect(created.code).toBe(0);
    const series = parseJsonLine(created.stdout);
    // No -m or -a, so the look's flux2-pro and 3:2 become the series defaults.
    expect(series).toMatchObject({
      command: "series-create",
      defaultAspect: "3:2",
      look: "lived-in",
      model: "flux2-pro",
      mood: "overcast",
    });
    const slug = String(series.slug);

    const shown = await runMotif(
      ["series", "show", slug, "--format", "json"],
      "",
      home
    );
    expect(parseJsonLine(shown.stdout)).toMatchObject({
      look: "lived-in",
      mood: "overcast",
    });
    const listed = await runMotif(
      ["series", "list", "--format", "json"],
      "",
      home
    );
    expect(asArray(parseJsonLine(listed.stdout).series)[0]).toMatchObject({
      look: "lived-in",
      mood: "overcast",
    });

    const pinned = await runMotif(
      [
        "series",
        "gen",
        slug,
        "a green kitchen",
        "--dry-run",
        "--format",
        "json",
      ],
      "",
      home
    );
    expect(pinned.code).toBe(0);
    expect(pinned.stderr).toBe("");
    const payload = parseJsonLine(pinned.stdout);
    expect(payload).toMatchObject({
      aspect: "3:2",
      command: "series-generate",
      creative: { selected: { look: "lived-in", mood: "overcast" } },
      model: "flux2-pro",
      stylePrompt: "warm family kitchens",
    });
    expect(payload.prompt).toBe(
      `warm family kitchens. A green kitchen. ${clause("look", "lived-in")}. ${cap(clause("mood", "overcast"))}.`
    );

    const overridden = await runMotif(
      [
        "series",
        "gen",
        slug,
        "a green kitchen",
        "--mood",
        "lamplit",
        "--dry-run",
        "--format",
        "json",
      ],
      "",
      home
    );
    expect(overridden.code).toBe(0);
    expect(parseJsonLine(overridden.stdout)).toMatchObject({
      creative: { selected: { look: "lived-in", mood: "lamplit" } },
    });

    const flatNoMood = await runMotif(
      [
        "series",
        "gen",
        slug,
        "an oak plank",
        "--look",
        "plate",
        "--no-mood",
        "--dry-run",
        "--format",
        "json",
      ],
      "",
      home
    );
    expect(flatNoMood.code).toBe(0);
    expect(parseJsonLine(flatNoMood.stdout)).toMatchObject({
      creative: { selected: { look: "plate" } },
    });

    const stdinNoMood = await runMotif(
      ["series", "--format", "json"],
      JSON.stringify({
        command: "series-generate",
        creative: { look: "plate", mood: null },
        dryRun: true,
        prompt: "an oak plank",
        series: slug,
      }),
      home
    );
    expect(stdinNoMood.code).toBe(0);
    expect(parseJsonLine(stdinNoMood.stdout)).toMatchObject({
      creative: { selected: { look: "plate" } },
    });

    const run = await runMotif(
      [
        "series",
        "run",
        "family kitchens",
        "--series",
        slug,
        "--count",
        "1",
        "--dry-run",
        "--format",
        "json",
      ],
      "",
      home
    );
    expect(run.code).toBe(0);
    expect(parseJsonLine(run.stdout)).toMatchObject({
      creative: { selected: { look: "lived-in", mood: "overcast" } },
      model: "flux2-pro",
    });
  });

  it("keeps explicit model and aspect when a series pins a look", async () => {
    const result = await runMotif([
      "series",
      "create",
      "Fight Night",
      "--look",
      "ephemera",
      "-m",
      "banana",
      "-a",
      "1:1",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(parseJsonLine(result.stdout)).toMatchObject({
      defaultAspect: "1:1",
      look: "ephemera",
      model: "banana",
      mood: null,
    });
  });

  it("refuses to create a series that pins a mood on a flat look", async () => {
    const result = await runMotif([
      "series",
      "create",
      "Veneers",
      "--look",
      "plate",
      "--mood",
      "lamplit",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(2);
    expect(parseJsonLine(result.stderr)).toMatchObject({
      code: "INVALID_OPTION",
      details: { field: "mood", value: "lamplit" },
    });
  });

  it("accepts themed series runs through stdin JSON", async () => {
    const result = await runMotif(
      ["series", "--format", "json"],
      JSON.stringify({
        command: "series-run",
        count: 3,
        dryRun: true,
        theme: "modular exhibition booths",
      })
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJsonLine(result.stdout);
    expect(payload).toMatchObject({
      command: "series-run",
      count: 3,
      dryRun: true,
      theme: "modular exhibition booths",
      valid: true,
    });
    expect(payload.scenes).toHaveLength(3);
  });

  it("describes local error metadata without a web dependency", async () => {
    const result = await runMotif(["--describe", "errors", "--format", "json"]);

    expect(result.code).toBe(0);
    const schema = parseJsonLine(result.stdout);
    const errors = asRecord(schema.errors);

    expect(errors.UNKNOWN_MODEL).toMatchObject({
      docUri: "motif://describe/errors#unknown-model",
      status: 400,
      type: "urn:motif:error:unknown-model",
    });
    expect(errors.SERIES_NOT_FOUND).toMatchObject({
      status: 404,
      type: "urn:motif:error:series-not-found",
    });
  });

  it("allows dry-run generation without FAL_KEY", async () => {
    const result = await runMotif([
      "a cat on a windowsill",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "banana",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      command: "generate",
      dryRun: true,
      model: "banana",
      prompt: "a cat on a windowsill",
      valid: true,
    });
    expect(dryRun).toHaveProperty("estimatedCost");
  });

  it("emits creative metadata and a sentence-joined prompt during dry-run generation", async () => {
    const result = await runMotif([
      "a green kitchen",
      "--dry-run",
      "--format",
      "json",
      "--look",
      "lived-in",
      "--mood",
      "overcast",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const expectedPrompt = `A green kitchen. ${clause("look", "lived-in")}. ${cap(clause("mood", "overcast"))}.`;
    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      aspect: "3:2",
      basePrompt: "a green kitchen",
      command: "generate",
      creative: {
        clauses: [clause("look", "lived-in"), clause("mood", "overcast")],
        selected: {
          look: "lived-in",
          mood: "overcast",
        },
      },
      dryRun: true,
      model: "flux2-pro",
      prompt: expectedPrompt,
      valid: true,
    });
    expect(asRecord(dryRun.body).prompt).toBe(expectedPrompt);
  });

  it("applies the look's default model and aspect when none is given", async () => {
    const result = await runMotif([
      "a boxing match card",
      "--look",
      "ephemera",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseJsonLine(result.stdout)).toMatchObject({
      aspect: "2:3",
      model: "ideogram4",
    });
  });

  it("lets explicit model and aspect flags beat the look's defaults", async () => {
    const result = await runMotif([
      "a lamp",
      "--look",
      "object",
      "-m",
      "gpt2",
      "-a",
      "16:9",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(parseJsonLine(result.stdout)).toMatchObject({
      aspect: "16:9",
      model: "gpt2",
      prompt: `A lamp. ${clause("look", "object")}.`,
    });
  });

  it("lets a preset flag beat the look's default aspect", async () => {
    const result = await runMotif([
      "a lamp",
      "--look",
      "ephemera",
      "--og",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(parseJsonLine(result.stdout)).toMatchObject({
      aspect: "16:9",
      model: "ideogram4",
    });
  });

  it("accepts creative direction through stdin JSON dry-run payloads", async () => {
    const result = await runMotif(
      ["--format", "json"],
      JSON.stringify({
        command: "generate",
        creative: {
          look: "portrait",
          mood: "dawn",
        },
        dryRun: true,
        prompt: "an abstract study",
      })
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      aspect: "1:1",
      basePrompt: "an abstract study",
      creative: {
        selected: {
          look: "portrait",
          mood: "dawn",
        },
      },
      model: "seedream45",
      prompt: `An abstract study. ${clause("look", "portrait")}. ${cap(clause("mood", "dawn"))}.`,
    });
  });

  it("lets stdin model and aspect beat the look's defaults", async () => {
    const result = await runMotif(
      ["--format", "json"],
      JSON.stringify({
        aspect: "1:1",
        command: "generate",
        creative: { look: "ephemera" },
        dryRun: true,
        model: "banana",
        prompt: "a boxing match card",
      })
    );

    expect(result.code).toBe(0);
    expect(parseJsonLine(result.stdout)).toMatchObject({
      aspect: "1:1",
      model: "banana",
    });
  });

  it("lets creative CLI flags override matching stdin JSON fields", async () => {
    const result = await runMotif(
      ["--format", "json", "--mood", "lamplit"],
      JSON.stringify({
        command: "generate",
        creative: {
          look: "editorial",
          mood: "missing",
        },
        dryRun: true,
        model: "banana",
        prompt: "a reading corner",
      })
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      creative: {
        selected: {
          look: "editorial",
          mood: "lamplit",
        },
      },
    });
  });

  it("emits field-specific details for an unknown look id", async () => {
    const result = await runMotif([
      "studio portrait",
      "--dry-run",
      "--format",
      "json",
      "--look",
      "cinematic",
    ]);

    expect(result.code).toBe(2);
    const error = parseJsonLine(result.stderr);
    expect(error).toMatchObject({
      code: "INVALID_OPTION",
      details: {
        availableIds: CREATIVE_TAXONOMY.look.map((option) => option.id),
        field: "look",
        value: "cinematic",
      },
      error: true,
    });
  });

  it("refuses a mood on a flat look with a structured error", async () => {
    const result = await runMotif([
      "oak veneer",
      "--look",
      "plate",
      "--mood",
      "lamplit",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(2);
    const error = parseJsonLine(result.stderr);
    expect(error).toMatchObject({
      code: "INVALID_OPTION",
      details: {
        availableIds: CREATIVE_TAXONOMY.look
          .filter((look) => look.acceptsMood)
          .map((look) => look.id),
        field: "mood",
        value: "lamplit",
      },
      error: true,
    });
    expect(String(error.message)).toContain("plate");
  });

  it("accepts a mood on a look that takes one", async () => {
    const result = await runMotif([
      "a reading chair",
      "--look",
      "editorial",
      "--mood",
      "lamplit",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(parseJsonLine(result.stdout)).toMatchObject({
      creative: { selected: { look: "editorial", mood: "lamplit" } },
      model: "flux2-pro",
    });
  });

  it("drops a stdin mood with --no-mood", async () => {
    const result = await runMotif(
      ["--format", "json", "--no-mood"],
      JSON.stringify({
        command: "generate",
        creative: { look: "plate", mood: "dawn" },
        dryRun: true,
        prompt: "an oak plank",
      })
    );

    expect(result.code).toBe(0);
    expect(parseJsonLine(result.stdout)).toMatchObject({
      creative: { selected: { look: "plate" } },
    });
  });

  it("emits prompt warnings from the base prompt only during dry-run", async () => {
    const warned = await runMotif([
      "a shop poster on a wall, no text, no chairs",
      "--look",
      "lived-in",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(warned.code).toBe(0);
    const warnings = asArray(parseJsonLine(warned.stdout).warnings).map(
      (warning) => [asRecord(warning).rule, asRecord(warning).match]
    );
    expect(warnings).toStrictEqual([
      ["negated-object", "no chairs"],
      ["text-bearing-object", "poster"],
    ]);

    // The look text says "no logos, no people"; that never raises a warning.
    const clean = await runMotif([
      "a green kitchen",
      "--look",
      "lived-in",
      "--dry-run",
      "--format",
      "json",
    ]);
    expect(parseJsonLine(clean.stdout).warnings).toStrictEqual([]);
  });

  it("rejects the removed creative flags", async () => {
    const result = await runMotif([
      "studio portrait",
      "--dry-run",
      "--format",
      "json",
      "--lighting",
      "rim",
    ]);

    expect(result.code).toBe(2);
  });

  it("refuses a bare positional prompt that matches a command word", async () => {
    const result = await runMotif(["history", "--format", "json"]);

    expect(result.code).toBe(2);
    const error = parseJsonLine(result.stderr);
    expect(error).toMatchObject({
      code: "RESERVED_PROMPT",
      details: { didYouMean: "motif --history", prompt: "history" },
      error: true,
    });
  });

  it("takes one --edit path per flag, repeated, with the prompt after", async () => {
    const dir = tempHome();
    const first = join(dir, "first.png");
    const second = join(dir, "second.png");
    writeFileSync(first, PNG_BYTES);
    writeFileSync(second, PNG_BYTES);

    const result = await runMotif([
      "-e",
      first,
      "-e",
      second,
      "a cat on a windowsill",
      "--model",
      "banana",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun.prompt).toBe("a cat on a windowsill");
    expect(dryRun.editImages).toStrictEqual([first, second]);
  });

  it("still reports a missing --edit path as INVALID_EDIT_PATH", async () => {
    const result = await runMotif([
      "a cat on a windowsill",
      "--edit",
      "definitely-missing.png",
      "--dry-run",
      "--format",
      "json",
    ]);

    const error = parseJsonLine(result.stderr);
    expect(error).toMatchObject({ code: "INVALID_EDIT_PATH", error: true });
  });

  it("names the models that support a refused option", async () => {
    const result = await runMotif([
      "a lighthouse",
      "-m",
      "seedream45",
      "-r",
      "4K",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(2);
    const error = parseJsonLine(result.stderr);
    expect(error.code).toBe("INVALID_OPTION");
    expect(String(error.message)).toMatch(
      /^Seedream 4\.5 does not support resolution\. Models that do: /
    );
    const details = asRecord(error.details);
    expect(details.option).toBe("resolution");
    expect(details.model).toBe("Seedream 4.5");
    expect(asArray(details.modelsSupporting)).toContain("banana");
    expect(asArray(details.supportedOptions).length).toBeGreaterThan(0);
  });

  it("routes gpt2 transparency through OpenAI in the dry run", async () => {
    const result = await runMotif([
      "a sticker of a fox",
      "-m",
      "gpt2",
      "--transparent",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      endpoint: "openai:gpt-image-2",
      estimatedCost: null,
      provider: "openai",
      providerModel: "gpt-image-2",
      requiredEnv: "OPENAI_API_KEY",
      route: "openai",
    });
    expect(asRecord(dryRun.body)).toMatchObject({
      background: "transparent",
      n: 1,
      outputFormat: "png",
    });
  });

  it("keeps plain gpt2 on the fal route", async () => {
    const result = await runMotif([
      "a fox",
      "-m",
      "gpt2",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(parseJsonLine(result.stdout)).toMatchObject({
      endpoint: "openai/gpt-image-2",
      route: "fal",
    });
  });

  it("names OPENAI_API_KEY when the gpt2 transparency route has no key", async () => {
    const result = await runMotif(
      ["a sticker of a fox", "-m", "gpt2", "--transparent", "--format", "json"],
      "",
      tempHome(),
      { OPENAI_API_KEY: "" }
    );

    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    const error = parseJsonLine(result.stderr);
    expect(error).toMatchObject({
      code: "MISSING_API_KEY",
      details: { envVar: "OPENAI_API_KEY", route: "openai" },
    });
    expect(String(error.message)).toContain("OPENAI_API_KEY");
  });

  it("allows reserved-word prompts via the stdin JSON escape hatch", async () => {
    const result = await runMotif(
      ["--dry-run", "--format", "json", "--model", "banana"],
      JSON.stringify({ prompt: "history" })
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      command: "generate",
      dryRun: true,
      prompt: "history",
    });
  });

  it("marks ephemeral dry-run generations as local-only after download", async () => {
    const result = await runMotif([
      "a cat on a windowsill",
      "--dry-run",
      "--ephemeral",
      "--format",
      "json",
      "--model",
      "banana",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      command: "generate",
      dryRun: true,
      ephemeral: true,
      historyRecorded: false,
      model: "banana",
      storeIo: false,
      valid: true,
    });
  });

  it("normalizes current fal generation fields in dry-run output", async () => {
    const result = await runMotif([
      "studio portrait",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "gpt",
      "--aspect",
      "16:9",
      "--background",
      "transparent",
      "--quality",
      "medium",
      "--sync-mode",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      command: "generate",
      dryRun: true,
      endpoint: "fal-ai/gpt-image-1.5",
      model: "gpt",
      valid: true,
    });
    expect(dryRun.body).toMatchObject({
      background: "transparent",
      image_size: "1536x1024",
      quality: "medium",
      sync_mode: true,
    });
  });

  it("normalizes Banana 2 current API fields in dry-run output", async () => {
    const result = await runMotif([
      "current launch poster",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "banana2",
      "--aspect",
      "auto",
      "--resolution",
      "0.5K",
      "--google-search",
      "--limit-generations",
      "--thinking",
      "minimal",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      command: "generate",
      dryRun: true,
      endpoint: "fal-ai/nano-banana-2",
      model: "banana2",
      valid: true,
    });
    expect(dryRun.body).toMatchObject({
      aspect_ratio: "auto",
      enable_google_search: true,
      limit_generations: true,
      resolution: "0.5K",
      thinking_level: "minimal",
    });
  });

  it("rejects model-incompatible options during dry-run", async () => {
    const result = await runMotif([
      "simple product render",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "flux-fast",
      "--quality",
      "high",
    ]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");

    const error = parseJsonLine(result.stderr);
    expect(error).toMatchObject({
      code: "INVALID_OPTION",
      status: 400,
    });
    expect(String(error.message)).toContain(
      "FLUX Schnell does not support quality"
    );
  });

  it("allows stdin JSON dry-run without FAL_KEY", async () => {
    const result = await runMotif(
      ["--format", "json"],
      JSON.stringify({
        command: "generate",
        dryRun: true,
        model: "banana",
        prompt: "stdin cat",
      })
    );

    expect(result.code).toBe(0);
    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      command: "generate",
      dryRun: true,
      model: "banana",
      prompt: "stdin cat",
      valid: true,
    });
  });

  it("emits structured errors with stable metadata", async () => {
    const result = await runMotif([
      "test prompt",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "missing-model",
    ]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");

    const error = parseJsonLine(result.stderr);
    expect(error).toMatchObject({
      code: "UNKNOWN_MODEL",
      doc_uri: "motif://describe/errors#unknown-model",
      error: true,
      is_retriable: false,
      status: 400,
      type: "urn:motif:error:unknown-model",
    });
  });

  it("lists fal utility tools as structured JSON", async () => {
    const result = await runMotif(["tool", "list", "--format", "json"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJsonLine(result.stdout);
    const tools = asRecord(payload.tools);
    expect(tools["sam3-image"]).toMatchObject({
      endpoint: "fal-ai/sam-3/image",
      inputKind: "image",
    });
    expect(tools["depth-anything"]).toMatchObject({
      endpoint: "fal-ai/image-preprocessors/depth-anything/v2",
      inputKind: "image",
    });
  });

  it("describes a specific fal utility tool", async () => {
    const result = await runMotif([
      "tool",
      "describe",
      "sam3-image",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    const payload = parseJsonLine(result.stdout);
    expect(payload).toMatchObject({
      command: "tool.describe",
      endpoint: "fal-ai/sam-3/image",
      id: "sam3-image",
      pricing: "$0.005/request",
    });
  });

  it("dry-runs fal utility tools without FAL_KEY", async () => {
    const result = await runMotif([
      "tool",
      "sam3-image",
      "https://example.com/input.png",
      "--prompt",
      "person",
      "--max-masks",
      "4",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJsonLine(result.stdout);
    expect(payload).toMatchObject({
      command: "tool.run",
      dryRun: true,
      endpoint: "fal-ai/sam-3/image",
      tool: "sam3-image",
      valid: true,
    });
    expect(payload.body).toMatchObject({
      image_url: "https://example.com/input.png",
      max_masks: 4,
      prompt: "person",
    });
  });

  it("accepts fal utility tools through stdin JSON", async () => {
    const result = await runMotif(
      ["--format", "json"],
      JSON.stringify({
        command: "tool",
        dryRun: true,
        input: "https://example.com/input.png",
        options: { max_masks: 2 },
        prompt: "person",
        tool: "sam3-image",
      })
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJsonLine(result.stdout);
    expect(payload).toMatchObject({
      command: "tool.run",
      dryRun: true,
      endpoint: "fal-ai/sam-3/image",
      tool: "sam3-image",
      valid: true,
    });
    expect(payload.body).toMatchObject({
      image_url: "https://example.com/input.png",
      max_masks: 2,
      prompt: "person",
    });
  });

  it("rejects invalid fal utility numeric options before calling fal", async () => {
    const result = await runMotif([
      "tool",
      "marigold-depth",
      "https://example.com/input.png",
      "--ensemble-size",
      "1",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");

    const error = parseJsonLine(result.stderr);
    expect(error).toMatchObject({
      code: "INVALID_OPTION",
      status: 400,
    });
    expect(String(error.message)).toContain("ensemble size must be >= 2");
  });
});
