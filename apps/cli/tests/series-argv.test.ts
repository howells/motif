import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runMotifIn, spawnEnv } from "./cli-env";

/** `motif series` takes everything from argv and never reads stdin. */

const homes: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "motif-series-argv-"));
  homes.push(dir);
  return dir;
}

afterEach(() => {
  for (const home of homes.splice(0)) {
    rmSync(home, { force: true, recursive: true });
  }
});

function parseJson(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null) {
    throw new Error("expected a JSON object");
  }
  return Object.fromEntries(Object.entries(value));
}

describe("motif series without stdin", () => {
  it("returns promptly while stdin is an open pipe that never closes", async () => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/index.ts", "series", "list", "--format", "json"],
      {
        cwd: process.cwd(),
        env: spawnEnv({ CI: "1", FAL_KEY: "", HOME: tempHome() }),
        // Held open and never written to: a parent that keeps the write end open.
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    let stdout = "";
    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("series list waited on stdin"));
      }, 20_000);
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode);
      });
    });

    expect(code).toBe(0);
    expect(parseJson(stdout)).toMatchObject({
      command: "series-list",
      total: 0,
    });
  });

  it("accepts --format and --fields before or after the subcommand", async () => {
    const home = tempHome();
    const after = await runMotifIn(home, [
      "series",
      "list",
      "--format",
      "json",
    ]);
    const before = await runMotifIn(home, ["series", "--format=json", "list"]);

    expect(after.code).toBe(0);
    expect(before.code).toBe(0);
    expect(parseJson(after.stdout)).toStrictEqual(parseJson(before.stdout));

    const created = await runMotifIn(home, [
      "series",
      "create",
      "Masked",
      "--fields",
      "slug",
      "--format",
      "json",
    ]);
    expect(parseJson(created.stdout)).toStrictEqual({ slug: "masked" });
  });

  it("reports a flag with no value as one structured error", async () => {
    const result = await runMotifIn(tempHome(), ["series", "list", "--format"]);

    expect(result.code).toBe(2);
    expect(parseJson(result.stderr.trim())).toMatchObject({
      code: "INVALID_OPTION",
    });
  });
});
