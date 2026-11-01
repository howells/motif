import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { previewWidthOf, resizeImage } from "./resize";

describe(previewWidthOf, () => {
  it("takes only the widths next/image asks for", () => {
    expect(previewWidthOf(null)).toBeNull();
    expect(previewWidthOf("640")).toBe(640);
    expect(previewWidthOf("641")).toBeUndefined();
    expect(previewWidthOf("abc")).toBeUndefined();
  });
});

describe(resizeImage, () => {
  it("makes a smaller WebP copy, never a larger one", async () => {
    const original = await sharp({
      create: {
        background: { b: 40, g: 120, r: 200 },
        channels: 3,
        height: 1024,
        width: 2048,
      },
    })
      .png()
      .toBuffer();

    const small = await sharp(await resizeImage(original, 640)).metadata();
    expect(small).toMatchObject({ format: "webp", height: 320, width: 640 });

    const same = await sharp(await resizeImage(original, 3840)).metadata();
    expect(same.width).toBe(2048);
  });
});
