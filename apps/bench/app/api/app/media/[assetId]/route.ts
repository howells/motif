import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";
import {
  getOwnedAsset,
  readAssetBytes,
  streamAsset,
} from "@/lib/app/media/assets";
import { previewWidthOf, resizeImage } from "@/lib/app/media/resize";

export const dynamic = "force-dynamic";

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Every image is private to its owner and never runs as a document. */
const PRIVATE_IMAGE = {
  "Cache-Control": "private, max-age=3600",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "X-Content-Type-Options": "nosniff",
} as const;

/** One private image, to its owner only. Anyone else, and any id that
 * doesn't exist, gets the same 404. `?w=` asks for a smaller WebP copy, at
 * one of the widths `next/image` uses; the original comes back when it is
 * no wider than that. */
export async function GET(
  request: Request,
  context: RouteContext<"/api/app/media/[assetId]">
) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return auth.response;
  }
  const { assetId } = await context.params;
  if (!isAppId(assetId, "ast")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const asset = await getOwnedAsset(auth.sql, auth.member.id, assetId);
  if (asset === null) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const params = new URL(request.url).searchParams;
  const width = previewWidthOf(params.get("w"));
  if (width === undefined) {
    return appError(400, "INVALID_WIDTH", "That image width isn't offered.");
  }
  if (width !== null && width < asset.width) {
    const preview = await resizeImage(await readAssetBytes(asset), width);
    return new Response(Buffer.from(preview), {
      headers: { ...PRIVATE_IMAGE, "Content-Type": "image/webp" },
    });
  }
  const stream = await streamAsset(asset);
  if (stream === null) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const download = params.get("download") === "1";
  const extension = EXTENSIONS[asset.contentType] ?? "img";
  return new Response(stream, {
    headers: {
      ...PRIVATE_IMAGE,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="motif-${asset.id.slice(4, 12)}.${extension}"`,
      "Content-Type": asset.contentType,
    },
  });
}
