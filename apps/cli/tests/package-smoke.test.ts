import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { spawnEnv } from "./cli-env";

interface RunResult {
  code: number;
  stderr: string;
  stdout: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const repoRoot = resolve(import.meta.dirname, "../../..");

async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<RunResult> {
  const child = spawn(command, args, {
    cwd,
    env: spawnEnv({
      CI: "1",
      FAL_KEY: "",
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });

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

  return await new Promise((resolveResult, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolveResult({ code: code ?? 0, stderr, stdout });
    });
  });
}

describe("package smoke", () => {
  it("runs the built CLI binary without a Fal key", async () => {
    const cliBin = resolve(repoRoot, "apps/cli/bin/motif");
    expect(existsSync(resolve(repoRoot, "apps/cli/dist/index.js"))).toBe(true);

    const help = await runCommand(
      process.execPath,
      [cliBin, "--help"],
      repoRoot
    );
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Usage:");

    const dryRun = await runCommand(
      process.execPath,
      [
        cliBin,
        "studio portrait",
        "--model",
        "gpt",
        "--aspect",
        "3:2",
        "--param",
        "background=transparent",
        "--param",
        "quality=medium",
        "--dry-run",
        "--format",
        "json",
      ],
      repoRoot
    );
    expect(dryRun.code).toBe(0);
    const payload: unknown = JSON.parse(dryRun.stdout);
    if (!isRecord(payload)) {
      throw new Error("expected a JSON object");
    }
    expect(payload).toMatchObject({ model: "gpt", valid: true });
    expect(payload.request).toMatchObject({
      background: "transparent",
      image_size: "1536x1024",
      quality: "medium",
    });
  });
});
