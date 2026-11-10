import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createMotif } from "@howells/motif-sdk";
import { describe, expect, it } from "vitest";

import { planScenes } from "../src/commands/series/shared";
import { json, motif, objects, project, REMOTE_PNG } from "./pipeline-helpers";

/**
 * `series run` plans every scene as it will send it, the anchored ones too,
 * before anything is paid for, and every scene asks for the same shape.
 */

/** The fields of a posted body that decide the picture's size. */
function sizeOf(body: Record<string, unknown>): string {
  return JSON.stringify({
    aspect_ratio: body.aspect_ratio,
    image_size: body.image_size,
    resolution: body.resolution,
  });
}

async function sentBodies(args: string[]): Promise<Record<string, unknown>[]> {
  const dir = project();
  const log = join(dir, "fal.log");
  const run = await motif(
    dir,
    ["series", "run", "vases", ...args, "--format", "json"],
    { images: [REMOTE_PNG] },
    { FAKE_FAL_LOG: log }
  );
  expect(run.stderr).toBe("");
  expect(run.code).toBe(0);
  return readFileSync(log, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => json(line))
    .filter((entry) => entry.method === "POST")
    .map((entry) => json(String(entry.body)));
}

describe("series run scenes", () => {
  it.each(["fast", "balanced", "quality"])(
    "asks for one size on every scene at the %s tier with -r 2K",
    async (tier) => {
      const bodies = await sentBodies([
        "--tier",
        tier,
        "-r",
        "2K",
        "--count",
        "3",
      ]);

      expect(bodies).toHaveLength(3);
      expect(new Set(bodies.map(sizeOf)).size).toBe(1);
    }
  );

  it("keeps a chosen aspect on the anchored scenes", async () => {
    const bodies = await sentBodies([
      "--tier",
      "quality",
      "-a",
      "3:2",
      "--count",
      "2",
    ]);

    expect(new Set(bodies.map(sizeOf)).size).toBe(1);
    expect(bodies[1]?.image_size).toStrictEqual({ height: 1344, width: 2016 });
  });

  it("reports each scene's own plan in a dry run", async () => {
    const dir = project();
    const run = await motif(
      dir,
      [
        "series",
        "run",
        "vases",
        "--tier",
        "quality",
        "-r",
        "2K",
        "--count",
        "2",
        "--dry-run",
        "--format",
        "json",
      ],
      {}
    );

    expect(run.code).toBe(0);
    const scenes = objects(json(run.stdout).scenes);
    expect(scenes).toHaveLength(2);
    expect(scenes[1]?.model).toBe(scenes[0]?.model);
    expect(scenes[1]?.size).toStrictEqual(scenes[0]?.size);
  });
});

const motifClient = createMotif({ apiKey: "unused: planning is local" });

/** A real plan for scene `index`: scene 3 asks for more images than any Model makes. */
function plan(index: number) {
  return motifClient.plan(
    "generate",
    { count: index === 2 ? 99 : 1, prompt: `scene ${index}` },
    { dryRun: true }
  );
}

describe("planScenes", () => {
  it("plans every scene, in order, before anything runs", () => {
    const asked: number[] = [];

    const planned = planScenes(2, (index) => {
      asked.push(index);
      return plan(index);
    });

    expect(asked).toStrictEqual([0, 1]);
    expect("plans" in planned && planned.plans).toHaveLength(2);
  });

  it("refuses the whole run at the first scene that cannot be planned", () => {
    const asked: number[] = [];

    const planned = planScenes(4, (index) => {
      asked.push(index);
      return plan(index);
    });

    expect("error" in planned && planned.error.code).toBe("NO_MODEL_AVAILABLE");
    expect(asked).toStrictEqual([0, 1, 2]);
  });
});
