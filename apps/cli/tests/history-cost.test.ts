import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { formatCost } from "@howells/motif-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Generation } from "../src/utils/config";
import { formatTotal } from "../src/utils/cost";

/**
 * A cost of zero has to mean free.
 *
 * Every metered, per-second and per-megapixel tool used to record as costing
 * $0.000, so a Topaz upscale that billed real money was indistinguishable in
 * history from one that cost nothing, and the session total silently
 * under-reported spend. These cover the two halves of the fix: null survives
 * to storage and to the screen as "metered", and a per-megapixel run resolves
 * to a real figure once the output has been measured. MOT-38.
 */

vi.mock("../src/api/fal", () => ({
  runTool: vi.fn(),
  runToolQueued: vi.fn(),
}));

vi.mock("../src/utils/image", async (importActual) => {
  const actual = await importActual<typeof import("../src/utils/image")>();
  return {
    ...actual,
    downloadAll: vi.fn(),
    openImage: vi.fn(),
    writeArtifact: vi.fn(),
  };
});

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

let home: string;

const today = (): string => new Date().toISOString().split("T")[0] ?? "";

const historyPath = (): string => join(home, ".motif", "history.json");

function readStoredHistory(): unknown {
  return JSON.parse(readFileSync(historyPath(), "utf-8"));
}

const generation = (cost: number | null, id: string): Generation => ({
  aspect: "1:1",
  cost,
  id,
  model: "banana",
  output: `/tmp/${id}.png`,
  prompt: "a cat",
  resolution: "1K",
  timestamp: new Date().toISOString(),
});

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "motif-history-cost-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  vi.resetModules();
});

afterEach(() => {
  rmSync(home, { force: true, recursive: true });
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  vi.restoreAllMocks();
});

describe("unknown cost in history", () => {
  it("round-trips a null cost through save and load", async () => {
    const { addGeneration, loadHistory } = await import("../src/utils/config");

    await addGeneration(generation(null, "metered-run"));

    // Null has to reach the file itself: a cost coerced to 0 on the way to
    // disk is indistinguishable from a run that really was free.
    expect(readStoredHistory()).toMatchObject({
      generations: [{ cost: null }],
    });

    const loaded = await loadHistory();
    expect(loaded.generations[0]?.cost).toBeNull();
  });

  it("excludes unknown costs from the totals and counts them instead", async () => {
    const { addGenerations, loadHistory } = await import("../src/utils/config");

    await addGenerations([
      generation(0.08, "priced-a"),
      generation(null, "metered"),
      generation(0.02, "priced-b"),
    ]);

    const { totalCost } = await loadHistory();
    expect(totalCost.session).toBeCloseTo(0.1, 10);
    expect(totalCost.today).toBeCloseTo(0.1, 10);
    expect(totalCost.allTime).toBeCloseTo(0.1, 10);
    expect(totalCost.unknown).toEqual({ allTime: 1, session: 1, today: 1 });
  });

  it("loads a history file written before the unknown counts existed", async () => {
    mkdirSync(join(home, ".motif"), { recursive: true });
    writeFileSync(
      historyPath(),
      JSON.stringify({
        generations: [generation(0.03, "old-entry")],
        lastSessionDate: today(),
        totalCost: { allTime: 1.5, session: 0.3, today: 0.3 },
      })
    );

    const { addGeneration, loadHistory } = await import("../src/utils/config");

    const loaded = await loadHistory();
    expect(loaded.totalCost.unknown).toEqual({
      allTime: 0,
      session: 0,
      today: 0,
    });
    expect(loaded.totalCost.allTime).toBe(1.5);

    // The counts start from zero and are accurate from the next run on.
    await addGeneration(generation(null, "first-metered"));
    const after = await loadHistory();
    expect(after.totalCost.unknown.allTime).toBe(1);
    expect(after.totalCost.allTime).toBe(1.5);
  });
});

describe("rendering an unknown cost", () => {
  it("never renders null as a dollar figure", () => {
    const rendered = formatCost(null);
    expect(rendered).not.toContain("$");
    expect(rendered).not.toMatch(/\d/);
    expect(rendered).toBe("metered");
  });

  it("shows a total and the runs it could not price as two figures", () => {
    expect(formatTotal(1.234, 0)).toBe("$1.23");
    expect(formatTotal(1.234, 4)).toBe("$1.23 + 4 metered");
  });
});

describe("measured cost from a per-megapixel run", () => {
  /**
   * Topaz Adjust bills $0.08 per 24 output megapixels. A 6000x4000 output is
   * exactly 24MP, so the run bills $0.08 — unknowable before the call, exact
   * after it, and previously recorded as zero.
   */
  it("records the real figure for a Topaz run rather than null or zero", async () => {
    const fal = await import("../src/api/fal");
    const image = await import("../src/utils/image");
    const { runFalTool } = await import("../src/commands/tool-run");
    const { loadHistory } = await import("../src/utils/config");

    vi.mocked(fal.runToolQueued).mockResolvedValue({
      image: { url: "https://fal.media/adjusted.png" },
    });
    vi.mocked(image.writeArtifact).mockResolvedValue({
      height: 4000,
      key: "image",
      path: resolve("adjusted.png"),
      size: "12.0MB",
      width: 6000,
    });

    await runFalTool(
      "topaz-adjust",
      "https://fal.media/source.png",
      { output: "adjusted.png" },
      { format: "json", sanitize: true }
    );

    const { generations, totalCost } = await loadHistory();
    expect(generations).toHaveLength(1);
    expect(generations[0]?.cost).toBeCloseTo(0.08, 10);
    expect(totalCost.session).toBeCloseTo(0.08, 10);
    expect(totalCost.unknown.session).toBe(0);
  });
});
