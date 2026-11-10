import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runMotifIn } from "./cli-env";

/**
 * A config, history or series file that exists but cannot be used is an error
 * that names the file. It is never replaced, so one bad byte cannot erase the
 * history and cost totals around it.
 */

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

let home: string;
let motifDir: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "motif-stored-files-"));
  motifDir = join(home, ".motif");
  mkdirSync(motifDir, { recursive: true });
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  vi.resetModules();
});

afterEach(() => {
  rmSync(home, { force: true, recursive: true });
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
});

const GENERATION = {
  aspect: "1:1",
  cost: 0.04,
  id: "g1",
  model: "banana",
  output: "/tmp/a.png",
  prompt: "a",
  resolution: "2K",
  timestamp: "2026-01-01T00:00:00.000Z",
} as const;

function parseJson(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null) {
    throw new Error("expected a JSON object");
  }
  return Object.fromEntries(Object.entries(value));
}

function writeStored(name: string, contents: string): string {
  const path = join(motifDir, name);
  writeFileSync(path, contents);
  return path;
}

function validHistory(): string {
  return JSON.stringify({
    generations: [GENERATION],
    lastSessionDate: new Date().toISOString().split("T")[0],
    totalCost: {
      allTime: 1,
      session: 0,
      today: 0,
      unknown: { allTime: 0, session: 0, today: 0 },
    },
  });
}

describe("history", () => {
  it("is empty when the file is missing", async () => {
    const { loadHistory } = await import("../src/utils/config");
    await expect(loadHistory()).resolves.toMatchObject({ generations: [] });
  });

  it("refuses unparseable history and leaves the file alone", async () => {
    const { addGenerations, loadHistory } = await import("../src/utils/config");
    const { CorruptFileError } = await import("../src/utils/stored-json");
    const path = writeStored("history.json", '{"generations": [');

    await expect(loadHistory()).rejects.toBeInstanceOf(CorruptFileError);
    await expect(addGenerations([GENERATION])).rejects.toThrow(path);
    expect(readFileSync(path, "utf-8")).toBe('{"generations": [');
  });

  it.each([
    ["generations is not an array", { generations: {} }],
    [
      "totalCost has no unknown object",
      {
        generations: [],
        lastSessionDate: "2026-01-01",
        totalCost: { allTime: 0, session: 0, today: 0 },
      },
    ],
  ])("refuses history where %s", async (_name, value) => {
    const { loadHistory } = await import("../src/utils/config");
    const path = writeStored("history.json", JSON.stringify(value));

    await expect(loadHistory()).rejects.toThrow(path);
  });

  it("keeps the 100-entry cap and resets daily costs on a new day", async () => {
    const { addGenerations, loadHistory } = await import("../src/utils/config");
    writeStored(
      "history.json",
      JSON.stringify({
        generations: Array.from({ length: 100 }, (_, i) => ({
          ...GENERATION,
          id: `old-${i}`,
        })),
        lastSessionDate: "2020-01-01",
        totalCost: {
          allTime: 5,
          session: 2,
          today: 2,
          unknown: { allTime: 1, session: 1, today: 1 },
        },
      })
    );

    await addGenerations([{ ...GENERATION, id: "new" }]);
    const history = await loadHistory();

    expect(history.generations).toHaveLength(100);
    expect(history.generations.at(-1)?.id).toBe("new");
    expect(history.generations[0]?.id).toBe("old-1");
    expect(history.totalCost).toStrictEqual({
      allTime: 5.04,
      session: 0.04,
      today: 0.04,
      unknown: { allTime: 1, session: 0, today: 0 },
    });
  });
});

describe("config", () => {
  it("refuses to save over an unparseable config, apiKey included", async () => {
    const { saveConfig } = await import("../src/utils/config");
    const path = writeStored("config.json", '{"apiKey": "secret",');

    await expect(saveConfig({ defaultResolution: "4K" })).rejects.toThrow(path);
    expect(readFileSync(path, "utf-8")).toBe('{"apiKey": "secret",');
  });

  it("saves only the keys passed over a valid config", async () => {
    const { saveConfig } = await import("../src/utils/config");
    const path = writeStored("config.json", '{"apiKey":"secret"}');

    await saveConfig({ defaultResolution: "4K" });

    expect(parseJson(readFileSync(path, "utf-8"))).toStrictEqual({
      apiKey: "secret",
      defaultResolution: "4K",
    });
  });

  it("loads a config that still holds the removed openAfterGenerate key", async () => {
    const { loadConfig } = await import("../src/utils/config");
    writeStored("config.json", '{"apiKey":"secret","openAfterGenerate":false}');

    await expect(loadConfig()).resolves.toMatchObject({ apiKey: "secret" });
  });

  it("refuses a config with a wrongly typed field when loading", async () => {
    const { loadConfig } = await import("../src/utils/config");
    const path = writeStored("config.json", '{"apiKey": 12}');

    await expect(loadConfig()).rejects.toThrow(path);
  });
});

describe("series", () => {
  it("fails the listing on a series file that cannot be used", async () => {
    const { createSeries, listSeries } = await import("../src/utils/series");
    await createSeries({ name: "Good" });
    const badDir = join(motifDir, "series", "bad");
    mkdirSync(badDir, { recursive: true });
    const path = join(badDir, "series.json");
    writeFileSync(path, '{"slug": "bad", "outputs": {}}');

    await expect(listSeries()).rejects.toThrow(path);
  });

  it("leaves out a directory that holds no series.json", async () => {
    const { createSeries, listSeries } = await import("../src/utils/series");
    await createSeries({ name: "Good" });
    mkdirSync(join(motifDir, "series", "stray"), { recursive: true });

    const listed = await listSeries();

    expect(listed.map((s) => s.slug)).toStrictEqual(["good"]);
  });

  it("refuses a series whose slug is not its directory", async () => {
    const { createSeries, loadSeries } = await import("../src/utils/series");
    const config = await createSeries({ name: "Real" });
    const path = join(motifDir, "series", "real", "series.json");
    writeFileSync(path, JSON.stringify({ ...config, slug: "other" }));

    await expect(loadSeries("real")).rejects.toThrow(path);
  });
});

describe("through the CLI", () => {
  it("reports a corrupt history as one structured error and leaves it", async () => {
    const path = writeStored("history.json", "not json");

    const result = await runMotifIn(home, ["--history", "--format", "json"]);

    expect(result.code).toBe(2);
    const error = parseJson(result.stderr.trim());
    expect(error).toMatchObject({
      code: "CORRUPT_FILE",
      details: { path },
      error: true,
      status: 422,
    });
    expect(readFileSync(path, "utf-8")).toBe("not json");
  });

  it("reports a corrupt config as one structured error and leaves it", async () => {
    const path = writeStored("config.json", "{");

    const result = await runMotifIn(home, [
      "a sunset",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(2);
    expect(parseJson(result.stderr.trim())).toMatchObject({
      code: "CORRUPT_FILE",
      details: { path },
    });
    expect(readFileSync(path, "utf-8")).toBe("{");
  });

  it("reports a directory where the config should be as FILE_ACCESS_FAILED, not a stack", async () => {
    const path = join(motifDir, "config.json");
    mkdirSync(path);

    const result = await runMotifIn(home, [
      "a sunset",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(2);
    expect(parseJson(result.stderr.trim())).toMatchObject({
      code: "FILE_ACCESS_FAILED",
      details: { cause: "EISDIR", operation: "read", path },
      error: true,
      status: 422,
    });
  });

  it("reports a corrupt series as CORRUPT_FILE, not SERIES_NOT_FOUND", async () => {
    const dir = join(motifDir, "series", "broken");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "series.json");
    writeFileSync(path, "{");

    const result = await runMotifIn(home, [
      "series",
      "show",
      "broken",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(2);
    expect(parseJson(result.stderr.trim())).toMatchObject({
      code: "CORRUPT_FILE",
      details: { path },
    });
  });
});

describe("history of a valid file through the CLI", () => {
  it("still reads", async () => {
    writeStored("history.json", validHistory());

    const result = await runMotifIn(home, ["--history", "--format", "json"]);

    expect(result.code).toBe(0);
    expect(parseJson(result.stdout).total).toBe(1);
  });
});

describe("history paging flags", () => {
  it.each([
    ["--limit", "abc"],
    ["--limit", "0"],
    ["--offset", "-1"],
  ])("refuses %s %s as INVALID_OPTION", async (flag, value) => {
    const result = await runMotifIn(home, [
      "--history",
      flag,
      value,
      "--format",
      "json",
    ]);

    expect(result.code).toBe(2);
    expect(parseJson(result.stderr.trim())).toMatchObject({
      code: "INVALID_OPTION",
    });
  });
});
