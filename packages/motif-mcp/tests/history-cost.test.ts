/**
 * readHistory and unknown cost.
 *
 * The CLI now records null against a run nothing can price — a metered or
 * per-second endpoint — instead of zero. This reader has to pass that through
 * rather than flattening it, and has to load a history file written before the
 * unknown-run counts existed. MOT-38.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

let home: string;

function writeHistoryFile(contents: unknown): void {
  mkdirSync(join(home, ".motif"), { recursive: true });
  writeFileSync(join(home, ".motif", "history.json"), JSON.stringify(contents));
}

const entry = (cost: number | null, id: string) => ({
  aspect: "1:1",
  cost,
  id,
  model: "topaz-adjust",
  output: `/tmp/${id}.png`,
  prompt: "[tool:topaz-adjust] tonal adjustment",
  resolution: "4K",
  timestamp: "2026-08-23T10:00:00.000Z",
});

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "motif-mcp-history-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  vi.resetModules();
});

afterEach(() => {
  rmSync(home, { force: true, recursive: true });
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
});

describe("readHistory", () => {
  it("passes a null cost through instead of reporting it as free", async () => {
    writeHistoryFile({
      generations: [entry(null, "metered")],
      lastSessionDate: "2026-08-23",
      totalCost: {
        allTime: 0.5,
        session: 0.5,
        today: 0.5,
        unknown: { allTime: 3, session: 1, today: 1 },
      },
    });

    const { readHistory } = await import("../src/history.js");
    const result = readHistory();

    expect(result.generations[0]?.cost).toBeNull();
    expect(result.costs.unknown).toEqual({ allTime: 3, session: 1, today: 1 });
  });

  it("loads a history file written before the unknown counts existed", async () => {
    writeHistoryFile({
      generations: [entry(0.03, "priced")],
      lastSessionDate: "2026-08-23",
      totalCost: { allTime: 0.5, session: 0.2, today: 0.2 },
    });

    const { readHistory } = await import("../src/history.js");
    const result = readHistory();

    expect(result.costs.allTime).toBe(0.5);
    expect(result.costs.unknown).toEqual({ allTime: 0, session: 0, today: 0 });
  });
});
