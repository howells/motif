/**
 * Pixel dimensions of an image passed as a data URL, read from its header
 * bytes: PNG IHDR, JPEG SOFn, WebP VP8, VP8L or VP8X. Pure: no I/O.
 */

import type { CustomImageSize } from "./types";

const DATA_URL_REGEX = /^data:[^;,]*;base64,(.*)$/s;

function decodeBase64(data: string): DataView | undefined {
  try {
    const bytes = Uint8Array.from(
      atob(data),
      (char) => char.codePointAt(0) ?? 0
    );
    return new DataView(bytes.buffer);
  } catch {
    return undefined;
  }
}

function byteAt(view: DataView, at: number): number {
  return at < view.byteLength ? view.getUint8(at) : 0;
}

function ascii(view: DataView, start: number, length: number): string {
  return String.fromCodePoint(
    ...Array.from({ length }, (_unused, index) => byteAt(view, start + index))
  );
}

function bigEndian16(view: DataView, at: number): number {
  return byteAt(view, at) * 256 + byteAt(view, at + 1);
}

function bigEndian32(view: DataView, at: number): number {
  return bigEndian16(view, at) * 65_536 + bigEndian16(view, at + 2);
}

function littleEndian16(view: DataView, at: number): number {
  return byteAt(view, at) + byteAt(view, at + 1) * 256;
}

function littleEndian24(view: DataView, at: number): number {
  return littleEndian16(view, at) + byteAt(view, at + 2) * 65_536;
}

const FOURTEEN_BITS = 2 ** 14;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngSize(bytes: DataView): CustomImageSize | undefined {
  const isPng = PNG_SIGNATURE.every(
    (byte, index) => byteAt(bytes, index) === byte
  );
  if (!isPng || ascii(bytes, 12, 4) !== "IHDR") {
    return undefined;
  }
  return { height: bigEndian32(bytes, 20), width: bigEndian32(bytes, 16) };
}

/** SOF markers carry the frame size; C4, C8 and CC share the range but don't. */
function isStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

function jpegSize(bytes: DataView): CustomImageSize | undefined {
  if (byteAt(bytes, 0) !== 0xff || byteAt(bytes, 1) !== 0xd8) {
    return undefined;
  }
  let at = 2;
  while (at + 9 < bytes.byteLength) {
    if (byteAt(bytes, at) !== 0xff) {
      return undefined;
    }
    const marker = byteAt(bytes, at + 1);
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      at += 2;
      continue;
    }
    if (isStartOfFrame(marker)) {
      return {
        height: bigEndian16(bytes, at + 5),
        width: bigEndian16(bytes, at + 7),
      };
    }
    at += 2 + bigEndian16(bytes, at + 2);
  }
  return undefined;
}

function webpSize(bytes: DataView): CustomImageSize | undefined {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    return undefined;
  }
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8 ") {
    return {
      height: littleEndian16(bytes, 28) % FOURTEEN_BITS,
      width: littleEndian16(bytes, 26) % FOURTEEN_BITS,
    };
  }
  if (chunk === "VP8L") {
    // 14-bit width then 14-bit height, least significant bits first.
    const bits =
      byteAt(bytes, 21) +
      byteAt(bytes, 22) * 2 ** 8 +
      byteAt(bytes, 23) * 2 ** 16 +
      byteAt(bytes, 24) * 2 ** 24;
    return {
      height: 1 + (Math.floor(bits / FOURTEEN_BITS) % FOURTEEN_BITS),
      width: 1 + (bits % FOURTEEN_BITS),
    };
  }
  if (chunk === "VP8X") {
    return {
      height: 1 + littleEndian24(bytes, 27),
      width: 1 + littleEndian24(bytes, 24),
    };
  }
  return undefined;
}

/** Dimensions of a base64 data URL image, or undefined when unreadable. */
export function dataUrlImageSize(url: string): CustomImageSize | undefined {
  const data = DATA_URL_REGEX.exec(url)?.[1];
  const bytes = data === undefined ? undefined : decodeBase64(data);
  if (bytes === undefined) {
    return undefined;
  }
  const size = pngSize(bytes) ?? jpegSize(bytes) ?? webpSize(bytes);
  return size !== undefined && size.width > 0 && size.height > 0
    ? size
    : undefined;
}
