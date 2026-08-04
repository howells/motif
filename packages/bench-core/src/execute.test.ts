import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { err, MotifError, ok } from "@howells/motif-sdk";
import type {
  GenerateOptions,
  GenerationModelName,
  MotifResponse,
  Result,
} from "@howells/motif-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AlignmentOk } from "./align-params";
import type { ExecuteErrorCode, GenerationClient } from "./execute";
import { executeGeneration } from "./execute";

const minimalPngBytes = (width: number, height: number): Buffer => {
  const png = Buffer.alloc(24);
  for (const [index, byte] of [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ].entries()) {
    png[index] = byte;
  }
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  return png;
};

const alignmentFor = (
  alias: GenerationModelName = "flux-fast"
): AlignmentOk => ({
  alias,
  autoSet: [],
  body: { prompt: "a red balloon" },
  coerced: [],
  dropped: [],
  endpoint: "fal-ai/flux/schnell",
  modelName: "FLUX Schnell",
  ok: true,
  options: { model: alias, prompt: "a red balloon" } satisfies GenerateOptions,
  seedSent: null,
  sizeMode: "aspect_ratio",
  usesQueue: false,
});

const okResponse = (
  overrides: Partial<MotifResponse> = {}
): Result<MotifResponse, MotifError> =>
  ok({
    images: [{ url: "https://cdn.fal.ai/example/image.png" }],
    ...overrides,
  });

const stubClient = (
  generate: (
    options: GenerateOptions
  ) => Promise<Result<MotifResponse, MotifError>>
): GenerationClient => ({ generate });

/** `async () => { await Promise.resolve(); return value; }` rather than
 * `async () => Promise.resolve(value)` — an async function must contain a
 * real `await` (repo lint convention; mirrors materialdesk's
 * `benchmark/routes.ts` `mockExecute`), and wrapping the return value itself
 * in `Promise.resolve` is redundant once the function is already async. */
const resolvedClient = (
  value: Result<MotifResponse, MotifError>
): GenerationClient =>
  stubClient(async () => {
    await Promise.resolve();
    return value;
  });

const rejectedClient = (error: unknown): GenerationClient =>
  stubClient(() => {
    throw error;
  });

const fetchResolving = (response: Response): typeof fetch =>
  vi.fn<typeof fetch>(async () => {
    await Promise.resolve();
    return response;
  });

const fetchRejecting = (error: unknown): typeof fetch =>
  vi.fn<typeof fetch>(() => {
    throw error;
  });

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "bench-core-execute-"));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(workDir, { recursive: true, force: true });
});

describe("executeGeneration — success path", () => {
  it("downloads the image, writes it to disk, and sniffs actual W×H (never inferred)", async () => {
    const pngBytes = minimalPngBytes(640, 480);
    vi.stubGlobal(
      "fetch",
      fetchResolving(
        new Response(pngBytes, {
          headers: { "content-type": "image/png" },
          status: 200,
        })
      )
    );

    const client = resolvedClient(
      okResponse({ requestId: "req-123", seed: 42 })
    );
    const imagePath = path.join(workDir, "sample.png");

    const result = await executeGeneration(client, alignmentFor(), {
      imagePath,
    });

    expect(result).toMatchObject({
      bytes: pngBytes.byteLength,
      contentType: "image/png",
      falRequestId: "req-123",
      height: 480,
      imagePath,
      ok: true,
      seedReturned: 42,
      width: 640,
    });
    expect(
      typeof result.providerMs === "number" && result.providerMs >= 0
    ).toBe(true);
    expect(
      typeof result.downloadMs === "number" && result.downloadMs >= 0
    ).toBe(true);
    expect(result.totalMs).toBeGreaterThanOrEqual(0);

    const written = await readFile(imagePath);
    expect(written.equals(pngBytes)).toBe(true);

    // Temp-write-then-rename: no leftover .tmp-* artifact after success.
    const entries = await readdir(workDir);
    expect(entries).toEqual(["sample.png"]);
  });

  it("leaves width/height null when the downloaded bytes are not a recognized format", async () => {
    vi.stubGlobal(
      "fetch",
      fetchResolving(
        new Response(Buffer.from("not an image"), {
          headers: { "content-type": "application/octet-stream" },
          status: 200,
        })
      )
    );
    const client = resolvedClient(okResponse());

    const result = await executeGeneration(client, alignmentFor(), {
      imagePath: path.join(workDir, "sample.bin"),
    });

    expect(result).toMatchObject({ height: null, ok: true, width: null });
  });
});

describe("executeGeneration — closed error vocabulary", () => {
  const casesForMotifError: readonly [string, MotifError, ExecuteErrorCode][] =
    [
      [
        "429 -> RATE_LIMITED",
        new MotifError("Too many requests", 429),
        "RATE_LIMITED",
      ],
      ["500 -> HTTP_5XX", new MotifError("Internal error", 500), "HTTP_5XX"],
      [
        "503 -> HTTP_5XX",
        new MotifError("Service unavailable", 503),
        "HTTP_5XX",
      ],
      ["404 -> HTTP_4XX", new MotifError("Not found", 404), "HTTP_4XX"],
      ["422 -> HTTP_4XX", new MotifError("Unprocessable", 422), "HTTP_4XX"],
      [
        "timeout message -> TIMEOUT",
        new MotifError("Request timeout after 120000ms", 0),
        "TIMEOUT",
      ],
      [
        "safety-flagged message -> SAFETY",
        new MotifError("Content flagged by safety system", 422),
        "SAFETY",
      ],
    ];

  it.each(casesForMotifError)(
    "classifies %s and never surfaces the provider message",
    async (_label, motifError, expectedCode) => {
      const client = resolvedClient(err(motifError));
      const result = await executeGeneration(client, alignmentFor(), {
        imagePath: path.join(workDir, "sample.png"),
      });

      expect(result).toMatchObject({ errorCode: expectedCode, ok: false });
      // The closed-vocabulary result type has no message/text field at all —
      // structurally impossible for provider text to leak through.
      expect(Object.keys(result).sort()).toEqual(
        ["downloadMs", "errorCode", "ok", "providerMs", "totalMs"].sort()
      );
    }
  );

  it("classifies NO_IMAGE when the response has no images", async () => {
    const client = resolvedClient(okResponse({ images: [] }));
    const result = await executeGeneration(client, alignmentFor(), {
      imagePath: path.join(workDir, "sample.png"),
    });
    expect(result).toMatchObject({
      downloadMs: null,
      errorCode: "NO_IMAGE",
      ok: false,
    });
  });

  it("classifies DOWNLOAD_FAILED when the fetch response is not ok", async () => {
    vi.stubGlobal("fetch", fetchResolving(new Response(null, { status: 403 })));
    const client = resolvedClient(okResponse());
    const result = await executeGeneration(client, alignmentFor(), {
      imagePath: path.join(workDir, "sample.png"),
    });
    expect(result).toMatchObject({ errorCode: "DOWNLOAD_FAILED", ok: false });
  });

  it("classifies DOWNLOAD_FAILED when fetch itself throws", async () => {
    vi.stubGlobal("fetch", fetchRejecting(new Error("network unreachable")));
    const client = resolvedClient(okResponse());
    const result = await executeGeneration(client, alignmentFor(), {
      imagePath: path.join(workDir, "sample.png"),
    });
    expect(result).toMatchObject({ errorCode: "DOWNLOAD_FAILED", ok: false });
  });

  it("classifies INTERRUPTED when the signal is already aborted before any work", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = resolvedClient(okResponse());
    const result = await executeGeneration(client, alignmentFor(), {
      imagePath: path.join(workDir, "sample.png"),
      signal: controller.signal,
    });
    expect(result).toMatchObject({
      errorCode: "INTERRUPTED",
      ok: false,
      providerMs: null,
    });
  });

  it("classifies an injected client throwing an unexpected value as HTTP_5XX rather than crashing", async () => {
    const client = rejectedClient(new Error("boom"));
    const result = await executeGeneration(client, alignmentFor(), {
      imagePath: path.join(workDir, "sample.png"),
    });
    expect(result).toMatchObject({ errorCode: "HTTP_5XX", ok: false });
  });
});

describe("executeGeneration — network isolation", () => {
  it("never calls the real global fetch by default (client is fully injected)", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);
    const client = resolvedClient(err(new MotifError("nope", 400)));

    await executeGeneration(client, alignmentFor(), {
      imagePath: path.join(workDir, "sample.png"),
    });

    // A failed generation never reaches the download step.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
