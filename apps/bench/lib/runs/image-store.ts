/**
 * Where a generated image actually lives.
 *
 * It used to be one answer — `process.cwd()/var/live-runs/...` — written by
 * the live engine and read back by `/api/image/**` with `readFile`. That
 * works locally and cannot work on Vercel: the filesystem is per-invocation,
 * so the function that later serves the image is not the one that wrote it.
 * The confirmed symptom was the same image returning 200 locally and 404 on
 * the live site.
 *
 * So `bench_samples.image_path` now holds one of two things, and which one
 * is decided per sample at write time by whether a Blob token exists:
 *
 *   - an absolute filesystem path — a local run with no token, unchanged
 *     behaviour, and still the right answer for a throwaway sweep
 *   - a Blob pathname, `runs/<runId>/<alias>-<index>.<ext>` — never
 *     absolute, which is what makes the two cases distinguishable by
 *     inspection rather than by a flag column
 *
 * Rows written before this existed are absolute paths and keep working.
 * Nothing migrates them: those images are on a disk that Vercel never had.
 *
 * The store is **private**. Public blobs would serve straight from the edge
 * with no function invocation, which is genuinely cheaper — but the URL is
 * then permanent and unauthenticated, and these are your prompts rendered as
 * pictures. Private keeps every byte behind `/api/image/**`, which also
 * means the client URL shape did not change at all: the contact sheet,
 * Aperto, and every stored `imageUrl` are untouched.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getBlobToken } from "@motif/bench-env/runtime";

/** Blob pathnames are relative by construction; local paths are absolute.
 * `image_path` needs no discriminator column because the two are already
 * unambiguous. */
const isBlobPathname = (imagePath: string): boolean =>
  !path.isAbsolute(imagePath);

export const blobPathnameFor = (
  runId: string,
  alias: string,
  sampleIndex: number,
  extension: string
): string =>
  `runs/${runId}/${encodeURIComponent(alias)}-${sampleIndex}.${extension}`;

export interface StoredImage {
  /** Explicitly `ArrayBuffer`-backed rather than the default
   * `ArrayBufferLike`, so it is directly assignable to `BodyInit` and the
   * route can hand it to `Response` without a copy or a cast. */
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly contentType: string | null;
}

/** Uploads the freshly downloaded file and returns the Blob pathname to
 * persist, or `null` when no token is configured — the caller then keeps the
 * local path it already has.
 *
 * `allowOverwrite` because the pathname is deterministic and a retry of a
 * failed sample legitimately rewrites the same key. `addRandomSuffix` is off
 * for the same reason: a suffix would make the pathname unreproducible from
 * (runId, alias, index), and the whole point is that the row's key can be
 * derived rather than trusted.
 */
export const putSampleImage = async (
  pathname: string,
  bytes: Buffer,
  contentType: string | null
): Promise<string | null> => {
  const token = getBlobToken();
  if (token === null) {
    return null;
  }

  // oxlint-disable-next-line howells/no-runtime-dynamic-imports -- @vercel/blob is only reachable on the live-engine write path; a static import would pull it into every route's bundle, including the zero-credential ones
  const { put } = await import("@vercel/blob");
  const result = await put(pathname, bytes, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: contentType ?? "application/octet-stream",
    token,
  });
  return result.pathname;
};

/** Reads a sample's bytes back, from whichever of the two homes its
 * `image_path` names. Returns `null` for a missing object or an unreadable
 * file, so the route can answer 404 without distinguishing the two — a
 * caller has no use for the difference and a 500 would misreport it. */
export const getSampleImageBytes = async (
  imagePath: string,
  contentType: string | null
): Promise<StoredImage | null> => {
  if (!isBlobPathname(imagePath)) {
    try {
      return { bytes: new Uint8Array(await readFile(imagePath)), contentType };
    } catch {
      return null;
    }
  }

  const token = getBlobToken();
  if (token === null) {
    // A Blob-backed row with no token is not a missing image, it is a
    // missing credential — but the request still cannot be served, and the
    // log line is the only place that difference is useful.
    console.error(
      `[bench image-store] ${imagePath} is stored in Blob but BLOB_READ_WRITE_TOKEN is not set`
    );
    return null;
  }

  // oxlint-disable-next-line howells/no-runtime-dynamic-imports -- same reason as the write path above
  const { get } = await import("@vercel/blob");
  const result = await get(imagePath, { access: "private", token });
  if (result === null || result.statusCode !== 200 || result.stream === null) {
    return null;
  }

  return {
    bytes: new Uint8Array(await new Response(result.stream).arrayBuffer()),
    contentType: result.blob.contentType ?? contentType,
  };
};
