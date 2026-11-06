import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { spawnEnv } from "./cli-env";

/**
 * Verifies that advanced generation flags survive parsing and normalization,
 * landing in the fal request body of a `--dry-run --format json` invocation.
 * Each flag is paired with a model whose config actually supports it.
 */

interface CliResult {
  code: number;
  stderr: string;
  stdout: string;
}

const tempHomes: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "motif-cli-flags-"));
  tempHomes.push(dir);
  return dir;
}

async function runMotif(args: string[]): Promise<CliResult> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts", ...args],
    {
      cwd: process.cwd(),
      env: spawnEnv({
        CI: "1",
        FAL_KEY: "",
        HOME: tempHome(),
      }),
      stdio: ["pipe", "pipe", "pipe"],
    }
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf-8");
  child.stderr.setEncoding("utf-8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.end("");

  return await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stderr, stdout });
    });
  });
}

async function dryRunBody(
  model: string,
  flags: string[]
): Promise<Record<string, unknown>> {
  const result = await runMotif([
    "a test prompt",
    "--dry-run",
    "--format",
    "json",
    "--model",
    model,
    ...flags,
  ]);
  expect(result.code, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  const payload: unknown = JSON.parse(result.stdout.trim());
  if (!isRecord(payload) || !isRecord(payload.request)) {
    throw new Error("expected a dry-run request object");
  }
  return payload.request;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

afterEach(() => {
  while (tempHomes.length > 0) {
    const dir = tempHomes.pop();
    if (dir !== undefined && dir !== "") {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe("advanced generation flags reach the request body", () => {
  it("--seed lands as body.seed (banana)", async () => {
    const body = await dryRunBody("banana", ["--seed", "42"]);
    expect(body.seed).toBe(42);
  });

  it("--negative lands as body.negative_prompt (qwen3)", async () => {
    const body = await dryRunBody("qwen3", ["--negative", "blurry, low-res"]);
    expect(body.negative_prompt).toBe("blurry, low-res");
  });

  it("--output-format lands as body.output_format (qwen3)", async () => {
    const body = await dryRunBody("qwen3", ["--output-format", "png"]);
    expect(body.output_format).toBe("png");
  });

  it("--param lands as the named body field with -m (recraft41)", async () => {
    const body = await dryRunBody("recraft41", [
      "--param",
      "style=realistic_image",
      "--param",
      "enable_safety_checker=false",
    ]);
    expect(body.style).toBe("realistic_image");
    expect(body.enable_safety_checker).toBe(false);
  });

  it("-o with an image extension asks for that format where the Model takes one (qwen3)", async () => {
    const body = await dryRunBody("qwen3", ["-o", "out.png"]);
    expect(body.output_format).toBe("png");
  });
});

describe("generation flags", () => {
  it("exits 2 with INVALID_OPTION for a flag the CLI does not have", async () => {
    const result = await runMotif([
      "a test prompt",
      "--dry-run",
      "--format",
      "json",
      "--style",
      "realistic_image",
    ]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr.trim())).toMatchObject({
      code: "INVALID_OPTION",
    });
  });

  it("refuses --param without -m before any call", async () => {
    const result = await runMotif([
      "a test prompt",
      "--dry-run",
      "--format",
      "json",
      "--param",
      "raw=true",
    ]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr.trim())).toMatchObject({
      code: "INVALID_OPTION",
    });
  });
});
