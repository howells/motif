import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TaskOutput } from "@howells/motif-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** What Studio's screens share: the end of a run, and the names modes give files. */

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "motif-studio-run-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  vi.resetModules();
});

afterEach(() => {
  rmSync(home, { force: true, recursive: true });
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
});

function output(url: string): TaskOutput {
  return {
    chosenBy: "ranking",
    cost: { basis: "fixed", usd: 0.04 },
    data: {},
    endpoint: "fal-ai/test",
    files: [{ key: "images", url }],
    model: "banana",
    provider: "fal",
    raw: {},
    task: "generate",
    tier: "balanced",
  };
}

describe("saveRun", () => {
  it("writes the first file, records it in history and describes it", async () => {
    const { saveRun } = await import("../src/studio/task");
    const { loadHistory } = await import("../src/utils/config");
    const target = join(home, "out.png");

    const result = await saveRun(
      output(`data:image/png;base64,${PNG_1X1}`),
      target,
      { aspect: "1:1", prompt: "a cat", resolution: "2K" }
    );

    expect(result).toMatchObject({ dims: "1x1", path: target, size: "70B" });
    expect(existsSync(target)).toBe(true);
    const { generations } = await loadHistory();
    expect(generations).toMatchObject([
      { cost: 0.04, model: "banana", output: target, prompt: "a cat" },
    ]);
  });

  it("fails loudly when the run returned no file", async () => {
    const { saveRun } = await import("../src/studio/task");
    const empty = { ...output(""), files: [] };

    await expect(
      saveRun(empty, join(home, "none.png"), {
        aspect: "1:1",
        prompt: "x",
        resolution: "1K",
      })
    ).rejects.toThrow("The run returned no image.");
  });
});

async function pinned(model: string) {
  const { motifClient } = await import("../src/utils/motif-client");
  const { acceptsResolution } = await import("../src/studio/task");
  const client = motifClient({
    apiKey: "unused: planning is local",
    defaultAspect: "1:1",
    defaultResolution: "2K",
    tasks: { generate: { model } },
  });
  return acceptsResolution(client, "generate", {
    aspect: "1:1",
    prompt: "a cat",
    resolution: "2K",
    tier: "balanced",
  });
}

describe("acceptsResolution", () => {
  it("drops the resolution for a pinned Model that cannot take it, so Studio can still plan", async () => {
    await expect(pinned("gpt")).resolves.toBe(false);
    await expect(pinned("flux2-pro")).resolves.toBe(false);
  });

  it("keeps the resolution for a pinned Model that takes it", async () => {
    await expect(pinned("banana")).resolves.toBe(true);
  });
});

describe("Edit modes", () => {
  it("name upscale and cutout files and history as the CLI verbs do", async () => {
    const { outputPathFor, promptLabelFor } =
      await import("../src/studio/edit-modes");
    // Inside the working directory, which is the allowed output root here.
    const source = join(process.cwd(), "cat.png");

    expect(outputPathFor(source, "upscale")).toBe(
      join(process.cwd(), "cat-upscale.png")
    );
    expect(outputPathFor(source, "rmbg")).toBe(
      join(process.cwd(), "cat-cutout.png")
    );
    expect(
      promptLabelFor("upscale", { edit: "", source: "[cutout] a cat" })
    ).toBe("[upscale] a cat");
    expect(promptLabelFor("rmbg", { edit: "", source: "a cat" })).toBe(
      "[cutout] a cat"
    );
  });
});
