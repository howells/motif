import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runMotifIn } from "./cli-env";

/**
 * Which aspect and resolution `generate` sends to a Model. An unchosen 2K
 * resolution and an unchosen 1:1 aspect are left to the Model; a caller's
 * flag, a preset, a Look, or a config default other than 1:1 / 2K is sent.
 * Sending a resolution is visible on a Model that has none: `flux2-pro` takes
 * only an image size, so a 1K request for it has no Model.
 */

const homes: string[] = [];

function home(config: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "motif-size-"));
  homes.push(dir);
  mkdirSync(join(dir, ".motif"));
  writeFileSync(join(dir, ".motif/config.json"), JSON.stringify(config));
  return dir;
}

afterEach(() => {
  for (const dir of homes.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

async function dryRun(
  config: Record<string, unknown>,
  args: string[]
): Promise<Record<string, unknown>> {
  const run = await runMotifIn(home(config), [
    "x",
    ...args,
    "--dry-run",
    "--format",
    "json",
  ]);
  const text = run.code === 0 ? run.stdout : run.stderr;
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null) {
    throw new Error("expected a JSON object");
  }
  return Object.fromEntries(Object.entries(value));
}

describe("what generate sends", () => {
  it.each([
    [{}, ["-m", "flux2-pro"], undefined],
    // An explicit 2K is a request like any other: flux2-pro cannot make it.
    [{}, ["-m", "flux2-pro", "-r", "2K"], "NO_MODEL_AVAILABLE"],
    [{}, ["-m", "flux2-pro", "-r", "1K"], "NO_MODEL_AVAILABLE"],
    [{ defaultResolution: "1K" }, ["-m", "flux2-pro"], "NO_MODEL_AVAILABLE"],
    [{ defaultResolution: "2K" }, ["-m", "flux2-pro"], undefined],
    // A preset's resolution replaces the flag's: the 2K of --cover is what is
    // asked for, and flux2-pro cannot make it.
    [{}, ["-m", "flux2-pro", "--cover", "-r", "1K"], "NO_MODEL_AVAILABLE"],
    [{}, ["-m", "flux2-pro", "--cover"], undefined],
    [{}, ["--look", "editorial"], undefined],
    [{}, ["--look", "editorial", "-r", "1K"], "NO_MODEL_AVAILABLE"],
  ])("config %j, args %j -> error %s", async (config, args, code) => {
    const result = await dryRun(config, args);
    expect(result.code).toBe(code);
  });

  it.each([
    [{}, [], "1:1", "2K"],
    [{}, ["-a", "3:2"], "3:2", "2K"],
    [{}, ["-r", "1K"], "1:1", "1K"],
    [{}, ["--og"], "16:9", "2K"],
    [{}, ["--ultra"], "21:9", "2K"],
    [{}, ["--cover", "-r", "1K"], "2:3", "2K"],
    [{ defaultAspect: "3:2" }, [], "3:2", "2K"],
    [{ defaultResolution: "1K" }, [], "1:1", "1K"],
    [{}, ["--look", "interior"], "3:2", "2K"],
    [{ defaultAspect: "4:3" }, ["--look", "interior"], "3:2", "2K"],
  ])("config %j, args %j -> %s at %s", async (config, args, aspect, size) => {
    const result = await dryRun(config, args);
    expect(result).toMatchObject({ aspect, resolution: size });
    expect(result.request).toMatchObject(
      result.model === "banana21"
        ? { aspect_ratio: aspect, resolution: size }
        : {}
    );
  });
});
