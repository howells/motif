import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";

import { commandSchema } from "../src/commands/describe/derive";
import {
  ANSWER_FLAGS,
  GLOBAL_INPUTS,
  propertyKeys,
} from "../src/commands/describe/notes";
import { buildProgram } from "../src/program";
import { runMotifIn, spawnEnv } from "./cli-env";

/**
 * One commander program serves every command. These pin what that program
 * routes and refuses, and that `--describe` is derived from it.
 */

const described = buildProgram([]).commands.filter(
  (command) => command.name() !== "studio"
);

const homes: string[] = [];

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), "motif-program-"));
  homes.push(dir);
  return dir;
}

afterEach(() => {
  while (homes.length > 0) {
    const dir = homes.pop();
    if (dir !== undefined) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

async function run(args: string[]) {
  return await runMotifIn(home(), args);
}

function json(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`Expected a JSON object: ${text}`);
  }
  return Object.fromEntries(Object.entries(parsed));
}

function findCommand(name: string): Command {
  const command = described.find((candidate) => candidate.name() === name);
  if (command === undefined) {
    throw new Error(`The program has no ${name} command`);
  }
  return command;
}

describe("routing", () => {
  it("runs generate for a bare prompt and for `generate`", async () => {
    const bare = await run(["a cat", "--dry-run", "--format", "json"]);
    const named = await run([
      "generate",
      "a cat",
      "--dry-run",
      "--format",
      "json",
    ]);
    expect(bare.code).toBe(0);
    expect(named.code).toBe(0);
    const { output: bareOutput, ...bareRest } = json(bare.stdout);
    const { output: namedOutput, ...namedRest } = json(named.stdout);
    expect(bareOutput).toMatch(/\.png$/);
    expect(namedOutput).toMatch(/\.png$/);
    expect(bareRest).toStrictEqual(namedRest);
  });

  it("refuses a command word as a prompt, with or without `generate`", async () => {
    for (const args of [
      ["history", "--format", "json"],
      ["generate", "history", "--format", "json"],
    ]) {
      const result = await run(args);
      expect(result.code).toBe(2);
      expect(json(result.stderr).code).toBe("RESERVED_PROMPT");
    }
  });

  it("names the command a task word means", async () => {
    const result = await run([
      "remove",
      "the car",
      "x.png",
      "--format",
      "json",
    ]);
    expect(result.code).toBe(2);
    expect(json(result.stderr).code).toBe("INVALID_OPTION");
    expect(json(result.stderr).details).toMatchObject({ task: "remove" });
  });

  it("takes stdin JSON for generate", async () => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/index.ts", "--dry-run", "--format", "json"],
      {
        cwd: process.cwd(),
        env: spawnEnv({ CI: "1", FAL_KEY: "", HOME: home() }),
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    let stdout = "";
    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stdin.end('{"prompt":"a sunset","preset":"og"}');
    const code = await new Promise<number>((resolve) => {
      child.on("close", (exitCode) => {
        resolve(exitCode ?? 0);
      });
    });
    expect(code).toBe(0);
    expect(json(stdout)).toMatchObject({ aspect: "16:9", prompt: "a sunset" });
  });

  it("does not wait on an open stdin when argv decides the action", async () => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/index.ts", "--last", "--format", "json"],
      {
        cwd: process.cwd(),
        env: spawnEnv({ CI: "1", FAL_KEY: "", HOME: home() }),
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    // stdin is never written to or closed: the command must finish anyway.
    const code = await new Promise<number>((resolve) => {
      child.on("close", (exitCode) => {
        resolve(exitCode ?? 0);
      });
    });
    expect(code).toBe(0);
  });

  it("takes --format and --fields before or after a series command", async () => {
    const before = await run(["series", "--format", "json", "list"]);
    const after = await run(["series", "list", "--format", "json"]);
    expect(before.code).toBe(0);
    expect(json(before.stdout)).toStrictEqual(json(after.stdout));
    const masked = await run([
      "series",
      "--fields",
      "total",
      "list",
      "--format",
      "json",
    ]);
    expect(json(masked.stdout)).toStrictEqual({ total: 0 });
  });

  it("answers --describe, --describe <id>, --history and --last", async () => {
    const all = await run(["--describe", "--format", "json"]);
    expect(Object.keys(json(all.stdout).commands ?? {})).toContain("series");
    const one = await run(["--describe", "series", "--format", "json"]);
    expect(json(one.stdout).command).toBe("series");
    const history = await run(["--history", "--format", "json"]);
    expect(json(history.stdout)).toMatchObject({ total: 0 });
    const last = await run(["--last", "--format", "json"]);
    expect(json(last.stdout)).toStrictEqual({ command: "last", result: null });
  });

  it("refuses an unknown option with a structured error", async () => {
    const result = await run(["a cat", "--bogus", "--format", "json"]);
    expect(result.code).toBe(2);
    expect(json(result.stderr).code).toBe("INVALID_OPTION");
  });
});

describe("--describe is derived from the program", () => {
  it("describes every command the program has except Studio", () => {
    expect(described.map((command) => command.name())).toContain("generate");
    expect(described.length).toBeGreaterThan(20);
  });

  it.each(described.map((command) => [command.name(), command] as const))(
    "%s lists every flag it takes",
    (name, command) => {
      const { properties } = commandSchema(command).input;
      const modes = properties.mode?.enum;
      const keys = propertyKeys(name);
      const flags = [command, ...command.commands]
        .flatMap((member) => member.options)
        .filter(
          (option) =>
            !option.negate &&
            !GLOBAL_INPUTS.has(option.attributeName()) &&
            !(
              name === "generate" &&
              ANSWER_FLAGS.includes(option.attributeName())
            )
        );
      for (const option of flags) {
        const key = keys[option.attributeName()] ?? option.attributeName();
        const isMode =
          Array.isArray(modes) && modes.includes(option.long?.slice(2));
        expect(
          key in properties || isMode,
          `${name} ${option.long} has no property ${key}`
        ).toBe(true);
      }
    }
  );

  it("lists a flag on vary that its schema once omitted", () => {
    expect(commandSchema(findCommand("vary")).input.properties).toHaveProperty(
      "markup"
    );
  });

  it("lists the flags generate's schema once omitted", () => {
    const { properties } = commandSchema(findCommand("generate")).input;
    for (const key of ["negativePrompt", "outputFormat", "preset", "dryRun"]) {
      expect(properties).toHaveProperty(key);
    }
  });
});
