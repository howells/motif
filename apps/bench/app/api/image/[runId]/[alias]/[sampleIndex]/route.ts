/**
 * Serves a live-engine sample's real downloaded image bytes off disk — the
 * live counterpart to `/api/mock-image/**` (`app/api/mock-image/[runId]
 * /[alias]/[sampleIndex]/[size]/route.ts`). Kept as a wholly separate route
 * rather than a branch inside the mock route: the two have different
 * inputs (this one has no `size` segment — the real file's dimensions are
 * whatever fal actually returned, already known from the DB row, not a
 * client-suppliable placeholder size), different sources (disk vs.
 * synthesized SVG), and conflating them would blur exactly the
 * mock/real distinction this phase exists to make unambiguous.
 *
 * `force-dynamic`: reads the database and the filesystem on every request.
 */
import { readFile } from "node:fs/promises";

import { getSampleImage } from "@/lib/runs/repository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ alias: string; runId: string; sampleIndex: string }>;
  }
) {
  const { alias, runId, sampleIndex } = await params;
  const parsedSampleIndex = Number(sampleIndex);
  if (!Number.isInteger(parsedSampleIndex) || parsedSampleIndex < 0) {
    return new Response(null, { status: 400 });
  }

  const image = await getSampleImage(
    runId,
    decodeURIComponent(alias),
    parsedSampleIndex
  );
  if (!image) {
    return new Response(null, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(image.imagePath);
  } catch {
    return new Response(null, { status: 404 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "cache-control": "private, max-age=31536000, immutable",
      "content-type": image.contentType ?? "application/octet-stream",
    },
  });
}
