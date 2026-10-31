/**
 * Private media: rows in `app_assets`, bytes in the private Blob store.
 *
 * Every read names the owner. An asset id belonging to someone else reads
 * exactly like one that doesn't exist, so guessing ids reveals nothing.
 */
import { createHash } from "node:crypto";

import type { AppSql } from "@motif/bench-db/app-sql";
import { getAppCredentials } from "@motif/bench-env/runtime";
import { get, put } from "@vercel/blob";

import { newId } from "../ids";
import { date, integer, text } from "../rows";
import type { ImageType } from "./validate";

export type AssetKind = "mask" | "output" | "upload";

export interface Asset {
  readonly blobPathname: string;
  readonly bytes: number;
  readonly contentType: ImageType;
  readonly createdAt: Date;
  readonly height: number;
  readonly id: string;
  readonly kind: AssetKind;
  readonly ownerId: string;
  readonly width: number;
}

export class StorageUnavailableError extends Error {
  constructor() {
    super("Private storage isn't set up on this server.");
    this.name = "StorageUnavailableError";
  }
}

const EXTENSIONS: Readonly<Record<ImageType, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const blobToken = (): string => {
  const token = getAppCredentials().blobToken;
  if (token === null) {
    throw new StorageUnavailableError();
  }
  return token;
};

const assetOf = (row: Readonly<Record<string, unknown>>): Asset => {
  const type = text(row, "content_type");
  const kind = text(row, "kind");
  return {
    blobPathname: text(row, "blob_pathname"),
    bytes: integer(row, "bytes"),
    contentType:
      type === "image/png"
        ? "image/png"
        : type === "image/webp"
          ? "image/webp"
          : "image/jpeg",
    createdAt: date(row, "created_at"),
    height: integer(row, "height"),
    id: text(row, "id"),
    kind: kind === "mask" ? "mask" : kind === "output" ? "output" : "upload",
    ownerId: text(row, "owner_id"),
    width: integer(row, "width"),
  };
};

const INSERT = `
INSERT INTO app_assets (id, owner_id, kind, blob_pathname, content_type, bytes, width, height, sha256)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id, owner_id, kind, blob_pathname, content_type, bytes, width, height, created_at`;

/** Store bytes privately and record them as the owner's. Blob first, row
 * second: a row never points at bytes that weren't written. */
export const storeAsset = async (
  sql: AppSql,
  input: {
    readonly bytes: Uint8Array;
    readonly contentType: ImageType;
    readonly height: number;
    readonly kind: AssetKind;
    readonly ownerId: string;
    readonly width: number;
  }
): Promise<Asset> => {
  const token = blobToken();
  const id = newId("ast");
  const pathname = `app/${input.ownerId}/${id}.${EXTENSIONS[input.contentType]}`;
  const buffer = Buffer.from(input.bytes);
  await put(pathname, buffer, {
    access: "private",
    addRandomSuffix: false,
    contentType: input.contentType,
    token,
  });
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const [row] = await sql(INSERT, [
    id,
    input.ownerId,
    input.kind,
    pathname,
    input.contentType,
    buffer.byteLength,
    input.width,
    input.height,
    sha256,
  ]);
  if (row === undefined) {
    throw new Error("The asset wasn't recorded.");
  }
  return assetOf(row);
};

const OWNED = `
SELECT id, owner_id, kind, blob_pathname, content_type, bytes, width, height, created_at
  FROM app_assets WHERE id = $1 AND owner_id = $2`;

/** The owner's asset, or `null` for another person's or a missing one. */
export const getOwnedAsset = async (
  sql: AppSql,
  ownerId: string,
  assetId: string
): Promise<Asset | null> => {
  const [row] = await sql(OWNED, [assetId, ownerId]);
  return row === undefined ? null : assetOf(row);
};

const OWNED_MANY = `
SELECT id, owner_id, kind, blob_pathname, content_type, bytes, width, height, created_at
  FROM app_assets WHERE id = ANY($1::text[]) AND owner_id = $2`;

/** Several of the owner's assets, in the order asked; `null` if any isn't theirs. */
export const getOwnedAssets = async (
  sql: AppSql,
  ownerId: string,
  assetIds: readonly string[]
): Promise<Asset[] | null> => {
  if (assetIds.length === 0) {
    return [];
  }
  const rows = await sql(OWNED_MANY, [[...assetIds], ownerId]);
  const byId = new Map(rows.map((row) => [text(row, "id"), assetOf(row)]));
  const ordered = assetIds.map((id) => byId.get(id));
  return ordered.every((asset): asset is Asset => asset !== undefined)
    ? ordered
    : null;
};

/** The stored bytes of an asset the caller already owns. */
export const readAssetBytes = async (asset: Asset): Promise<Uint8Array> => {
  const result = await get(asset.blobPathname, {
    access: "private",
    token: blobToken(),
  });
  if (result === null || result.statusCode !== 200 || result.stream === null) {
    throw new Error("The stored image is missing.");
  }
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
};

/** A stream of the stored bytes, for the media route. */
export const streamAsset = async (
  asset: Asset
): Promise<ReadableStream<Uint8Array> | null> => {
  const result = await get(asset.blobPathname, {
    access: "private",
    token: blobToken(),
  });
  return result === null || result.statusCode !== 200 ? null : result.stream;
};

/** A data URL for sending an owned image to the provider. The App never
 * hands the provider a URL to its private store. */
export const assetDataUrl = async (asset: Asset): Promise<string> => {
  const bytes = await readAssetBytes(asset);
  return `data:${asset.contentType};base64,${Buffer.from(bytes).toString("base64")}`;
};
