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

      const pending = request(connection, "https://fal.run/x", {
        safeToRetry: true,
      });
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

    const result = await request(connection, "https://fal.run/x", {
      safeToRetry: true,
    });

    expect(result.isErr() && result.error.code).toBe("ACCOUNT_LOCKED");
    expect(result.isErr() && result.error.status).toBe(403);
    expect(calls).toHaveLength(1);
  });

  it("keeps other 403s as plain request failures", async () => {
    const { connection } = connectionOn([
      new Response('{"detail":"Forbidden"}', { status: 403 }),
    ]);

    const result = await request(connection, "https://fal.run/x", {
      safeToRetry: true,
    });

    expect(result.isErr() && result.error.code).toBeUndefined();
  });

  it("surfaces fal's x-fal-request-id header on error results", async () => {
    const { connection } = connectionOn([
      new Response(JSON.stringify({ detail: "internal error" }), {
        headers: { "x-fal-request-id": "req_fal_err_789" },
        status: 500,
      }),
    ]);

    const result = await request(connection, "https://fal.run/x", {
      safeToRetry: true,
    });

    const error = result.isErr() ? result.error : undefined;
    expect(error?.requestId).toBe("req_fal_err_789");
    expect(error?.status).toBe(500);
  });

  it("leaves requestId undefined when fal sends no correlation id", async () => {
    const { connection } = connectionOn([
      new Response("upstream unavailable", { status: 503 }),
    ]);

    const result = await request(connection, "https://fal.run/x", {
      safeToRetry: true,
    });

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

describe("fal runs never resend a request that can bill", () => {
  const submission = { body: { prompt: "x" }, endpoint: "fal-ai/flux-2-pro" };

  it("attempts a queue submission that returns 502 exactly once and says it may have been accepted", async () => {
    const { calls, connection } = connectionOn(
      [new Response("bad gateway", { status: 502 })],
      3
    );

    const result = await runRequestQueued(connection, submission);

    expect(calls).toHaveLength(1);
    const error = result.isErr() ? result.error : undefined;
    expect(error?.code).toBe("SUBMISSION_UNCERTAIN");
    expect(error?.status).toBe(502);
    expect(error?.message).toMatch(/may have accepted it and may bill/);
  });

  it("attempts a synchronous run that returns 503 exactly once", async () => {
    const { calls, connection } = connectionOn(
      [new Response("busy", { status: 503 })],
      3
    );

    const result = await runRequest(connection, submission);

    expect(calls).toHaveLength(1);
    expect(result.isErr() && result.error.code).toBe("SUBMISSION_UNCERTAIN");
  });

  it("attempts a submission whose connection fails exactly once", async () => {
    let attempts = 0;
    const connection = falConnection("test-key", {
      fetch: async () => {
        attempts += 1;
        return await Promise.reject(new Error("socket hang up"));
      },
      retries: 3,
    });

    const result = await runRequestQueued(connection, submission);

    expect(attempts).toBe(1);
    expect(result.isErr() && result.error.code).toBe("SUBMISSION_UNCERTAIN");
  });

  it("still retries a 429, which fal refuses before doing any work", async () => {
    vi.useFakeTimers();
    try {
      const { calls, connection } = connectionOn(
        [
          new Response("slow down", { status: 429 }),
          jsonResponse({
            request_id: "req_1",
            response_url:
              "https://queue.fal.run/fal-ai/flux-2-pro/requests/req_1",
          }),
          jsonResponse({ status: "FAILED", error: "stop" }),
        ],
        1
      );

      const pending = runRequestQueued(connection, submission);
      await vi.runAllTimersAsync();
      await pending;

      expect(calls[0]?.method).toBe("POST");
      expect(calls[1]?.method).toBe("POST");
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries a status poll that returns 502 and finishes the run", async () => {
    vi.useFakeTimers();
    try {
      const { calls, connection } = connectionOn(
        [
          jsonResponse({
            request_id: "req_2",
            response_url:
              "https://queue.fal.run/fal-ai/flux-2-pro/requests/req_2",
          }),
          new Response("bad gateway", { status: 502 }),
          jsonResponse({ status: "COMPLETED" }),
          jsonResponse({ images: [] }),
        ],
        1
      );

      const pending = runRequestQueued(connection, submission);
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.isOk()).toBe(true);
      expect(calls).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("fal failures after a job is accepted", () => {
  const submission = { body: {}, endpoint: "fal-ai/flux-2-pro" };
  const accepted = () =>
    jsonResponse({
      request_id: "req_9",
      response_url: "https://queue.fal.run/fal-ai/flux-2-pro/requests/req_9",
    });

  it("returns an error, not a rejection, for a truncated status body, and carries the request id", async () => {
    const { connection } = connectionOn([accepted(), new Response('{"stat')]);

    const result = await runRequestQueued(connection, submission);

    const error = result.isErr() ? result.error : undefined;
    expect(error?.code).toBe("INVALID_RESPONSE");
    expect(error?.requestId).toBe("req_9");
    expect(error?.details).toMatchObject({
      endpoint: "fal-ai/flux-2-pro",
      requestId: "req_9",
    });
    expect(error?.message).toMatch(/do not submit it again/);
  });

  it("carries the request id when the result body is truncated", async () => {
    const { connection } = connectionOn([
      accepted(),
      jsonResponse({ status: "COMPLETED" }),
      new Response("{"),
    ]);

    const result = await runRequestQueued(connection, submission);

    expect(result.isErr() && result.error.requestId).toBe("req_9");
    expect(result.isErr() && result.error.code).toBe("INVALID_RESPONSE");
  });

  it("carries the request id when polling fails for good", async () => {
    const { connection } = connectionOn(
      [accepted(), new Response("gone", { status: 502 })],
      0
    );

    const result = await runRequestQueued(connection, submission);

    expect(result.isErr() && result.error.requestId).toBe("req_9");
    expect(result.isErr() && result.error.status).toBe(502);
  });

  it("treats a queue acceptance with no readable body as uncertain", async () => {
    const { connection } = connectionOn([new Response("not json")]);

    const result = await runRequestQueued(connection, submission);

    expect(result.isErr() && result.error.code).toBe("SUBMISSION_UNCERTAIN");
  });

  it("returns an error for a synchronous run whose body is not JSON", async () => {
    const { connection } = connectionOn([
      new Response("<html>", { headers: { "x-fal-request-id": "req_s" } }),
    ]);

    const result = await runRequest(connection, submission);

    expect(result.isErr() && result.error.code).toBe("INVALID_RESPONSE");
    expect(result.isErr() && result.error.requestId).toBe("req_s");
  });
});
