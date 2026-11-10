import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { mergeConfigLayers } from "../src/utils/config";
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
      totalCost: {
        allTime: 0,
        session: 0,
        today: 0,
        unknown: { allTime: 0, session: 0, today: 0 },
      },
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

describe("config layers", () => {
  it("merges .motifrc task pins over global ones per Task", () => {
    const merged = mergeConfigLayers(
      {
        defaultAspect: "1:1",
        defaultResolution: "2K",
        tasks: {
          cutout: { model: "bria-rmbg" },
          upscale: { model: "crystal" },
        },
      },
      { tasks: { generate: { model: "flare" } } }
    );
    expect(merged.tasks).toStrictEqual({
      cutout: { model: "bria-rmbg" },
      generate: { model: "flare" },
      upscale: { model: "crystal" },
    });
  });
});

describe("series create (spawned CLI)", () => {
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

describe("vary Model choice (spawned CLI)", () => {
  it("resolves a Model when the last one cannot vary", async () => {
    const home = tempHome();
    seedLastGeneration(home, "flux2-turbo");

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
    expect(dryRun.model).not.toBe("flux2-turbo");
  });

  it("uses the look's Model when the last Model cannot vary", async () => {
    const home = tempHome();
    seedLastGeneration(home, "flux2-turbo");

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
