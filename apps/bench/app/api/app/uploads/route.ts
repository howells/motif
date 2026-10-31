import { getCapabilities } from "@/lib/app/db";
import { appError, authorise } from "@/lib/app/http/guard";
import { StorageUnavailableError, storeAsset } from "@/lib/app/media/assets";
import { inspectUpload } from "@/lib/app/media/validate";
import { mediaUrl } from "@/lib/app/views";

export const dynamic = "force-dynamic";

/** Add a photo or a drawn mask to the signed-in person's private media. */
export async function POST(request: Request) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  if (!getCapabilities().storage) {
    return appError(
      503,
      "STORAGE_UNAVAILABLE",
      "Private storage isn't set up on this server."
    );
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return appError(400, "INVALID_UPLOAD", "Send the image as a form upload.");
  }
  const file = form.get("file");
  const kind = form.get("kind") === "mask" ? "mask" : "image";
  if (!(file instanceof File)) {
    return appError(400, "NO_FILE", "Choose an image to upload.");
  }
  const inspected = await inspectUpload(
    new Uint8Array(await file.arrayBuffer()),
    kind
  );
  if (!inspected.ok) {
    return appError(400, inspected.code, inspected.message);
  }
  try {
    const asset = await storeAsset(auth.sql, {
      bytes: inspected.bytes,
      contentType: inspected.contentType,
      height: inspected.height,
      kind: kind === "mask" ? "mask" : "upload",
      ownerId: auth.member.id,
      width: inspected.width,
    });
    return Response.json(
      {
        asset: {
          height: asset.height,
          id: asset.id,
          kind: asset.kind,
          url: mediaUrl(asset.id),
          width: asset.width,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return appError(503, "STORAGE_UNAVAILABLE", error.message);
    }
    throw error;
  }
}
