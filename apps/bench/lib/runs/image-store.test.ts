import path from "node:path";

import { describe, expect, it } from "vitest";

import { blobPathnameFor } from "./image-store";

describe("blobPathnameFor", () => {
  it("derives the key from (runId, alias, index) alone, so a row's location is reproducible rather than trusted", () => {
    expect(blobPathnameFor("run-1", "flux-fast", 0, "png")).toBe(
      "runs/run-1/flux-fast-0.png"
    );
  });

  it("carries the real extension — the content type is only known after the download has started", () => {
    expect(blobPathnameFor("run-1", "flux-fast", 2, "webp")).toBe(
      "runs/run-1/flux-fast-2.webp"
    );
  });

  it("encodes an alias so a slash in one cannot invent a directory level", () => {
    expect(blobPathnameFor("run-1", "fal-ai/flux", 0, "png")).toBe(
      "runs/run-1/fal-ai%2Fflux-0.png"
    );
  });

  it("is never absolute — this is the entire discriminator between a Blob key and a legacy local path, and `image_path` has no other column to tell them apart", () => {
    const cases = [
      blobPathnameFor("run-1", "flux-fast", 0, "png"),
      blobPathnameFor("run-1", "/etc/passwd", 0, "png"),
      blobPathnameFor("/absolute-run", "alias", 0, "png"),
    ];

    for (const pathname of cases) {
      expect(path.isAbsolute(pathname)).toBe(false);
    }
  });

  it("keeps every sample of a run under one prefix, so a run's images can be listed or dropped together", () => {
    const first = blobPathnameFor("run-9", "a", 0, "png");
    const second = blobPathnameFor("run-9", "b", 1, "jpg");

    expect(first.startsWith("runs/run-9/")).toBe(true);
    expect(second.startsWith("runs/run-9/")).toBe(true);
  });
});
