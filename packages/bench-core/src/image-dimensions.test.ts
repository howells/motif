import { describe, expect, it } from "vitest";

import { sniffImageDimensions } from "./image-dimensions";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const riffWebpPrefix = (fourCc: string, chunkSize: number): Buffer => {
  const header = Buffer.alloc(20);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(0, 4); // RIFF size, unused by the parser
  header.write("WEBP", 8, "ascii");
  header.write(fourCc, 12, "ascii");
  header.writeUInt32LE(chunkSize, 16);
  return header;
};

describe("sniffImageDimensions", () => {
  it("returns null for an unrecognized or too-short buffer", () => {
    expect(sniffImageDimensions(Buffer.from([]))).toBeNull();
    expect(sniffImageDimensions(Buffer.from([0x00, 0x01, 0x02]))).toBeNull();
    expect(sniffImageDimensions(Buffer.alloc(40))).toBeNull();
  });

  describe("PNG", () => {
    it("reads width/height from the IHDR chunk", () => {
      // 8-byte signature + 4-byte chunk length + "IHDR" + width(4 BE) + height(4 BE).
      const png = Buffer.alloc(24);
      for (const [index, byte] of PNG_SIGNATURE.entries()) {
        png[index] = byte;
      }
      png.writeUInt32BE(13, 8); // IHDR chunk data length
      png.write("IHDR", 12, "ascii");
      png.writeUInt32BE(100, 16);
      png.writeUInt32BE(200, 20);

      expect(sniffImageDimensions(png)).toEqual({ height: 200, width: 100 });
    });

    it("rejects a buffer with the right length but the wrong signature", () => {
      const notPng = Buffer.alloc(24);
      expect(sniffImageDimensions(notPng)).toBeNull();
    });
  });

  describe("JPEG", () => {
    it("reads height/width from an SOF0 segment", () => {
      const jpeg = Buffer.from([
        0xff,
        0xd8, // SOI
        0xff,
        0xc0, // SOF0 marker
        0x00,
        0x11, // segment length (not load-bearing for this parser)
        0x08, // sample precision
        0x01,
        0x2c, // height = 300
        0x01,
        0x90, // width = 400
      ]);
      expect(sniffImageDimensions(jpeg)).toEqual({ height: 300, width: 400 });
    });

    it("skips non-SOF segments (e.g. APP0/JFIF) before finding SOF0", () => {
      const jpeg = Buffer.concat([
        Buffer.from([0xff, 0xd8]), // SOI
        Buffer.from([0xff, 0xe0, 0x00, 0x04, 0xaa, 0xbb]), // APP0, length 4 -> 2 payload bytes
        Buffer.from([0xff, 0xc2, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0xc8]), // SOF2: h=100, w=200
      ]);
      expect(sniffImageDimensions(jpeg)).toEqual({ height: 100, width: 200 });
    });

    it("returns null when EOI is reached with no SOF segment", () => {
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
      expect(sniffImageDimensions(jpeg)).toBeNull();
    });

    it("rejects a buffer without the SOI marker", () => {
      expect(
        sniffImageDimensions(Buffer.from([0x00, 0x00, 0x00, 0x00]))
      ).toBeNull();
    });
  });

  describe("WebP", () => {
    it("reads canvas width/height from a VP8X (extended) chunk", () => {
      const header = riffWebpPrefix("VP8X", 10);
      const payload = Buffer.alloc(10);
      payload[0] = 0x00; // flags
      // reserved: payload[1..3]
      const width = 640;
      const height = 480;
      payload.writeUIntLE(width - 1, 4, 3);
      payload.writeUIntLE(height - 1, 7, 3);
      const webp = Buffer.concat([header, payload]);

      expect(sniffImageDimensions(webp)).toEqual({ height, width });
    });

    it("reads width/height from a VP8 (lossy) chunk", () => {
      const header = riffWebpPrefix("VP8 ", 10);
      const payload = Buffer.alloc(10);
      // 3-byte frame tag + 3-byte start code (0x9d 0x01 0x2a) — unparsed but present for realism.
      payload[3] = 0x9d;
      payload[4] = 0x01;
      payload[5] = 0x2a;
      const width = 800;
      const height = 600;
      payload.writeUInt16LE(width, 6);
      payload.writeUInt16LE(height, 8);
      const webp = Buffer.concat([header, payload]);

      expect(sniffImageDimensions(webp)).toEqual({ height, width });
    });

    it("reads width/height from a VP8L (lossless) chunk", () => {
      const header = riffWebpPrefix("VP8L", 5);
      const payload = Buffer.alloc(5);
      payload[0] = 0x2f; // VP8L signature
      const width = 1024;
      const height = 768;
      // Packed field: low 14 bits = width-1, next 14 bits = height-1.
      const packed = (height - 1) * 16_384 + (width - 1);
      payload.writeUInt32LE(packed, 1);
      const webp = Buffer.concat([header, payload]);

      expect(sniffImageDimensions(webp)).toEqual({ height, width });
    });

    it("returns null for a RIFF/WEBP container with an unrecognized chunk id", () => {
      const header = riffWebpPrefix("ANIM", 10);
      const webp = Buffer.concat([header, Buffer.alloc(10)]);
      expect(sniffImageDimensions(webp)).toBeNull();
    });
  });
});
