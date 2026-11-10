import { spawn } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach } from "vitest";

import { spawnEnv } from "./cli-env";

/**
 * Helpers for tests that drive the CLI's run paths against the fake fal
 * (tests/fixtures/fake-fal). Nothing here reaches the network; the project is a
 * temp directory that is also HOME.
 */

export const CLI_ROOT = join(import.meta.dirname, "..");
const TSX = pathToFileURL(
  join(CLI_ROOT, "node_modules/tsx/dist/esm/index.mjs")
);
const FAKE_FAL = pathToFileURL(join(CLI_ROOT, "tests/fixtures/fake-fal.ts"));
export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
export const REMOTE_PNG = { url: "https://cdn.fake/out.png" };
export const INLINE_PNG = {
  url: `data:image/png;base64,${PNG_1X1.toString("base64")}`,
};

const projects: string[] = [];

/** A fresh project directory holding `in.png`; it is also HOME. */
export function project(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "motif-pipelines-")));
  projects.push(dir);
  writeFileSync(join(dir, "in.png"), PNG_1X1);
  return dir;
}

afterEach(() => {
  for (const dir of projects.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

export interface Run {
  code: number;
  stderr: string;
  stdout: string;
}

export async function motif(
  dir: string,
  args: string[],
  result: Record<string, unknown>,
  env: NodeJS.ProcessEnv = {}
): Promise<Run> {
  const child = spawn(
    process.execPath,
    [
      "--import",
      TSX.href,
      "--import",
      FAKE_FAL.href,
      join(CLI_ROOT, "src/index.ts"),
      ...args,
    ],
    {
      cwd: dir,
      env: spawnEnv({
        CI: "1",
        FAKE_FAL_RESULT: JSON.stringify(result),
        FAL_KEY: "test-key",
        HOME: dir,
        USERPROFILE: dir,
        ...env,
      }),
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
  child.stdin.end();
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
  const code = await new Promise<number>((resolve) => {
    child.on("close", (exitCode) => {
      resolve(exitCode ?? -1);
    });
  });
  return { code, stderr, stdout };
}

export function json(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text.trim());
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`expected a JSON object, got ${text}`);
  }
  return Object.fromEntries(Object.entries(value));
}

export function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new TypeError("expected an array");
  }
  return value.map((entry) => json(JSON.stringify(entry)));
}

export function history(dir: string): Record<string, unknown>[] {
  const file = json(readFileSync(join(dir, ".motif/history.json"), "utf-8"));
  return objects(file.generations);
}
