/**
 * Getting a photo to the server within its limits. A phone photo is often
 * larger than the 4.4 MB request limit or the 4096px side the App keeps, so
 * it is redrawn smaller here first; the server still checks everything.
 */
import { upload } from "@/lib/app/client/api";
import { UploadReply } from "@/lib/app/client/schemas";

export const UPLOAD_LIMIT_BYTES = 4_400_000;
export const MAX_SIDE = 4096;

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface UploadedAsset {
  readonly height: number;
  readonly id: string;
  readonly url: string;
  readonly width: number;
}

const toBlob = async (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> =>
  await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new Error("The photo couldn’t be prepared."));
        } else {
          resolve(blob);
        }
      },
      type,
      quality
    );
  });

/** The file as it is when it already fits, else redrawn upright, no larger
 * than 4096px on a side and under 4.4 MB. */
export const fitForUpload = async (file: File): Promise<Blob> => {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const fits =
    ACCEPTED.has(file.type) &&
    file.size <= UPLOAD_LIMIT_BYTES &&
    Math.max(bitmap.width, bitmap.height) <= MAX_SIDE;
  if (fits) {
    bitmap.close();
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("The photo couldn’t be prepared.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.9, 0.82, 0.72, 0.6]) {
    const blob = await toBlob(canvas, "image/jpeg", quality);
    if (blob.size <= UPLOAD_LIMIT_BYTES) {
      return blob;
    }
  }
  throw new Error("This photo is too large to send, even made smaller.");
};

export const uploadImage = async (
  blob: Blob,
  kind: "image" | "mask",
  name = kind === "mask" ? "mask.png" : "photo.jpg"
): Promise<UploadedAsset> => {
  const form = new FormData();
  form.append("file", blob, name);
  form.append("kind", kind);
  const body = await upload("/api/app/uploads", UploadReply, form);
  return body.asset;
};
