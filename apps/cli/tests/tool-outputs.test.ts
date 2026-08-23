import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { collectUrls, downloadAll } from "../src/utils/image";

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

describe("collectUrls", () => {
  it("returns a bare https string under its key", () => {
    expect(
      collectUrls({ image: "https://fal.media/a.png" }, ["image"])
    ).toEqual([{ key: "image", url: "https://fal.media/a.png" }]);
  });

  it("returns the url field of an object-shaped output", () => {
    expect(
      collectUrls({ image: { url: "https://fal.media/a.png", width: 8 } }, [
        "image",
      ])
    ).toEqual([{ key: "image", url: "https://fal.media/a.png" }]);
  });

  it("flattens every entry of an array, not just the first", () => {
    const result = {
      masks: [
        { url: "https://fal.media/m1.png" },
        { url: "https://fal.media/m2.png" },
        { url: "https://fal.media/m3.png" },
      ],
    };

    expect(collectUrls(result, ["masks"])).toEqual([
      { key: "masks", url: "https://fal.media/m1.png" },
      { key: "masks", url: "https://fal.media/m2.png" },
      { key: "masks", url: "https://fal.media/m3.png" },
    ]);
  });

  it("walks keys in registry order across mixed shapes", () => {
    const result = {
      ignored: "not a url",
      mesh: { url: "https://fal.media/scene.glb" },
      textures: ["https://fal.media/t1.png", "https://fal.media/t2.png"],
    };

    expect(collectUrls(result, ["mesh", "textures", "missing"])).toEqual([
      { key: "mesh", url: "https://fal.media/scene.glb" },
      { key: "textures", url: "https://fal.media/t1.png" },
      { key: "textures", url: "https://fal.media/t2.png" },
    ]);
  });

  it("skips non-https strings and values with no url", () => {
    const result = {
      image: "data:image/png;base64,AAAA",
      meta: { score: 0.9 },
      tags: [1, 2, 3],
    };

    expect(collectUrls(result, ["image", "meta", "tags"])).toEqual([]);
  });
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

describe("downloadAll", () => {
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

    expect(written.map((file) => file.path)).toEqual([
      join(testDir, "masks.png"),
      join(testDir, "masks-2.png"),
      join(testDir, "masks-3.png"),
    ]);
    expect(readdirSync(testDir).sort()).toEqual([
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

    expect(written.map((file) => file.key)).toEqual(["image", "mask_image"]);
    expect(written.map((file) => file.path)).toEqual([
      join(testDir, "image.png"),
      join(testDir, "mask_image.png"),
    ]);
    expect(written.every((file) => file.size.length > 0)).toBe(true);
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
