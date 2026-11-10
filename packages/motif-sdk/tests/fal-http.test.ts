import { describe, expect, it, vi } from "vitest";

import {
  deletePayloads,
  falConnection,
  request,
  uploadToFalCdn,
} from "../src/fal-http";
import { runRequest, runRequestQueued } from "../src/fal-run";
import type { FalFetch } from "../src/types";

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

const LOCKED_BODY = '{"detail":"User is locked. Reason: TOP_UP."}';

function connectionOn(responses: Response[], retries = 0) {
  const queue = [...responses];
  const calls: {
    body: unknown;
    headers: unknown;
    method?: string;
    url: string;
  }[] = [];
  const fetch: FalFetch = async (url, init) => {
    calls.push({
      body: init.body,
      headers: init.headers,
      method: init.method,
      url,
    });
    const next = queue.shift();
    if (next === undefined) {
      throw new Error(`unexpected fetch of ${url}`);
    }
    return await Promise.resolve(next);
  };
  return { calls, connection: falConnection("test-key", { fetch, retries }) };
}

describe("fal request", () => {
  it("sends the key and retries a 5xx before succeeding", async () => {
    vi.useFakeTimers();
    try {
      const { calls, connection } = connectionOn(
        [new Response("busy", { status: 503 }), jsonResponse({ ok: true })],
        1
      );

      const pending = request(connection, "https://fal.run/x");
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.isOk()).toBe(true);
      expect(calls).toHaveLength(2);
      expect(calls[0]?.headers).toMatchObject({
        Authorization: "Key test-key",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps a locked fal account to ACCOUNT_LOCKED without retrying", async () => {
    const { calls, connection } = connectionOn(
      [new Response(LOCKED_BODY, { status: 403 })],
      3
    );

    const result = await request(connection, "https://fal.run/x");

    expect(result.isErr() && result.error.code).toBe("ACCOUNT_LOCKED");
    expect(result.isErr() && result.error.status).toBe(403);
    expect(calls).toHaveLength(1);
  });

  it("keeps other 403s as plain request failures", async () => {
    const { connection } = connectionOn([
      new Response('{"detail":"Forbidden"}', { status: 403 }),
    ]);

    const result = await request(connection, "https://fal.run/x");

    expect(result.isErr() && result.error.code).toBeUndefined();
  });

  it("surfaces fal's x-fal-request-id header on error results", async () => {
    const { connection } = connectionOn([
      new Response(JSON.stringify({ detail: "internal error" }), {
        headers: { "x-fal-request-id": "req_fal_err_789" },
        status: 500,
      }),
    ]);

    const result = await request(connection, "https://fal.run/x");

    const error = result.isErr() ? result.error : undefined;
    expect(error?.requestId).toBe("req_fal_err_789");
    expect(error?.status).toBe(500);
  });

  it("leaves requestId undefined when fal sends no correlation id", async () => {
    const { connection } = connectionOn([
      new Response("upstream unavailable", { status: 503 }),
    ]);

    const result = await request(connection, "https://fal.run/x");

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.requestId).toBeUndefined();
  });
});

describe("fal upload and payload deletion", () => {
  it("maps a locked account on the upload PUT to ACCOUNT_LOCKED", async () => {
    const { calls, connection } = connectionOn([
      jsonResponse({
        file_url: "https://cdn.example.test/file.png",
        upload_url: "https://upload.example.test/put",
      }),
      new Response(LOCKED_BODY, { status: 403 }),
    ]);

    const result = await uploadToFalCdn(connection, new Uint8Array([1, 2, 3]), {
      contentType: "image/png",
      fileName: "file.png",
    });

    expect(result.isErr() && result.error.code).toBe("ACCOUNT_LOCKED");
    expect(result.isErr() && result.error.status).toBe(403);
    expect(calls[1]?.method).toBe("PUT");
  });

  it("deletes fal request payloads by request id", async () => {
    const { calls, connection } = connectionOn([
      new Response(null, { status: 204 }),
    ]);

    const result = await deletePayloads(connection, "req_ephemeral_123");

    expect(result.isOk()).toBe(true);
    expect(calls[0]?.url).toBe(
      "https://api.fal.ai/v1/models/requests/req_ephemeral_123/payloads"
    );
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.headers).toMatchObject({ Authorization: "Key test-key" });
  });
});

describe("fal runs", () => {
  it("reads the request id from fal's response header on a synchronous run", async () => {
    const { calls, connection } = connectionOn([
      new Response(JSON.stringify({ image: { url: "https://x/y.png" } }), {
        headers: { "x-fal-request-id": "req_sync_1" },
        status: 200,
      }),
    ]);

    const result = await runRequest(connection, {
      body: { prompt: "x" },
      endpoint: "fal-ai/sam-3/image",
    });

    expect(calls[0]?.url).toBe("https://fal.run/fal-ai/sam-3/image");
    expect(result.isOk() && result.value.requestId).toBe("req_sync_1");
  });

  it("stops polling a queued run when fal reports a failure", async () => {
    const { calls, connection } = connectionOn([
      jsonResponse({
        request_id: "req_tool_3",
        response_url:
          "https://queue.fal.run/fal-ai/sam-3/image/requests/req_tool_3",
      }),
      jsonResponse({ error: "out of memory", status: "FAILED" }),
    ]);

    const result = await runRequestQueued(connection, {
      body: {},
      endpoint: "fal-ai/sam-3/image",
    });

    const error = result.isErr() ? result.error : undefined;
    expect(error?.message).toBe("out of memory");
    expect(error?.requestId).toBe("req_tool_3");
    expect(calls).toHaveLength(2);
  });
});
