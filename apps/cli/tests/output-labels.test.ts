import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { saveFiles } from "../src/utils/output-files";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(PNG, {
        headers: { "content-type": "image/png" },
        status: 200,
      })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saveFiles output labels", () => {
  it("names a 5-map PBR set semantically", async () => {
    stubFetch();
    const dir = await mkdtemp(join(tmpdir(), "lbl-"));
    const maps = ["basecolor", "normal", "roughness", "metalness", "height"];
    const written = await saveFiles(
      maps.map((label, i) => ({
        key: "images",
        label,
        url: `https://x/${i}.png`,
      })),
      { directory: dir }
    );
    expect(written.map((w) => basename(w.path))).toStrictEqual(
      maps.map((m) => `${m}.png`)
    );
  });

  it("follows a reordered request option rather than the schema default", async () => {
    stubFetch();
    const dir = await mkdtemp(join(tmpdir(), "lbl-"));
    // What patina returns when the caller reorders `maps`. Labelling these in
    // the schema's default order would name the normal map "basecolor".
    const requested = [
      "normal",
      "basecolor",
      "roughness",
      "metalness",
      "height",
    ];
    const written = await saveFiles(
      requested.map((label, i) => ({
        key: "images",
        label,
        url: `https://x/${i}.png`,
      })),
      { directory: dir }
    );
    expect(written.map((w) => basename(w.path))).toStrictEqual(
      requested.map((m) => `${m}.png`)
    );
  });

  it("falls back to positional names when only some files are labelled", async () => {
    stubFetch();
    const dir = await mkdtemp(join(tmpdir(), "lbl-"));
    const written = await saveFiles(
      [
        { key: "images", label: "basecolor", url: "https://x/0.png" },
        { key: "images", url: "https://x/1.png" },
      ],
      { directory: dir }
    );
    expect(written.map((w) => basename(w.path))).toStrictEqual([
      "images.png",
      "images-2.png",
    ]);
  });

  it("names layers from the response, prefixed into stack order", async () => {
    stubFetch();
    const dir = await mkdtemp(join(tmpdir(), "lbl-"));
    const layers = ["0-background", "1-left-amber-glass-bottle", "2-pear"];
    const written = await saveFiles(
      layers.map((label, i) => ({
        key: "layers",
        label,
        url: `https://x/${i}.png`,
      })),
      { directory: dir }
    );
    expect(written.map((w) => basename(w.path))).toStrictEqual(
      layers.map((name) => `${name}.png`)
    );
  });

  it("is unchanged when no labels are given", async () => {
    stubFetch();
    const dir = await mkdtemp(join(tmpdir(), "lbl-"));
    const written = await saveFiles(
      [0, 1].map((i) => ({ key: "masks", url: `https://x/${i}.png` })),
      { directory: dir }
    );
    expect(written.map((w) => basename(w.path))).toStrictEqual([
      "masks.png",
      "masks-2.png",
    ]);
  });
});
