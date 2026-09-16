import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadAll } from "../src/utils/image";

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

describe(downloadAll, () => {
  it("names files after their key, suffixing repeats positionally", async () => {
    testDir = mkdtempSync(join(tmpdir(), "motif-tool-outputs-"));
    stubPngFetch();

    const written = await downloadAll(
      [
        { key: "masks", url: "https://fal.media/m1.png" },
        { key: "masks", url: "https://fal.media/m2.png" },
        { key: "masks", url: "https://fal.media/m3.png" },
      ],
      testDir
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

    const written = await downloadAll(
      [
        { key: "image", url: "https://fal.media/a.png" },
        { key: "mask_image", url: "https://fal.media/b.png" },
      ],
      testDir
    );

    expect(written.map((file) => file.key)).toStrictEqual([
      "image",
      "mask_image",
    ]);
    expect(written.map((file) => file.path)).toStrictEqual([
      join(testDir, "image.png"),
      join(testDir, "mask_image.png"),
    ]);
    expect(written.every((file) => file.size.length > 0)).toBeTruthy();
  });

  it("creates the target directory and ignores url query strings", async () => {
    testDir = mkdtempSync(join(tmpdir(), "motif-tool-outputs-"));
    stubPngFetch();
    const nested = join(testDir, "out", "run");

    const written = await downloadAll(
      [{ key: "image", url: "https://fal.media/a.png?token=abc" }],
      nested
    );

    expect(written[0]?.path).toBe(join(nested, "image.png"));
  });
});
