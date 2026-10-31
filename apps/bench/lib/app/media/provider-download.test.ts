import { describe, expect, it, vi } from "vitest";

import {
  downloadProviderFile,
  isTrustedProviderUrl,
} from "./provider-download";

describe("isTrustedProviderUrl", () => {
  it.each([
    "https://fal.media/files/a.png",
    "https://v3.fal.media/files/a.png",
    "https://queue.fal.run/x",
    "https://storage.googleapis.com/falserverless/a.png",
  ])("trusts %s", (url) => {
    expect(isTrustedProviderUrl(url)).toBe(true);
  });

  it.each([
    "http://fal.media/files/a.png",
    "https://fal.media.evil.example/a.png",
    "https://evilfal.media/a.png",
    "https://user:pass@fal.media/a.png",
    "https://fal.media:8443/a.png",
    "https://storage.googleapis.com/other-bucket/a.png",
    "https://169.254.169.254/latest/meta-data",
    "file:///etc/passwd",
    "not a url",
  ])("refuses %s", (url) => {
    expect(isTrustedProviderUrl(url)).toBe(false);
  });
});

const bytes = (size: number) =>
  new Response(new Uint8Array(size), { status: 200 });

describe("downloadProviderFile", () => {
  it("never fetches an untrusted host", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      downloadProviderFile("https://evil.example/a.png", fetchImpl)
    ).rejects.toMatchObject({
      code: "UNTRUSTED_OUTPUT_URL",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("re-checks every redirect and refuses one that leaves fal", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(null, {
          headers: { location: "http://127.0.0.1/admin" },
          status: 302,
        })
    );
    await expect(
      downloadProviderFile("https://v3.fal.media/a.png", fetchImpl)
    ).rejects.toMatchObject({
      code: "UNTRUSTED_OUTPUT_URL",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("follows a trusted redirect", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { location: "https://fal.media/b.png" },
          status: 307,
        })
      )
      .mockResolvedValueOnce(bytes(10));
    await expect(
      downloadProviderFile("https://v3.fal.media/a.png", fetchImpl)
    ).resolves.toHaveLength(10);
  });

  it("stops a redirect loop", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(null, {
          headers: { location: "https://fal.media/again" },
          status: 302,
        })
    );
    await expect(
      downloadProviderFile("https://fal.media/a.png", fetchImpl)
    ).rejects.toMatchObject({
      code: "TOO_MANY_REDIRECTS",
    });
  });

  it("refuses a body over the limit, whether declared or streamed", async () => {
    const declared = vi.fn<typeof fetch>(
      async () =>
        new Response("x", { headers: { "content-length": "999" }, status: 200 })
    );
    await expect(
      downloadProviderFile("https://fal.media/a.png", declared, 100)
    ).rejects.toMatchObject({
      code: "OUTPUT_TOO_LARGE",
    });
    const streamed = vi.fn<typeof fetch>(async () => bytes(101));
    await expect(
      downloadProviderFile("https://fal.media/a.png", streamed, 100)
    ).rejects.toMatchObject({
      code: "OUTPUT_TOO_LARGE",
    });
  });
});
