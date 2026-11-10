import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { derivedOutputPath, saveFiles } from "../src/utils/output-files";

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let testDir: string | undefined;

afterEach(() => {
  vi.unstubAllGlobals();
  if (testDir !== undefined && testDir !== "") {
    rmSync(testDir, { force: true, recursive: true });
    testDir = undefined;
  }
});

function stubPngFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      arrayBuffer: async () => Buffer.from(PNG_1X1, "base64").buffer,
      headers: new Headers({ "content-type": "image/png" }),
      ok: true,
      statusText: "OK",
    }))
  );
}

describe(saveFiles, () => {
  it("names files after their key, suffixing repeats positionally", async () => {
    testDir = mkdtempSync(join(tmpdir(), "motif-tool-outputs-"));
    stubPngFetch();

    const { written } = await saveFiles(
      [
        { key: "masks", url: "https://fal.media/m1.png" },
        { key: "masks", url: "https://fal.media/m2.png" },
        { key: "masks", url: "https://fal.media/m3.png" },
      ],
      { directory: testDir }
    );

    expect(written.map((file) => file.path)).toStrictEqual([
      join(testDir, "masks.png"),
      join(testDir, "masks-2.png"),
      join(testDir, "masks-3.png"),
    ]);
    expect(readdirSync(testDir).sort()).toStrictEqual([
      "masks-2.png",
      "masks-3.png",
      "masks.png",
    ]);
  });

  it("gives each key its own name and reports size and key", async () => {
    testDir = mkdtempSync(join(tmpdir(), "motif-tool-outputs-"));
    stubPngFetch();

    const { written } = await saveFiles(
      [
        { key: "image", url: "https://fal.media/a.png" },
        { key: "mask_image", url: "https://fal.media/b.png" },
      ],
      { directory: testDir }
    );

    expect(written.map((file) => file.key)).toStrictEqual([
      "image",
      "mask_image",
    ]);
    expect(written.map((file) => file.path)).toStrictEqual([
      join(testDir, "image.png"),
      join(testDir, "mask_image.png"),
    ]);
    expect(written.every((file) => file.size.length > 0)).toBe(true);
  });

  it("creates the target directory and ignores url query strings", async () => {
    testDir = mkdtempSync(join(tmpdir(), "motif-tool-outputs-"));
    stubPngFetch();
    const nested = join(testDir, "out", "run");

    const { written } = await saveFiles(
      [{ key: "image", url: "https://fal.media/a.png?token=abc" }],
      { directory: nested }
    );

    expect(written[0]?.path).toBe(join(nested, "image.png"));
  });

  it("writes inline data in a directory, naming it from the bytes", async () => {
    testDir = mkdtempSync(join(tmpdir(), "motif-tool-outputs-"));

    const { written } = await saveFiles(
      [{ key: "image", url: `data:image/png;base64,${PNG_1X1}` }],
      { directory: testDir }
    );

    expect(written.map((file) => basename(file.path))).toStrictEqual([
      "image.png",
    ]);
  });
});

describe(derivedOutputPath, () => {
  it("writes beside a source, but not through a symlinked directory that leaves the output root", () => {
    testDir = realpathSync(mkdtempSync(join(tmpdir(), "motif-derived-")));
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "motif-away-")));
    const cwd = join(testDir, "work");
    mkdirSync(join(cwd, "real"), { recursive: true });
    symlinkSync(outside, join(cwd, "escape"));
    symlinkSync(join(cwd, "real"), join(cwd, "alias"));
    const here = vi.spyOn(process, "cwd").mockReturnValue(cwd);
    try {
      expect(
        derivedOutputPath(join(cwd, "alias", "in.png"), "-cutout", ".png")
      ).toBe(join(cwd, "alias", "in-cutout.png"));
      expect(
        derivedOutputPath(join(cwd, "escape", "in.png"), "-cutout", ".png")
      ).toBe(join(cwd, "in-cutout.png"));
    } finally {
      here.mockRestore();
      rmSync(outside, { force: true, recursive: true });
    }
  });
});
