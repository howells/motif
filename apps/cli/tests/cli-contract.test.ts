import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CREATIVE_TAXONOMY, TASKS } from "@howells/motif-sdk";
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
  });

  it("emits the full schema as structured JSON", async () => {
    const result = await runMotif(["--describe", "--format", "json"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const schema = parseJsonLine(result.stdout);
    expect(schema.name).toBe("motif");
    expect(schema).toHaveProperty("commands");
    expect(schema).toHaveProperty("errors");
  });

  it("gives every described command whenToUse, notFor and tasks", async () => {
    const result = await runMotif(["--describe", "--format", "json"]);
    const commands = asRecord(parseJsonLine(result.stdout).commands);

    for (const [name, value] of Object.entries(commands)) {
      const command = asRecord(value);
      expect(command.whenToUse, name).toBeTypeOf("string");
      expect(command.notFor, name).toBeTypeOf("string");
      expect(asArray(command.tasks).length, name).toBeGreaterThan(0);
    }
    expect(asRecord(commands.ask).mutating).toBe(false);
    expect(asRecord(commands.erase).mutating).toBe(true);
    expect(
      asRecord(asRecord(asRecord(commands.series).subcommandTasks).run)
        .whenToUse
    ).toBeTypeOf("string");
  });

  it("describes the task table alone with --describe tasks", async () => {
    const result = await runMotif(["--describe", "tasks", "--format", "json"]);

    expect(result.code).toBe(0);
    const table = parseJsonLine(result.stdout);
    const commands = asRecord(table.commands);
    for (const name of ["generate", "vary", "erase", "series run"]) {
      expect(commands, name).toHaveProperty([name]);
    }
    expect(asRecord(table.tasks).outpaint).toBe("reframe");
  });

  it("prints the task table in human format rather than nothing", async () => {
    const result = await runMotif(["--describe", "tasks", "--format", "human"]);

    expect(result.code).toBe(0);
    const table = asRecord(JSON.parse(result.stdout));
    expect(asRecord(table.tasks).outpaint).toBe("reframe");
  });

  it("exposes task-specific model rankings without changing the model ID arrays", async () => {
    for (const args of [
      ["--describe", "tasks", "--format", "json"],
      ["--describe", "generate", "--format", "json"],
    ]) {
      const result = await runMotif(args);
      expect(result.code).toBe(0);
      const schema = parseJsonLine(result.stdout);
      const generate = args.includes("tasks")
        ? asRecord(asRecord(schema.commands).generate)
        : schema;
      expect(generate.models).toStrictEqual([
        ...new Set(TASKS.generate.models.map(({ model }) => model)),
      ]);
      const ranking = asArray(generate.ranking).map(asRecord);
      expect(ranking.length).toBeGreaterThan(0);
      for (const entry of ranking) {
        expect(entry.model).toBeTypeOf("string");
        expect(entry).toHaveProperty("benchmark");
      }
    }
  });

  it("advertises the edit-capable model enum for the vary command", async () => {
    const result = await runMotif(["--describe", "--format", "json"]);

    expect(result.code).toBe(0);

    const schema = parseJsonLine(result.stdout);
    const commands = asRecord(schema.commands);
    const varyModel = asRecord(
      asRecord(asRecord(asRecord(commands.vary).input).properties).model
    );

    expect(varyModel.enum).toStrictEqual([
      ...new Set(TASKS.vary.models.map((entry) => entry.model)),
    ]);
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
      asRecord(asRecord(properties.look).enumDescriptions).architectural
    ).toMatchObject({ clause: clause("look", "architectural") });
    expect(properties.mood).toMatchObject({
      enum: CREATIVE_TAXONOMY.mood.map((option) => option.id),
      type: ["string", "null"],
    });
    expect(
      asRecord(asRecord(properties.mood).enumDescriptions).overcast
    ).not.toHaveProperty("defaultModel");
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
    expect(firstScene.enrichedScenePrompt).toBe(
      `${String(firstScene.baseScenePrompt)}. ${enrichment}`
    );
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
        "interior",
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
        clauses: [clause("look", "interior"), clause("mood", "window")],
        selected: {
          look: "interior",
          mood: "window",
        },
      },
      // A Series has no model of its own, so the look's flux2-pro runs.
      model: "flux2-pro",
      scenePrompt: "hero watch on steel table",
    });
    expect(payload.prompt).toBe(
      `Editorial product language. Hero watch on steel table. ${clause("look", "interior")}. ${cap(clause("mood", "window"))}.`
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
        "interior",
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
    // No -a, so the look's 3:2 becomes the series default.
    expect(series).toMatchObject({
      command: "series-create",
      defaultAspect: "3:2",
      look: "interior",
      mood: "overcast",
    });
    expect(series).not.toHaveProperty("model");
    const slug = String(series.slug);

    const shown = await runMotif(
      ["series", "show", slug, "--format", "json"],
      "",
      home
    );
    expect(parseJsonLine(shown.stdout)).toMatchObject({
      look: "interior",
      mood: "overcast",
    });
    const listed = await runMotif(
      ["series", "list", "--format", "json"],
      "",
      home
    );
    expect(asArray(parseJsonLine(listed.stdout).series)[0]).toMatchObject({
      look: "interior",
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
      creative: { selected: { look: "interior", mood: "overcast" } },
      model: "flux2-pro",
      stylePrompt: "warm family kitchens",
    });
    expect(payload.prompt).toBe(
      `Warm family kitchens. A green kitchen. ${clause("look", "interior")}. ${cap(clause("mood", "overcast"))}.`
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
      creative: { selected: { look: "interior", mood: "lamplit" } },
    });

    const flatNoMood = await runMotif(
      [
        "series",
        "gen",
        slug,
        "an oak plank",
        "--look",
        "surface",
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
      creative: { selected: { look: "surface" } },
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
      creative: { selected: { look: "interior", mood: "overcast" } },
      model: "flux2-pro",
    });
  });

  it("keeps an explicit aspect when a series pins a look", async () => {
    const result = await runMotif([
      "series",
      "create",
      "Site Visits",
      "--look",
      "architectural",
      "-a",
      "1:1",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(parseJsonLine(result.stdout)).toMatchObject({
      defaultAspect: "1:1",
      look: "architectural",
      mood: null,
    });
  });

  it("refuses to create a series that pins a mood on a flat look", async () => {
    const result = await runMotif([
      "series",
      "create",
      "Veneers",
      "--look",
      "surface",
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

  it("does not read a series command from stdin", async () => {
    const result = await runMotif(
      ["series", "list", "--format", "json"],
      JSON.stringify({ command: "series-run", dryRun: true, theme: "towers" })
    );

    expect(result.code).toBe(0);
    expect(parseJsonLine(result.stdout)).toMatchObject({
      command: "series-list",
    });
  });

  it("plans a themed series run from arguments", async () => {
    const result = await runMotif([
      "series",
      "run",
      "modular exhibition booths",
      "--count",
      "3",
      "--dry-run",
      "--format",
      "json",
    ]);

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
    expect(dryRun).toHaveProperty("cost");
  });

  it("emits creative metadata and a sentence-joined prompt during dry-run generation", async () => {
    const result = await runMotif([
      "a green kitchen",
      "--dry-run",
      "--format",
      "json",
      "--look",
      "interior",
      "--mood",
      "overcast",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const expectedPrompt = `A green kitchen. ${clause("look", "interior")}. ${cap(clause("mood", "overcast"))}.`;
    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      aspect: "3:2",
      basePrompt: "a green kitchen",
      command: "generate",
      creative: {
        clauses: [clause("look", "interior"), clause("mood", "overcast")],
        selected: {
          look: "interior",
          mood: "overcast",
        },
      },
      dryRun: true,
      model: "flux2-pro",
      prompt: expectedPrompt,
      valid: true,
    });
    expect(asRecord(dryRun.request).prompt).toBe(expectedPrompt);
  });

  it("applies the look's default model and aspect when none is given", async () => {
    const result = await runMotif([
      "a brick chapel on a hillside",
      "--look",
      "architectural",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseJsonLine(result.stdout)).toMatchObject({
      aspect: "4:5",
      model: "banana",
    });
  });

  it("lets explicit model and aspect flags beat the look's defaults", async () => {
    const result = await runMotif([
      "a lamp",
      "--look",
      "object",
      "-m",
      "flare",
      "-a",
      "16:9",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(parseJsonLine(result.stdout)).toMatchObject({
      aspect: "16:9",
      model: "flare",
      prompt: `A lamp. ${clause("look", "object")}.`,
    });
  });

  it("lets a preset flag beat the look's default aspect", async () => {
    const result = await runMotif([
      "a lamp",
      "--look",
      "architectural",
      "--og",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(parseJsonLine(result.stdout)).toMatchObject({
      aspect: "16:9",
      model: "banana",
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
      model: "seedream5",
      prompt: `An abstract study. ${clause("look", "portrait")}. ${cap(clause("mood", "dawn"))}.`,
    });
  });

  it("lets stdin model and aspect beat the look's defaults", async () => {
    const result = await runMotif(
      ["--format", "json"],
      JSON.stringify({
        aspect: "1:1",
        command: "generate",
        creative: { look: "abstract" },
        dryRun: true,
        model: "flare",
        prompt: "two confident gestures in oatmeal and charcoal",
      })
    );

    expect(result.code).toBe(0);
    expect(parseJsonLine(result.stdout)).toMatchObject({
      aspect: "1:1",
      model: "flare",
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
      "surface",
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
    expect(String(error.message)).toContain("surface");
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
        creative: { look: "surface", mood: "dawn" },
        dryRun: true,
        prompt: "an oak plank",
      })
    );

    expect(result.code).toBe(0);
    expect(parseJsonLine(result.stdout)).toMatchObject({
      creative: { selected: { look: "surface" } },
    });
  });

  it("emits prompt warnings from the base prompt only during dry-run", async () => {
    const warned = await runMotif([
      "a shop poster on a wall, no text, no chairs",
      "--look",
      "interior",
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
      "interior",
      "--dry-run",
      "--format",
      "json",
    ]);
    expect(parseJsonLine(clean.stdout).warnings).toStrictEqual([]);
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

  it("points a task word with arguments at the command it means", async () => {
    const remove = await runMotif([
      "remove",
      "the car",
      "x.png",
      "--format",
      "json",
    ]);
    expect(remove.code).toBe(2);
    expect(parseJsonLine(remove.stderr)).toMatchObject({
      code: "INVALID_OPTION",
      details: { didYouMean: 'motif erase "the car" x.png', task: "remove" },
      error: true,
    });

    const grid = await runMotif(["grid", "a.png", "b.png", "--format", "json"]);
    expect(grid.code).toBe(2);
    expect(parseJsonLine(grid.stderr)).toMatchObject({
      code: "INVALID_OPTION",
      details: { didYouMean: "motif sheet a.png b.png" },
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

  it("refuses a resolution the named model cannot do", async () => {
    const result = await runMotif([
      "a lighthouse",
      "-m",
      "seedream5",
      "-r",
      "4K",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(2);
    const error = parseJsonLine(result.stderr);
    expect(error.code).toBe("NO_MODEL_AVAILABLE");
    expect(error.details).toMatchObject({
      blockedBy: "resolution",
      task: "generate",
    });
  });

  it("keeps Sunburst transparency on fal in the dry run", async () => {
    const result = await runMotif([
      "a sticker of a fox",
      "-m",
      "sunburst",
      "--transparent",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({ model: "sunburst", provider: "fal" });
    expect(asRecord(dryRun.request)).toMatchObject({
      background: "transparent",
      quality: "max",
    });
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
      "3:2",
      "--param",
      "background=transparent",
      "--param",
      "quality=medium",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      command: "generate",
      dryRun: true,
      model: "gpt",
      valid: true,
    });
    expect(dryRun.request).toMatchObject({
      background: "transparent",
      image_size: "1536x1024",
      quality: "medium",
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
      "--param",
      "enable_google_search=true",
      "--param",
      "limit_generations=true",
      "--param",
      "thinking_level=minimal",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      command: "generate",
      dryRun: true,
      model: "banana2",
      valid: true,
    });
    expect(dryRun.request).toMatchObject({
      aspect_ratio: "auto",
      enable_google_search: true,
      limit_generations: true,
      resolution: "0.5K",
      thinking_level: "minimal",
    });
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

  it("plans a vary with --markup on a Model that takes markup", async () => {
    const home = tempHome();
    const source = join(home, "source.png");
    const markup = join(home, "markup.png");
    writeFileSync(source, PNG_BYTES);
    writeFileSync(markup, PNG_BYTES);
    const result = await runMotif(
      ["vary", source, "--markup", markup, "--dry-run", "--format", "json"],
      "",
      home
    );
    expect(result.code).toBe(0);
    const plan = parseJsonLine(result.stdout);
    expect(["sunburst", "flare"]).toContain(plan.model);
    expect(asRecord(plan.request).markup_image_url).toMatch(/^<data url/u);

    const refused = await runMotif(
      ["vary", source, "--markup", markup, "-m", "banana", "--dry-run"],
      "",
      home
    );
    expect(refused.code).toBe(2);
    expect(refused.stdout + refused.stderr).toContain("--markup");
  });

  it("asks for GIF output and names the file for it", async () => {
    const result = await runMotif([
      "a looping flame",
      "--output-format",
      "gif",
      "--param",
      "frame_count=12",
      "-m",
      "flare",
      "--dry-run",
      "--format",
      "json",
    ]);
    expect(result.code).toBe(0);
    const plan = parseJsonLine(result.stdout);
    expect(plan.output).toMatch(/\.gif$/u);
    expect(plan.request).toMatchObject({
      frame_count: 12,
      output_format: "gif",
    });
  });
});
