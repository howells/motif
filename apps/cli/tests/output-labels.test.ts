import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename, dirname, resolve } from "node:path";

import { FAL_TOOLS } from "@howells/motif-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveOutputLabels } from "../src/commands/output-labels";
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

  it("names layers from the response, prefixed into stack order", async () => {
    stubFetch();
    const dir = await mkdtemp(join(tmpdir(), "lbl-"));
    const artifacts = [0, 1, 2].map((i) => ({
      key: "layers",
      url: `https://x/${i}.png`,
    }));
    const written = await downloadAll(artifacts, dir, {
      layers: ["0-background", "1-left-amber-glass-bottle", "2-pear"],
    });
    expect(written.map((w) => basename(w.path))).toEqual([
      "0-background.png",
      "1-left-amber-glass-bottle.png",
      "2-pear.png",
    ]);
  });

  it("keeps a hostile name inside the output directory", async () => {
    stubFetch();
    const dir = await mkdtemp(join(tmpdir(), "lbl-"));
    const layers = [
      { image: { url: "https://x/0.png" }, name: "../../etc/passwd" },
      { image: { url: "https://x/1.png" }, name: ".ssh/authorized_keys" },
    ];
    const labels = resolveOutputLabels(
      FAL_TOOLS["seedream-layerize"],
      { image_url: "u" },
      { layers }
    );
    const artifacts = layers.map((_, i) => ({
      key: "layers",
      url: `https://x/${i}.png`,
    }));
    const written = await downloadAll(artifacts, dir, labels);
    expect(written.map((w) => basename(w.path))).toEqual([
      "etc-passwd.png",
      "ssh-authorized-keys.png",
    ]);
    for (const file of written) {
      expect(dirname(file.path)).toBe(resolve(dir));
    }
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

function layer(name: unknown, zIndex: unknown) {
  return { bounding_box: { absolute: [0, 0, 1, 1] }, name, z_index: zIndex };
}

describe("resolveOutputLabels from response items", () => {
  const layerize = FAL_TOOLS["seedream-layerize"];
  const BODY = { image_url: "https://x/in.png" };

  it("slugifies each layer name and prefixes it with z_index", () => {
    const result = {
      layers: [
        layer("Background plate", 0),
        layer("Left amber glass bottle", 1),
        layer("Pear, half-eaten", 2),
      ],
    };
    expect(resolveOutputLabels(layerize, BODY, result)).toEqual({
      layers: [
        "0-background-plate",
        "1-left-amber-glass-bottle",
        "2-pear-half-eaten",
      ],
    });
  });

  it("strips a path separator, a traversal, and a leading dot out of a name", () => {
    const result = {
      layers: [
        layer("../../etc/passwd", 0),
        layer(".hidden\u0000name", 1),
        layer("a/b\\c", 2),
      ],
    };
    expect(resolveOutputLabels(layerize, BODY, result)).toEqual({
      layers: ["0-etc-passwd", "1-hidden-name", "2-a-b-c"],
    });
  });

  it("caps a very long name", () => {
    const result = { layers: [layer("z".repeat(200), 0)] };
    const labels = resolveOutputLabels(layerize, BODY, result);
    expect(labels?.layers[0]).toBe(`0-${"z".repeat(48)}`);
  });

  it("does not let two identically named layers collide", () => {
    const result = {
      layers: [layer("Bottle"), layer("bottle")],
    };
    expect(resolveOutputLabels(layerize, BODY, result)).toEqual({
      layers: ["bottle", "bottle-2"],
    });
  });

  it("drops the prefixes entirely when one z_index is missing", () => {
    const result = { layers: [layer("Background", 0), layer("Pear", null)] };
    expect(resolveOutputLabels(layerize, BODY, result)).toEqual({
      layers: ["background", "pear"],
    });
  });

  it("falls back to positional naming when a name is missing", () => {
    const result = { layers: [layer("Background", 0), layer(undefined, 1)] };
    expect(resolveOutputLabels(layerize, BODY, result)).toBeUndefined();
  });

  it("falls back to positional naming when a name is not a string", () => {
    const result = { layers: [layer(7, 0), layer("Pear", 1)] };
    expect(resolveOutputLabels(layerize, BODY, result)).toBeUndefined();
  });

  it("falls back to positional naming when a name slugifies to nothing", () => {
    const result = { layers: [layer("...", 0), layer("Pear", 1)] };
    expect(resolveOutputLabels(layerize, BODY, result)).toBeUndefined();
  });

  it("falls back to positional naming with no result to read", () => {
    expect(resolveOutputLabels(layerize, BODY)).toBeUndefined();
  });

  it("falls back to positional naming when the output key is not an array", () => {
    expect(
      resolveOutputLabels(layerize, BODY, {
        layers: { url: "https://x/0.png" },
      })
    ).toBeUndefined();
  });
});
