import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  mergeConfigLayers,
  migrateGlobalConfig,
  migrateLegacyConfig,
} from "../src/utils/config";
import { studioGenerateModel } from "../src/utils/task-model";
import { runMotifIn } from "./cli-env";

const tempHomes: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "motif-task-config-"));
  tempHomes.push(dir);
  return dir;
}

function motifDir(home: string): string {
  const dir = join(home, ".motif");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function parseJson(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("expected a JSON object");
  }
  return Object.fromEntries(Object.entries(parsed));
}

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function seedLastGeneration(home: string, model: string): void {
  writeFileSync(join(home, "one.png"), PNG_1X1);
  writeFileSync(
    join(motifDir(home), "history.json"),
    JSON.stringify({
      generations: [
        {
          aspect: "1:1",
          cost: 0.04,
          id: "gen-one",
          model,
          output: join(home, "one.png"),
          prompt: "a cat",
          resolution: "1K",
          timestamp: "2026-07-01T00:00:00.000Z",
        },
      ],
      lastSessionDate: new Date().toISOString().split("T")[0],
      totalCost: { allTime: 0, session: 0, today: 0 },
    })
  );
}

afterEach(() => {
  while (tempHomes.length > 0) {
    const dir = tempHomes.pop();
    if (dir !== undefined) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe(migrateLegacyConfig, () => {
  it("moves defaultModel to the generate pin", () => {
    expect(migrateLegacyConfig({ defaultModel: "flux2-pro" })).toStrictEqual({
      changed: true,
      config: { tasks: { generate: { model: "flux2-pro" } } },
    });
  });

  it("moves upscaler to the upscale pin unchanged", () => {
    expect(migrateLegacyConfig({ upscaler: "crystal" }).config).toStrictEqual({
      tasks: { upscale: { model: "crystal" } },
    });
  });

  it("maps backgroundRemover ids onto cutout Models", () => {
    expect(
      migrateLegacyConfig({ backgroundRemover: "bria" }).config
    ).toStrictEqual({ tasks: { cutout: { model: "bria-rmbg" } } });
    // rmbg was the shipped default, so it is dropped rather than mapped.
    expect(
      migrateLegacyConfig({ backgroundRemover: "rmbg" }).config
    ).toStrictEqual({});
  });

  it("drops a legacy value equal to the old shipped default", () => {
    const { changed, config } = migrateLegacyConfig({
      backgroundRemover: "rmbg",
      defaultAspect: "1:1",
      defaultModel: "banana",
      upscaler: "clarity",
    });
    expect(changed).toBe(true);
    expect(config).toStrictEqual({ defaultAspect: "1:1" });
  });

  it("keeps an existing tasks entry over a legacy key", () => {
    expect(
      migrateLegacyConfig({
        defaultModel: "flux2-pro",
        tasks: { generate: { model: "gpt2" } },
        upscaler: "crystal",
      }).config
    ).toStrictEqual({
      tasks: {
        generate: { model: "gpt2" },
        upscale: { model: "crystal" },
      },
    });
  });

  it("reports no change for a config with no legacy keys", () => {
    const raw = { defaultAspect: "3:2", tasks: { generate: { model: "gpt" } } };
    expect(migrateLegacyConfig(raw)).toStrictEqual({
      changed: false,
      config: raw,
    });
  });
});

describe("config layers", () => {
  it("keeps apiKey when the migrated file cannot be written back", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const config = await migrateGlobalConfig(
      { apiKey: "secret", defaultModel: "flux2-pro" },
      async () => {
        throw new Error("EROFS: read-only file system");
      },
      "/read-only/config.json"
    );
    expect(config).toStrictEqual({
      apiKey: "secret",
      tasks: { generate: { model: "flux2-pro" } },
    });
    vi.restoreAllMocks();
  });

  it("merges .motifrc task pins over global ones per Task", () => {
    const merged = mergeConfigLayers(
      {
        defaultAspect: "1:1",
        defaultResolution: "2K",
        openAfterGenerate: true,
        tasks: {
          cutout: { model: "bria-rmbg" },
          upscale: { model: "crystal" },
        },
      },
      { tasks: { generate: { model: "gpt2" } } }
    );
    expect(merged.tasks).toStrictEqual({
      cutout: { model: "bria-rmbg" },
      generate: { model: "gpt2" },
      upscale: { model: "crystal" },
    });
  });

  it("gives Studio a ranked Model when the generate pin is unusable", () => {
    const model = studioGenerateModel({
      defaultAspect: "1:1",
      defaultResolution: "2K",
      openAfterGenerate: true,
      tasks: { generate: { model: "imagen" } },
    });
    expect(model).not.toBe("imagen");
    expect(model).toMatch(/\S/);
  });
});

describe("legacy config on disk (spawned CLI)", () => {
  it("rewrites the global config once and runs with the migrated pin", async () => {
    const home = tempHome();
    const configPath = join(motifDir(home), "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        backgroundRemover: "bria",
        defaultModel: "flux2-pro",
        upscaler: "crystal",
      })
    );

    const result = await runMotifIn(home, [
      "--dry-run",
      "a cat",
      "--format",
      "json",
    ]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(parseJson(result.stdout)).toMatchObject({ model: "flux2-pro" });
    expect(parseJson(readFileSync(configPath, "utf-8"))).toStrictEqual({
      tasks: {
        cutout: { model: "bria-rmbg" },
        generate: { model: "flux2-pro" },
        upscale: { model: "crystal" },
      },
    });
  });
});

describe("Series without a model (spawned CLI)", () => {
  it("loads a series.json that still names a model", async () => {
    const home = tempHome();
    const dir = join(motifDir(home), "series", "old-series");
    mkdirSync(join(dir, "refs"), { recursive: true });
    mkdirSync(join(dir, "outputs"), { recursive: true });
    writeFileSync(
      join(dir, "series.json"),
      JSON.stringify({
        created: "2026-01-01T00:00:00.000Z",
        defaultAspect: "1:1",
        defaultResolution: "2K",
        id: "00000000-0000-4000-8000-000000000000",
        model: "banana",
        name: "Old Series",
        outputs: [],
        refs: [],
        slug: "old-series",
        stylePrompt: "",
        updated: "2026-01-01T00:00:00.000Z",
      })
    );

    const result = await runMotifIn(home, [
      "series",
      "show",
      "old-series",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    const shown = parseJson(result.stdout);
    expect(shown).toMatchObject({ slug: "old-series" });
    expect(shown).not.toHaveProperty("model");
  });

  it("refuses series create -m as an unknown option", async () => {
    const result = await runMotifIn(tempHome(), [
      "series",
      "create",
      "New Series",
      "-m",
      "banana",
      "--format",
      "json",
    ]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/unknown option/i);
  });
});

describe("missing key (spawned CLI)", () => {
  it("reports MISSING_API_KEY for series run with no key and no model", async () => {
    const result = await runMotifIn(tempHome(), [
      "series",
      "run",
      "x",
      "--count",
      "2",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(3);
    expect(parseJson(result.stderr)).toMatchObject({
      code: "MISSING_API_KEY",
    });
  });
});

describe("route keys (spawned CLI)", () => {
  function pinGpt2(home: string): void {
    writeFileSync(
      join(motifDir(home), "config.json"),
      JSON.stringify({ tasks: { generate: { model: "gpt2" } } })
    );
  }

  it("prices a pinned transparency route on a dry run with no OpenAI key", async () => {
    const home = tempHome();
    pinGpt2(home);
    const result = await runMotifIn(
      home,
      ["a fox sticker", "--transparent", "--dry-run", "--format", "json"],
      { OPENAI_API_KEY: "" }
    );
    expect(result.code).toBe(0);
    expect(parseJson(result.stdout)).toMatchObject({ model: "gpt2" });
  });

  it("reports the missing OpenAI key as MISSING_API_KEY without a dry run", async () => {
    const home = tempHome();
    pinGpt2(home);
    const result = await runMotifIn(
      home,
      ["a fox sticker", "--transparent", "--format", "json"],
      { FAL_KEY: "test-key", OPENAI_API_KEY: "" }
    );
    expect(result.code).toBe(3);
    const error = parseJson(result.stderr);
    expect(error).toMatchObject({ code: "MISSING_API_KEY" });
    expect(String(error.message)).toContain("OPENAI_API_KEY");
  });
});

describe("vary Model choice (spawned CLI)", () => {
  it("resolves a Model when the last one cannot vary", async () => {
    const home = tempHome();
    seedLastGeneration(home, "flux-fast");

    const result = await runMotifIn(home, [
      "vary",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    const dryRun = parseJson(result.stdout);
    expect(dryRun).toMatchObject({ varyModel: "resolved" });
    expect(dryRun.model).not.toBe("flux-fast");
  });

  it("uses the look's Model when the last Model cannot vary", async () => {
    const home = tempHome();
    seedLastGeneration(home, "flux-fast");

    const result = await runMotifIn(home, [
      "vary",
      "--look",
      "interior",
      "--num",
      "1",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(parseJson(result.stdout)).toMatchObject({
      model: "flux2-pro",
      varyModel: "resolved",
    });
  });

  it("reuses the last Model when vary still ranks it", async () => {
    const home = tempHome();
    seedLastGeneration(home, "banana");

    const result = await runMotifIn(home, [
      "vary",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(parseJson(result.stdout)).toMatchObject({
      model: "banana",
      numImages: 1,
      varyModel: "reused",
    });
  });
});
