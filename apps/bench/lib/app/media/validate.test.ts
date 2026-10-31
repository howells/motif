import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  UPLOAD_LIMIT_BYTES,
  inspectOutput,
  inspectUpload,
  sniffImageType,
} from "./validate";

const image = async (
  format: "jpeg" | "png" | "webp",
  width = 64,
  height = 48
) =>
  await sharp({ create: { background: "#c08040", channels: 3, height, width } })
    .toFormat(format)
    .toBuffer();

describe("inspectUpload", () => {
  it("decides the type from the bytes, not the name", async () => {
    expect(sniffImageType(await image("jpeg"))).toBe("image/jpeg");
    expect(sniffImageType(await image("png"))).toBe("image/png");
    expect(sniffImageType(await image("webp"))).toBe("image/webp");
    expect(
      sniffImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))
    ).toBeNull();
  });

  it("refuses files that aren't JPEG, PNG or WebP", async () => {
    const gif = Buffer.from("R0lGODlhAQABAAAAACw=", "base64");
    await expect(inspectUpload(gif, "image")).resolves.toMatchObject({
      code: "NOT_AN_IMAGE",
      ok: false,
    });
    await expect(
      inspectUpload(new Uint8Array(), "image")
    ).resolves.toMatchObject({ code: "EMPTY_FILE" });
  });

  it("refuses a file whose header claims one type over a body that isn't it", async () => {
    const forged = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      await image("png"),
    ]);
    await expect(inspectUpload(forged, "image")).resolves.toMatchObject({
      ok: false,
    });
  });

  it("refuses anything over the request limit before decoding it", async () => {
    const big = Buffer.alloc(UPLOAD_LIMIT_BYTES + 1, 0xff);
    await expect(inspectUpload(big, "image")).resolves.toMatchObject({
      code: "FILE_TOO_LARGE",
    });
  });

  it("refuses images too small or too large on a side", async () => {
    await expect(
      inspectUpload(await image("png", 8, 64), "image")
    ).resolves.toMatchObject({
      code: "IMAGE_TOO_SMALL",
    });
    await expect(
      inspectUpload(await image("png", 4097, 32), "image")
    ).resolves.toMatchObject({
      code: "IMAGE_TOO_LARGE",
    });
  });

  it("accepts only a PNG as a mask", async () => {
    await expect(
      inspectUpload(await image("jpeg"), "mask")
    ).resolves.toMatchObject({ code: "MASK_NOT_PNG" });
    await expect(
      inspectUpload(await image("png"), "mask")
    ).resolves.toMatchObject({ ok: true });
  });

  it("re-encodes upright and drops metadata such as location", async () => {
    const tagged = await sharp(await image("jpeg", 64, 48))
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Copyright: "secret place" } })
      .jpeg()
      .toBuffer();
    const result = await inspectUpload(tagged, "image");
    expect(result).toMatchObject({
      contentType: "image/jpeg",
      height: 64,
      ok: true,
      width: 48,
    });
    if (!result.ok) {
      return;
    }
    const after = await sharp(result.bytes).metadata();
    expect(after.exif).toBeUndefined();
    expect(after.orientation ?? 1).toBe(1);
  });
});

describe("inspectOutput", () => {
  it("reads a provider image and rejects anything else", async () => {
    await expect(
      inspectOutput(await image("webp", 32, 32))
    ).resolves.toStrictEqual({
      contentType: "image/webp",
      height: 32,
      width: 32,
    });
    await expect(inspectOutput(Buffer.from("<html>"))).resolves.toBeNull();
  });
});
