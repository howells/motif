import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { spawnEnv } from "./cli-env";

/**
 * Commander raises its own argument errors — missing arguments, unknown
 * options — through a channel that bypasses the CLI's error contract. These
 * cover the wiring that routes them back into it: an RFC 7807 envelope on
 * stderr and exit `2`, while `--help` and `--version` still print and exit `0`.
 */

interface CliResult {
  code: number;
  stderr: string;
  stdout: string;
}

const tempHomes: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "motif-commander-errors-"));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEnvelope(result: CliResult): Record<string, unknown> {
  const payload: unknown = JSON.parse(result.stderr.trim());
  if (!isRecord(payload)) {
    throw new TypeError(`Expected a JSON object on stderr: ${result.stderr}`);
  }
  return payload;
}

afterEach(() => {
  while (tempHomes.length > 0) {
    const dir = tempHomes.pop();
    if (dir !== undefined) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe("commander argument errors", () => {
  it("emits an RFC 7807 envelope for a missing required argument", async () => {
    const result = await runMotif(["segment", "--format", "json"]);

    const envelope = parseEnvelope(result);
    expect(envelope).toMatchObject({
      code: "INVALID_OPTION",
      error: true,
      is_retriable: false,
      status: 400,
      title: "Invalid Option",
      type: "urn:motif:error:invalid-option",
    });
    expect(envelope.message).toBe("missing required argument 'prompt'");
    expect(Array.isArray(envelope.suggestions)).toBeTruthy();
    expect(result.stdout).toBe("");
  });

  it("exits 2 for a missing required argument", async () => {
    const result = await runMotif(["segment", "--format", "json"]);
    expect(result.code).toBe(2);
  });

  it("treats an unknown option the same way", async () => {
    const result = await runMotif([
      "segment",
      "a bowl",
      "--nonsense",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(2);
    const envelope = parseEnvelope(result);
    expect(envelope.code).toBe("INVALID_OPTION");
    expect(envelope.message).toBe("unknown option '--nonsense'");
  });

  it("routes the tool program's argument errors too", async () => {
    const result = await runMotif(["tool", "run", "--format", "json"]);

    expect(result.code).toBe(2);
    const envelope = parseEnvelope(result);
    expect(envelope.code).toBe("INVALID_OPTION");
    expect(envelope.message).toBe("missing required argument 'tool'");
  });

  it("routes the series program's argument errors too", async () => {
    const result = await runMotif(["series", "show", "--format", "json"]);

    expect(result.code).toBe(2);
    const envelope = parseEnvelope(result);
    expect(envelope.code).toBe("INVALID_OPTION");
    expect(envelope.message).toBe("missing required argument 'slug'");
  });

  it("routes the root program's unknown options", async () => {
    const result = await runMotif(["--bogus-flag", "--format", "json"]);

    expect(result.code).toBe(2);
    const envelope = parseEnvelope(result);
    expect(envelope.code).toBe("INVALID_OPTION");
    expect(envelope.message).toBe("unknown option '--bogus-flag'");
  });

  it("reports the same failure in human format", async () => {
    const result = await runMotif(["segment", "--format", "human"]);

    expect(result.code).toBe(2);
    expect(result.stderr.trim()).toBe(
      "Error [INVALID_OPTION]: missing required argument 'prompt'"
    );
  });
});

describe("help and version are not failures", () => {
  it("prints verb help and exits 0", async () => {
    const result = await runMotif(["segment", "--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: motif segment");
    expect(result.stdout).toContain("Segment prompted objects out of an image");
    expect(result.stderr).toBe("");
  });

  it("prints tool help and exits 0", async () => {
    const result = await runMotif(["tool", "run", "--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: motif tool run");
    expect(result.stderr).toBe("");
  });

  it("prints series help and exits 0", async () => {
    const result = await runMotif(["series", "--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: motif series");
    expect(result.stderr).toBe("");
  });

  it("prints root help and version and exits 0", async () => {
    const help = await runMotif(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Usage: motif");

    const version = await runMotif(["--version"]);
    expect(version.code).toBe(0);
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("still prints usage and exits 0 with no arguments", async () => {
    const result = await runMotif([]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: motif");
  });
});
