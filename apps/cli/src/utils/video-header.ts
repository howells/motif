/**
 * Length, frame count, size and frame rate of a local MP4 or MOV, read from
 * its `moov` box without decoding: enough for the SDK to price per-second and
 * per-frame video Models before a run. Anything unreadable returns undefined,
 * so the price stays unknown rather than wrong.
 */

import { open } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";

import type { TaskInput } from "@howells/motif-sdk";

type SourceVideo = NonNullable<TaskInput["sourceVideo"]>;

interface Box {
  payload: Buffer;
  type: string;
}

/** Child boxes of a container payload. */
function childBoxes(payload: Buffer): Box[] {
  const boxes: Box[] = [];
  let at = 0;
  while (at + 8 <= payload.length) {
    let size = payload.readUInt32BE(at);
    const type = payload.toString("latin1", at + 4, at + 8);
    let header = 8;
    if (size === 1 && at + 16 <= payload.length) {
      size = Number(payload.readBigUInt64BE(at + 8));
      header = 16;
    } else if (size === 0) {
      size = payload.length - at;
    }
    if (size < header || at + size > payload.length) {
      break;
    }
    boxes.push({ payload: payload.subarray(at + header, at + size), type });
    at += size;
  }
  return boxes;
}

function child(payload: Buffer, type: string): Buffer | undefined {
  return childBoxes(payload).find((box) => box.type === type)?.payload;
}

/** The `moov` payload, found by walking top-level box headers only. */
async function readMoov(file: FileHandle): Promise<Buffer | undefined> {
  const { size: fileSize } = await file.stat();
  const header = Buffer.alloc(16);
  let at = 0;
  while (at + 8 <= fileSize) {
    await file.read(header, 0, 16, at);
    let size = header.readUInt32BE(0);
    const type = header.toString("latin1", 4, 8);
    let headerSize = 8;
    if (size === 1) {
      size = Number(header.readBigUInt64BE(8));
      headerSize = 16;
    } else if (size === 0) {
      size = fileSize - at;
    }
    if (size < headerSize) {
      return undefined;
    }
    if (type === "moov") {
      const payload = Buffer.alloc(size - headerSize);
      await file.read(payload, 0, payload.length, at + headerSize);
      return payload;
    }
    at += size;
  }
  return undefined;
}

/** `mdhd`: seconds from the timescale and duration, version 0 or 1. */
function mediaSeconds(mdhd: Buffer): number | undefined {
  const version = mdhd.readUInt8(0);
  const timescale = mdhd.readUInt32BE(version === 1 ? 20 : 12);
  const duration =
    version === 1 ? Number(mdhd.readBigUInt64BE(24)) : mdhd.readUInt32BE(16);
  return timescale > 0 ? duration / timescale : undefined;
}

/** `tkhd`: presentation width and height, 16.16 fixed point, at its end. */
function trackSize(
  tkhd: Buffer
): { height: number; width: number } | undefined {
  if (tkhd.length < 84) {
    return undefined;
  }
  const width = tkhd.readUInt32BE(tkhd.length - 8) / 65_536;
  const height = tkhd.readUInt32BE(tkhd.length - 4) / 65_536;
  return width > 0 && height > 0 ? { height, width } : undefined;
}

function videoTrack(moov: Buffer): SourceVideo | undefined {
  for (const trak of childBoxes(moov).filter((box) => box.type === "trak")) {
    const mdia = child(trak.payload, "mdia");
    const hdlr = mdia === undefined ? undefined : child(mdia, "hdlr");
    if (hdlr === undefined || hdlr.toString("latin1", 8, 12) !== "vide") {
      continue;
    }
    const mdhd = mdia === undefined ? undefined : child(mdia, "mdhd");
    const seconds = mdhd === undefined ? undefined : mediaSeconds(mdhd);
    if (seconds === undefined || seconds <= 0) {
      return undefined;
    }
    const minf = mdia === undefined ? undefined : child(mdia, "minf");
    const stbl = minf === undefined ? undefined : child(minf, "stbl");
    const stsz = stbl === undefined ? undefined : child(stbl, "stsz");
    const frames =
      stsz !== undefined && stsz.length >= 12
        ? stsz.readUInt32BE(8)
        : undefined;
    const tkhd = child(trak.payload, "tkhd");
    const size = tkhd === undefined ? undefined : trackSize(tkhd);
    return {
      seconds,
      ...(frames !== undefined &&
        frames > 0 && { fps: frames / seconds, frames }),
      ...size,
    };
  }
  return undefined;
}

/** The video track's facts, or undefined when the file isn't a readable MP4 or MOV. */
export async function readVideoHeader(
  path: string
): Promise<SourceVideo | undefined> {
  let file: FileHandle | undefined;
  try {
    file = await open(path, "r");
    const moov = await readMoov(file);
    return moov === undefined ? undefined : videoTrack(moov);
  } catch {
    return undefined;
  } finally {
    await file?.close();
  }
}
