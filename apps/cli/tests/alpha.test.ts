import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  hasTransparentPixels,
  TransparencyMissingError,
} from "../src/utils/alpha";

const dir = mkdtempSync(join(tmpdir(), "motif-alpha-"));

async function fixture(
  name: string,
  channels: 3 | 4,
  alpha: number
): Promise<string> {
  const path = join(dir, name);
  await sharp({
    create: {
      background: { alpha, b: 40, g: 80, r: 200 },
      channels,
      height: 8,
      width: 8,
    },
  })
    .png()
    .toFile(path);
  return path;
}

describe(hasTransparentPixels, () => {
  it("accepts a PNG with fully transparent pixels", async () => {
    const path = await fixture("clear.png", 4, 0);
    await expect(hasTransparentPixels(path)).resolves.toBeTruthy();
  });

  it("refuses a PNG with no alpha channel", async () => {
    const path = await fixture("rgb.png", 3, 1);
    await expect(hasTransparentPixels(path)).resolves.toBeFalsy();
  });

  it("refuses a PNG whose alpha channel is opaque everywhere", async () => {
    const path = await fixture("opaque.png", 4, 1);
    await expect(hasTransparentPixels(path)).resolves.toBeFalsy();
  });
});

describe(TransparencyMissingError, () => {
  it("carries the catalogued code and the offending paths", () => {
    const error = new TransparencyMissingError(["/tmp/a.png"]);
    expect(error.code).toBe("TRANSPARENCY_MISSING");
    expect(error.paths).toStrictEqual(["/tmp/a.png"]);
    expect(error.message).toContain("no transparent pixels");
  });
});
