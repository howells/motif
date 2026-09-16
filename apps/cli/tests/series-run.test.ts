import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Non-dry-run coverage for the series run orchestration.
 *
 * The deterministic helpers (`loadOrCreateRunSeries`, `buildSeriesRunScenes`,
 * `buildSeriesRunStylePrompt`) are exercised directly against a temp HOME.
 * The full `series run` generate loop is driven through the only exported
 * entry point (`runSeries`) with fetch stubbed and the image/download side
 * effects mocked, so no fal request is ever made.
 */

vi.mock(import("../src/utils/image"), async (importActual) => {
  const actual = await importActual<typeof import("../src/utils/image")>();
  return {
    ...actual,
    downloadImage: vi.fn(),
    getFileSize: vi.fn(),
    getImageDimensions: vi.fn(),
    openImage: vi.fn(),
  };
});

vi.mock(import("../src/utils/input"), async (importActual) => {
  const actual = await importActual<typeof import("../src/utils/input")>();
  return {
    ...actual,
    readStdinJson: vi.fn(async () => null),
  };
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalFalKey = process.env.FAL_KEY;

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "motif-series-run-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.FAL_KEY = "test-key";
  vi.resetModules();
});

afterEach(() => {
  rmSync(home, { force: true, recursive: true });
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  process.env.FAL_KEY = originalFalKey;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("buildSeriesRunStylePrompt", () => {
  it("prefers an explicit style over the generated fallback", async () => {
    const { buildSeriesRunStylePrompt } =
      await import("../src/commands/series");
    expect(buildSeriesRunStylePrompt("towers", "brutalist concrete")).toBe(
      "brutalist concrete"
    );
  });

  it("synthesizes a cohesive style prompt from the theme", async () => {
    const { buildSeriesRunStylePrompt } =
      await import("../src/commands/series");
    const prompt = buildSeriesRunStylePrompt("towers");
    expect(prompt).toContain("Cohesive visual series about towers");
    expect(prompt).toContain("consistent tone");
  });
});

describe("midSentenceTheme", () => {
  it("lower-cases a theme's first letter mid-sentence, but not an acronym", async () => {
    const { midSentenceTheme } = await import("../src/commands/series");
    expect(midSentenceTheme("A ceramics studio")).toBe("a ceramics studio");
    expect(midSentenceTheme("Brutalist Towers")).toBe("brutalist Towers");
    expect(midSentenceTheme("NASA missions")).toBe("NASA missions");
  });
});

describe("buildSeriesRunScenes", () => {
  it("produces one indexed scene prompt per requested image", async () => {
    const { buildSeriesRunScenes } = await import("../src/commands/series");
    const scenes = buildSeriesRunScenes("towers", 3);
    expect(scenes).toHaveLength(3);
    expect(scenes[0]).toContain("Image 1 of 3");
    expect(scenes[1]).toContain("Image 2 of 3");
    expect(scenes[2]).toContain("Image 3 of 3");
  });

  it("cycles through the scene foci for large counts", async () => {
    const { buildSeriesRunScenes } = await import("../src/commands/series");
    const scenes = buildSeriesRunScenes("towers", 9);
    expect(scenes).toHaveLength(9);
    // Focus list has 8 entries, so scene 9 reuses the first focus.
    expect(scenes[8]).toContain("wide establishing composition");
  });
});

describe("loadOrCreateRunSeries", () => {
  it("loads an existing series when a slug is supplied", async () => {
    const { createSeries } = await import("../src/utils/series");
    const { loadOrCreateRunSeries } = await import("../src/commands/series");

    const created = await createSeries({ name: "Existing Run" });
    const loaded = await loadOrCreateRunSeries({
      aspect: "1:1",
      resolution: "2K",
      series: created.slug,
      stylePrompt: "ignored",
      theme: "unused theme",
    });

    expect(loaded.slug).toBe(created.slug);
    expect(loaded.id).toBe(created.id);
  });

  it("creates a new series from the theme when none is supplied", async () => {
    const { loadSeries } = await import("../src/utils/series");
    const { loadOrCreateRunSeries } = await import("../src/commands/series");

    const config = await loadOrCreateRunSeries({
      aspect: "3:2",
      resolution: "4K",
      stylePrompt: "editorial",
      theme: "Glass Towers",
    });

    expect(config.slug).toBe("glass-towers");
    expect(config.defaultAspect).toBe("3:2");
    expect(config.stylePrompt).toBe("editorial");
    // Persisted, not just returned.
    await expect(loadSeries("glass-towers")).resolves.toMatchObject({
      slug: "glass-towers",
    });
  });

  it("pins the run's look and mood on the series it creates", async () => {
    const { loadOrCreateRunSeries } = await import("../src/commands/series");

    const config = await loadOrCreateRunSeries({
      aspect: "3:2",
      look: "lived-in",
      mood: "overcast",
      resolution: "2K",
      stylePrompt: "warm kitchens",
      theme: "Pinned Kitchens",
    });

    expect(config).toMatchObject({ look: "lived-in", mood: "overcast" });
  });

  it("falls back to loading when the theme slug already exists", async () => {
    const { createSeries } = await import("../src/utils/series");
    const { loadOrCreateRunSeries } = await import("../src/commands/series");

    const first = await createSeries({
      name: "Repeat Theme",
      stylePrompt: "original",
    });

    // No `series` slug, same theme → createSeries throws "already exists",
    // and the helper recovers by loading the existing series.
    const recovered = await loadOrCreateRunSeries({
      aspect: "1:1",
      resolution: "2K",
      stylePrompt: "should-be-ignored",
      theme: "Repeat Theme",
    });

    expect(recovered.id).toBe(first.id);
    expect(recovered.stylePrompt).toBe("original");
  });
});

describe("runSeries full generate flow (mocked fal)", () => {
  it("generates each image, reuses the first as an anchor reference, and records outputs", async () => {
    const image = await import("../src/utils/image");
    const { runSeries } = await import("../src/commands/series");
    const { loadSeries } = await import("../src/utils/series");

    let counter = 0;
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body: unknown = JSON.parse(
          typeof init?.body === "string" ? init.body : "{}"
        );
        if (typeof body === "object" && body !== null) {
          requests.push({ ...body });
        }
        return new Response(
          JSON.stringify({
            images: [{ url: `https://cdn.example/generated-${counter++}.png` }],
          }),
          { headers: { "content-type": "application/json" }, status: 200 }
        );
      })
    );
    vi.mocked(image.downloadImage).mockImplementation(
      async (_url, outputPath) => {
        writeFileSync(outputPath, PNG_1X1);
        return outputPath;
      }
    );
    vi.mocked(image.getImageDimensions).mockResolvedValue({
      height: 1024,
      width: 1024,
    });
    vi.mocked(image.getFileSize).mockReturnValue("1.0 KB");

    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await runSeries([
      "run",
      "Brutalist Towers",
      "--count",
      "2",
      "--format",
      "json",
      "--model",
      "banana",
    ]);

    expect(requests).toHaveLength(2);

    // First image has no anchor yet; the second reuses the first as a reference.
    expect(requests[0]?.image_urls).toBeUndefined();
    expect(requests[1]?.image_urls).toHaveLength(1);
    expect(String(requests[0]?.prompt)).toContain(
      "cohesive visual series about brutalist Towers"
    );

    const payload: unknown = JSON.parse(writes.join("").trim());
    if (!isRecord(payload)) {
      throw new Error("expected a JSON object");
    }
    expect(payload).toMatchObject({
      command: "series-run",
      dryRun: false,
      series: "brutalist-towers",
    });
    expect(payload.images).toHaveLength(2);

    const persisted = await loadSeries("brutalist-towers");
    expect(persisted.outputs).toHaveLength(2);
    expect(persisted.outputs[1]?.refsUsed).toContain("series-anchor");
  });
});
