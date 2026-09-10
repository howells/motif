import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import {
  captionFor,
  defaultColumns,
  renderSheet,
  SHEET_CAPTION_HEIGHT,
  SHEET_CELL,
  SHEET_GAP,
} from "../src/commands/sheet";
import type { Generation } from "../src/utils/config";
import { spawnEnv } from "./cli-env";

const fixtures = mkdtempSync(join(tmpdir(), "motif-sheet-"));
// Output must sit inside the git root, so spawned runs write under apps/cli.
const outputs = mkdtempSync(join(process.cwd(), ".tmp-sheet-"));

afterAll(() => {
  rmSync(fixtures, { force: true, recursive: true });
  rmSync(outputs, { force: true, recursive: true });
});

async function fixture(
  name: string,
  width: number,
  height: number
): Promise<string> {
  const path = join(fixtures, name);
  await sharp({
    create: { background: "#336699", channels: 3, height, width },
  })
    .png()
    .toFile(path);
  return path;
}

function generation(output: string, extra: Partial<Generation>): Generation {
  return {
    aspect: "1:1",
    cost: 0.04,
    id: "g1",
    model: "banana",
    output,
    prompt: "a cat",
    resolution: "1K",
    timestamp: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

interface Run {
  code: number | null;
  stderr: string;
  stdout: string;
}

async function runSheet(args: string[]): Promise<Run> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts", "sheet", ...args],
    {
      cwd: process.cwd(),
      env: spawnEnv({
        CI: "1",
        FAL_KEY: "",
        HOME: mkdtempSync(join(tmpdir(), "motif-sheet-home-")),
      }),
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf-8");
  child.stderr.setEncoding("utf-8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const code = await new Promise<number | null>((resolveCode) => {
    child.on("close", resolveCode);
  });
  return { code, stderr, stdout };
}

describe(captionFor, () => {
  it("captions from the newest matching history entry", () => {
    const path = join(fixtures, "match.png");
    const caption = captionFor(path, [
      generation(path, { model: "flux" }),
      generation(path, {
        cost: 0.211,
        look: "editorial",
        model: "gpt2",
        mood: "dawn",
      }),
    ]);
    expect(caption).toBe("gpt2 · editorial · dawn · $0.211");
  });

  it("says cost unknown rather than guessing", () => {
    const path = join(fixtures, "unknown.png");
    expect(captionFor(path, [generation(path, { cost: null })])).toBe(
      "banana · cost unknown"
    );
  });

  it("falls back to the filename with no history match", () => {
    expect(captionFor(join(fixtures, "stray.png"), [])).toBe("stray.png");
  });
});

describe(renderSheet, () => {
  it("lays cells out in a grid of 512 px squares with caption bands", async () => {
    const wide = await fixture("wide.png", 40, 20);
    const tall = await fixture("tall.png", 20, 40);
    const square = await fixture("square.png", 30, 30);
    const out = join(fixtures, "grid.png");

    const size = await renderSheet(
      [
        { caption: "wide", path: wide },
        { caption: "tall", path: tall },
        { caption: "square", path: square },
      ],
      out,
      defaultColumns(3)
    );

    expect(defaultColumns(3)).toBe(2);
    expect(size.width).toBe(SHEET_GAP + 2 * (SHEET_CELL + SHEET_GAP));
    expect(size.height).toBe(
      SHEET_GAP + 2 * (SHEET_CELL + SHEET_CAPTION_HEIGHT + SHEET_GAP)
    );
    const meta = await sharp(out).metadata();
    expect({ height: meta.height, width: meta.width }).toStrictEqual(size);
  });
});

describe("motif sheet", () => {
  it("writes a sheet from files and reports it as JSON", async () => {
    const a = await fixture("a.png", 24, 16);
    const b = await fixture("b.png", 16, 24);
    const out = join(outputs, "sheet.png");

    const result = await runSheet([
      a,
      b,
      "-o",
      out,
      "--no-open",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    const payload: unknown = JSON.parse(result.stdout.trim());
    expect(payload).toMatchObject({
      cols: 2,
      command: "sheet",
      count: 2,
      height: SHEET_GAP + SHEET_CELL + SHEET_CAPTION_HEIGHT + SHEET_GAP,
      path: out,
      width: SHEET_GAP + 2 * (SHEET_CELL + SHEET_GAP),
    });
  });

  it("refuses a run with neither files nor --last", async () => {
    const result = await runSheet(["--format", "json"]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr.trim())).toMatchObject({
      code: "INVALID_OPTION",
    });
  });

  it("refuses an output outside the git root", async () => {
    const a = await fixture("c.png", 16, 16);
    const result = await runSheet([
      a,
      "-o",
      "/tmp/motif-sheet.png",
      "--format",
      "json",
    ]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr.trim())).toMatchObject({
      code: "INVALID_OUTPUT_PATH",
    });
  });
});
