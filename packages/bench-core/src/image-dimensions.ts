/**
 * Header-only image dimension sniffing for the three formats
 * `ImageOutputFormat` covers (PNG, JPEG, WebP). No full decode, no pixel
 * data ever touched — just the fixed-offset fields each format's spec
 * defines, so this stays a small, dependency-free, synchronous read.
 *
 * Deliberately arithmetic (`%`/`Math.floor`) rather than bitwise (`&`/`>>`)
 * for bit-field extraction — same result, repo convention disallows
 * bitwise operators.
 *
 * `execute.ts` uses this on the bytes actually downloaded from fal to record
 * `bench_samples.width`/`height` — the SDK's `MotifImage.width`/`height` are
 * never used for this, per `BRIEF.md`: "Sniff actual returned W×H from the
 * image; never infer it."
 */

export interface ImageDimensions {
  readonly height: number;
  readonly width: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const sniffPng = (buffer: Buffer): ImageDimensions | null => {
  if (buffer.length < 24) {
    return null;
  }
  const isPng = PNG_SIGNATURE.every((byte, index) => buffer[index] === byte);
  if (!isPng) {
    return null;
  }
  return { height: buffer.readUInt32BE(20), width: buffer.readUInt32BE(16) };
};

// SOF markers carry the frame's dimensions. 0xC0-0xCF minus the three
// markers in that range that are not start-of-frame segments (0xC4 DHT,
// 0xC8 reserved/JPG, 0xCC DAC).
const NON_SOF_MARKERS_IN_RANGE = new Set([0xc4, 0xc8, 0xcc]);
const isSofMarker = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && !NON_SOF_MARKERS_IN_RANGE.has(marker);

// Markers with no length-prefixed payload to skip over: TEM (0x01) and the
// restart markers (0xD0-0xD9, which includes EOI — handled separately).
const isStandaloneMarker = (marker: number): boolean =>
  marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);

const sniffJpeg = (buffer: Buffer): ImageDimensions | null => {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer.readUInt8(offset + 1);
    if (marker === 0xd9) {
      return null; // EOI reached with no SOF segment found
    }
    if (isSofMarker(marker)) {
      if (offset + 9 > buffer.length) {
        return null;
      }
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += isStandaloneMarker(marker)
      ? 2
      : 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
};

// 14-bit field width, used to unpack WebP's VP8/VP8L bit-packed dimensions
// with arithmetic instead of bitwise `&`/`>>`.
const FOURTEEN_BIT_MODULUS = 16_384;

const sniffWebp = (buffer: Buffer): ImageDimensions | null => {
  // RIFF header (12) + chunk id (4) is the minimum to identify which WebP
  // sub-format follows; each branch below checks its own larger minimum.
  if (buffer.length < 16) {
    return null;
  }
  if (
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }
  const chunkId = buffer.toString("ascii", 12, 16);

  // VP8X (extended): 24-bit canvas width/height minus one, little-endian.
  if (chunkId === "VP8X") {
    if (buffer.length < 30) {
      return null;
    }
    return {
      height: 1 + buffer.readUIntLE(27, 3),
      width: 1 + buffer.readUIntLE(24, 3),
    };
  }

  // VP8 (lossy): 3-byte frame tag, 3-byte start code (0x9d 0x01 0x2a), then
  // 14-bit width/height fields (upper 2 bits of each 16-bit field are a
  // scale factor, discarded via modulus).
  if (chunkId === "VP8 ") {
    if (buffer.length < 30) {
      return null;
    }
    return {
      height: buffer.readUInt16LE(28) % FOURTEEN_BIT_MODULUS,
      width: buffer.readUInt16LE(26) % FOURTEEN_BIT_MODULUS,
    };
  }

  // VP8L (lossless): 1-byte signature (0x2f), then a packed 32-bit
  // little-endian field: low 14 bits = (width-1), next 14 bits = (height-1).
  if (chunkId === "VP8L") {
    if (buffer.length < 25) {
      return null;
    }
    const packed = buffer.readUInt32LE(21);
    return {
      height:
        (Math.floor(packed / FOURTEEN_BIT_MODULUS) % FOURTEEN_BIT_MODULUS) + 1,
      width: (packed % FOURTEEN_BIT_MODULUS) + 1,
    };
  }

  return null;
};

/** Detects PNG, JPEG, or WebP and returns its actual pixel dimensions from
 * the header — never from provider-reported metadata. Returns `null` for an
 * unrecognized or malformed header rather than throwing; a missing
 * dimension is not a generation failure. */
export const sniffImageDimensions = (buffer: Buffer): ImageDimensions | null =>
  sniffPng(buffer) ?? sniffJpeg(buffer) ?? sniffWebp(buffer);
