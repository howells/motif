import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { spawnEnv } from "./cli-env";

interface PackFile {
  path: string;
}

interface PackResult {
  files: PackFile[];
  name: string;
}

interface RunResult {
  code: number;
  stderr: string;
  stdout: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPackResult(value: unknown): value is PackResult {
  return typeof value === "object" && value !== null && "files" in value;
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

async function npmPackDryRun(packagePath: string): Promise<PackResult> {
  const result = await runCommand(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    packagePath
  );
  expect(result.code, result.stderr).toBe(0);
  const parsed: unknown = JSON.parse(result.stdout);
  if (!Array.isArray(parsed)) {
    throw new TypeError("expected npm pack --json to return an array");
  }
  const first: unknown = parsed[0];
  if (!isPackResult(first)) {
    throw new Error("expected an npm pack result object");
  }
  return first;
}

function expectPublicPackage(pack: PackResult, expectedFiles: string[]) {
  const files = pack.files.map((file) => file.path).toSorted();
  expect(files).toStrictEqual(expectedFiles.toSorted());
  expect(files.some((file) => file.includes("apps/web"))).toBeFalsy();
  expect(files.some((file) => file.includes(".env"))).toBeFalsy();
  expect(files.some((file) => file.includes("src/"))).toBeFalsy();
  expect(
    files.every(
      (file) =>
        file === "package.json" ||
        file === "README.md" ||
        file === "AGENTS.md" ||
        /^docs\/[\w-]+\.md$/.test(file) ||
        file.startsWith("dist/") ||
        file.startsWith("bin/")
    )
  ).toBeTruthy();
}

describe("package smoke", () => {
  it("imports the public SDK", async () => {
    const sdk = await import("@howells/motif-sdk");

    expect(sdk.FalClient).toBeTypeOf("function");
    expect(sdk.FAL_TOOLS["sam3-image"].endpoint).toBe("fal-ai/sam-3/image");
  });

  it("runs the built CLI binary without a Fal key", async () => {
    const cliBin = resolve(repoRoot, "apps/cli/bin/motif");
    expect(
      existsSync(resolve(repoRoot, "apps/cli/dist/index.js"))
    ).toBeTruthy();

    const help = await runCommand(
      process.execPath,
      [cliBin, "--help"],
      repoRoot
    );
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Usage:");
    expect(help.stdout).toContain("motif studio");

    const dryRun = await runCommand(
      process.execPath,
      [
        cliBin,
        "studio portrait",
        "--model",
        "gpt",
        "--aspect",
        "16:9",
        "--background",
        "transparent",
        "--quality",
        "medium",
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
    expect(payload).toMatchObject({
      endpoint: "fal-ai/gpt-image-1.5",
      valid: true,
    });
    expect(payload.body).toMatchObject({
      background: "transparent",
      image_size: "1536x1024",
      quality: "medium",
    });
  });

  it("keeps public package tarballs limited to allowlisted files", async () => {
    const sdkPack = await npmPackDryRun(
      resolve(repoRoot, "packages/motif-sdk")
    );
    expectPublicPackage(sdkPack, [
      "README.md",
      "dist/image.d.ts",
      "dist/image.js",
      "dist/index.cjs",
      "dist/index.d.cts",
      "dist/index.d.ts",
      "dist/index.js",
      "package.json",
    ]);

    const cliPack = await npmPackDryRun(resolve(repoRoot, "apps/cli"));
    // The agent guide and its reference pages ship so an installed CLI can be
    // driven from its own docs; the pages are read from disk so a new one is
    // allowed without editing this list, while the guard above still admits
    // only Markdown from docs/.
    const cliDocs = readdirSync(resolve(repoRoot, "apps/cli/docs")).map(
      (file) => `docs/${file}`
    );
    expectPublicPackage(cliPack, [
      "AGENTS.md",
      "README.md",
      "bin/motif",
      "dist/index.js",
      "package.json",
      ...cliDocs,
    ]);
  }, 30_000);
});
