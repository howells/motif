import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";
import { getOwnedAsset, streamAsset } from "@/lib/app/media/assets";

export const dynamic = "force-dynamic";

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** One private image, to its owner only. Anyone else, and any id that
 * doesn't exist, gets the same 404. */
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
  const stream = await streamAsset(asset);
  if (stream === null) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const download = new URL(request.url).searchParams.get("download") === "1";
  const extension = EXTENSIONS[asset.contentType] ?? "img";
  return new Response(stream, {
    headers: {
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="motif-${asset.id.slice(4, 12)}.${extension}"`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Type": asset.contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
