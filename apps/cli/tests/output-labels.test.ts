import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

import { FAL_TOOLS } from "@howells/motif-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveOutputLabels } from "../src/commands/tool-run";
import { downloadAll } from "../src/utils/image";

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

describe("downloadAll output labels", () => {
  it("names a 5-map PBR set semantically", async () => {
    stubFetch();
    const dir = await mkdtemp(join(tmpdir(), "lbl-"));
    const maps = ["basecolor", "normal", "roughness", "metalness", "height"];
    const artifacts = maps.map((_, i) => ({
      key: "images",
      url: `https://x/${i}.png`,
    }));
    const written = await downloadAll(artifacts, dir, { images: maps });
    expect(written.map((w) => basename(w.path))).toEqual(
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
    const artifacts = requested.map((_, i) => ({
      key: "images",
      url: `https://x/${i}.png`,
    }));
    const written = await downloadAll(artifacts, dir, { images: requested });
    expect(written.map((w) => basename(w.path))).toEqual(
      requested.map((m) => `${m}.png`)
    );
  });

  it("falls back to positional names when the count does not match", async () => {
    stubFetch();
    const dir = await mkdtemp(join(tmpdir(), "lbl-"));
    const artifacts = [0, 1].map((i) => ({
      key: "images",
      url: `https://x/${i}.png`,
    }));
    const written = await downloadAll(artifacts, dir, {
      images: ["basecolor", "normal", "roughness", "metalness", "height"],
    });
    expect(written.map((w) => basename(w.path))).toEqual([
      "images.png",
      "images-2.png",
    ]);
  });

  it("is unchanged when no labels are given", async () => {
    stubFetch();
    const dir = await mkdtemp(join(tmpdir(), "lbl-"));
    const artifacts = [0, 1].map((i) => ({
      key: "masks",
      url: `https://x/${i}.png`,
    }));
    const written = await downloadAll(artifacts, dir);
    expect(written.map((w) => basename(w.path))).toEqual([
      "masks.png",
      "masks-2.png",
    ]);
  });
});

describe("resolveOutputLabels", () => {
  const patina = FAL_TOOLS.patina;
  const DEFAULT_MAPS = [
    "basecolor",
    "normal",
    "roughness",
    "metalness",
    "height",
  ];

  it("prefers the request's own maps array over the schema default", () => {
    const maps = ["normal", "basecolor", "roughness", "metalness", "height"];
    expect(resolveOutputLabels(patina, { image_url: "u", maps })).toEqual({
      images: maps,
    });
  });

  it("uses a subset exactly as requested", () => {
    expect(
      resolveOutputLabels(patina, { maps: ["roughness", "height"] })
    ).toEqual({ images: ["roughness", "height"] });
  });

  it("falls back to the schema default when the option is absent", () => {
    expect(resolveOutputLabels(patina, { image_url: "u" })).toEqual({
      images: DEFAULT_MAPS,
    });
  });

  it("falls back when the option is not an array of strings", () => {
    expect(resolveOutputLabels(patina, { maps: [1, 2] })).toEqual({
      images: DEFAULT_MAPS,
    });
  });

  it("returns undefined for a tool that declares no labels", () => {
    expect(resolveOutputLabels(FAL_TOOLS.ddcolor, {})).toBeUndefined();
  });
});
