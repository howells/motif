/**
 * Fetch a file a provider returned, without letting a provider response steer
 * the server anywhere else.
 *
 * Only https URLs on fal's own file hosts are fetched. Redirects are followed
 * by hand, a few at most, and each hop must land on a trusted host again. The
 * body is read under a byte limit and the whole download under a time limit,
 * so a slow or endless response can't hold the worker.
 */

/** Hosts fal serves result files from. */
const TRUSTED_HOST_SUFFIXES = [".fal.media", ".fal.run", ".fal.ai"];
const TRUSTED_HOSTS = new Set(["fal.media"]);
/** fal also hands back signed Google Cloud Storage URLs under its own bucket. */
const TRUSTED_BUCKET = {
  host: "storage.googleapis.com",
  pathPrefix: "/falserverless/",
};

export const OUTPUT_LIMIT_BYTES = 80_000_000;
const TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 3;

export const isTrustedProviderUrl = (raw: string): boolean => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    return false;
  }
  if (url.port !== "" && url.port !== "443") {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (
    TRUSTED_HOSTS.has(host) ||
    TRUSTED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    return true;
  }
  return (
    host === TRUSTED_BUCKET.host &&
    url.pathname.startsWith(TRUSTED_BUCKET.pathPrefix)
  );
};

export class ProviderDownloadError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ProviderDownloadError";
  }
}

const readLimited = async (
  response: Response,
  limit: number
): Promise<Uint8Array> => {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > limit) {
    throw new ProviderDownloadError(
      "OUTPUT_TOO_LARGE",
      "The result file is too large."
    );
  }
  if (response.body === null) {
    throw new ProviderDownloadError(
      "EMPTY_OUTPUT",
      "The result file was empty."
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ProviderDownloadError(
        "OUTPUT_TOO_LARGE",
        "The result file is too large."
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

export const downloadProviderFile = async (
  raw: string,
  fetchImpl: typeof fetch = fetch,
  limit: number = OUTPUT_LIMIT_BYTES
): Promise<Uint8Array> => {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isTrustedProviderUrl(current)) {
      throw new ProviderDownloadError(
        "UNTRUSTED_OUTPUT_URL",
        "The result came from an unexpected host."
      );
    }
    const response = await fetchImpl(current, { redirect: "manual", signal });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location === null) {
        throw new ProviderDownloadError(
          "BAD_REDIRECT",
          "The result redirected nowhere."
        );
      }
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) {
      throw new ProviderDownloadError(
        "DOWNLOAD_FAILED",
        `The result couldn't be fetched (${response.status}).`
      );
    }
    return await readLimited(response, limit);
  }
  throw new ProviderDownloadError(
    "TOO_MANY_REDIRECTS",
    "The result redirected too many times."
  );
};
