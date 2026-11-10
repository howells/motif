import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FORMAT_PRESETS } from "@howells/motif-sdk";
import { afterAll, describe, expect, it } from "vitest";

import { runMotifIn } from "./cli-env";

const home = mkdtempSync(join(tmpdir(), "motif-presets-"));

afterAll(() => {
  rmSync(home, { force: true, recursive: true });
});

function parse(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null) {
    throw new Error("expected a JSON object");
  }
  return Object.fromEntries(Object.entries(value));
}

describe("format presets come from the SDK table", () => {
  it.each(Object.entries(FORMAT_PRESETS))(
    "--%s sets the table's aspect and resolution",
    async (id, preset) => {
      const flag = await runMotifIn(home, [
        "x",
        `--${id}`,
        "--dry-run",
        "--format",
        "json",
      ]);
      expect(flag.code).toBe(0);
      expect(parse(flag.stdout)).toMatchObject({
        aspect: preset.aspect,
        resolution: preset.resolution ?? "2K",
      });
    }
  );

  it("lists every preset in --describe generate, sorted by id", async () => {
    const result = await runMotifIn(home, [
      "--describe",
      "generate",
      "--format",
      "json",
    ]);
    const { presets } = parse(result.stdout);
    if (typeof presets !== "object" || presets === null) {
      throw new Error("describe has no presets object");
    }
    expect(Object.keys(presets)).toStrictEqual(
      Object.keys(FORMAT_PRESETS).toSorted()
    );
  });
});
