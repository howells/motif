import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createMotif } from "../src/index";
import type { FalFetch, TaskStream } from "../src/index";

const cleanup: (() => Promise<void>)[] = [];

async function transport(
  reply: (response: ServerResponse) => void | Promise<void>
) {
  const calls: { url: string; method?: string; body: unknown }[] = [];
  let disconnected = false;
  const server = createServer((request, response) => {
    void (async () => {
      response.on("close", () => {
        disconnected = true;
      });
      const chunks: Buffer[] = [];
      request.setEncoding("utf-8");
      // SAFETY: setEncoding above makes incoming chunks strings.
      for await (const chunk of request as AsyncIterable<string>) {
        chunks.push(Buffer.from(chunk));
      }
      calls.push({
        body: JSON.parse(Buffer.concat(chunks).toString()),
        method: request.method,
        url: request.url ?? "",
      });
      await reply(response);
    })().catch(() => {
      response.destroy();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = z
    .object({ port: z.number().int().positive() })
    .parse(server.address());
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  });
  const fetch: FalFetch = async (url, init) =>
    await globalThis.fetch(
      `http://127.0.0.1:${address.port}${new URL(url).pathname}`,
      init
    );
  return {
    calls,
    motif: createMotif({ falKey: "test", fetch, retries: 3 }),
    async expectDisconnected() {
      for (let attempt = 0; attempt < 50; attempt++) {
        if (disconnected) {
          break;
        }
        await delay(10);
      }
      expect(disconnected).toBe(true);
    },
  };
}

function sse(response: ServerResponse) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "x-fal-request-id": "req-local",
  });
  response.flushHeaders();
}

async function collect(stream: TaskStream) {
  const events = [];
  for await (const event of stream.events) {
    events.push(event);
  }
  return events;
}

describe("Task streaming over a real HTTP connection", () => {
  afterEach(async () => {
    await Promise.all(
      cleanup.splice(0).map(async (close) => {
        await close();
      })
    );
  });

  it("preserves UTF-8, split CRLF, comments, multiline data and event metadata", async () => {
    const fixture = await transport(async (response) => {
      sse(response);
      const bytes = Buffer.from(
        ': keepalive\r\nid: 7\r\nevent: preview\r\ndata: {"label":"café 🪵",\r\ndata: "images":[{"url":"https://example.com/preview.png"}]}\r\n\r\ndata: {"done":true}\n\n'
      );
      for (const byte of bytes) {
        if (response.destroyed) {
          return;
        }
        response.write(Buffer.from([byte]));
        await delay(1);
      }
      response.end();
    });
    const result = await fixture.motif.stream("generate", {
      model: "gpt2",
      prompt: "chair",
    });
    const stream = result._unsafeUnwrap();
    const events = await collect(stream);
    expect(stream.requestId).toBe("req-local");
    expect(events).toHaveLength(2);
    expect(events[0]?._unsafeUnwrap()).toMatchObject({
      type: "images",
      files: [{ key: "images", url: "https://example.com/preview.png" }],
      raw: {
        label: "café 🪵",
        images: [{ url: "https://example.com/preview.png" }],
      },
      event: "preview",
      id: "7",
    });
    expect(events[1]?._unsafeUnwrap()).toMatchObject({
      type: "provider",
      data: { done: true },
    });
    expect(fixture.calls).toMatchObject([
      {
        method: "POST",
        url: "/openai/gpt-image-2/stream",
      },
    ]);
  });

  it.each(["gpt2", "gpt", "flux2-dev"])(
    "normalises references for %s edit streaming",
    async (model) => {
      const fixture = await transport((response) => {
        sse(response);
        response.end('data: {"ok":true}\n\n');
      });
      const input = {
        model,
        prompt: "chair",
        references: [
          "https://example.com/layout.png",
          "https://example.com/oak.png",
        ],
      };
      const plan = fixture.motif.plan("generate", input)._unsafeUnwrap();
      const result = await fixture.motif.stream("generate", input);
      const stream = result._unsafeUnwrap();
      await collect(stream);
      expect(fixture.calls).toHaveLength(1);
      expect(fixture.calls[0]?.url).toBe(`/${plan.endpoint}/stream`);
      expect(fixture.calls[0]?.body).toStrictEqual(plan.body);
      expect(fixture.calls[0]?.body).toMatchObject({
        image_urls: input.references,
      });
    }
  );

  it("refuses unsupported routes and the default model before any I/O", async () => {
    let calls = 0;
    const fetch: FalFetch = () => {
      calls++;
      throw new Error("Network forbidden");
    };
    const motif = createMotif({ falKey: "test", openAiKey: "test", fetch });
    for (const input of [
      { prompt: "chair" },
      { prompt: "chair", model: "banana" },
      { prompt: "chair", model: "gpt2", transparent: true },
    ]) {
      const result = await motif.stream("generate", input);
      expect(result.isErr()).toBe(true);
    }
    expect(calls).toBe(0);
  });

  it("normalises explicit progress and preserves unfamiliar provider data", async () => {
    const fixture = await transport((response) => {
      sse(response);
      response.end(
        'data: {"progress":0.5,"message":"working"}\n\ndata: {"new_provider_field":[1,2]}\n\n'
      );
    });
    const result = await fixture.motif.stream("generate", {
      model: "gpt2",
      prompt: "chair",
    });
    const stream = result._unsafeUnwrap();
    const events = await collect(stream);
    expect(events.map((event) => event._unsafeUnwrap())).toMatchObject([
      {
        type: "progress",
        progress: 0.5,
        message: "working",
        raw: { progress: 0.5, message: "working" },
      },
      { type: "provider", data: { new_provider_field: [1, 2] } },
    ]);
  });

  it("lifts inline image bytes without calling them a preview or final", async () => {
    const inline = "data:image/png;base64,iVBORw0KGgo=";
    const fixture = await transport((response) => {
      sse(response);
      response.end(`data: ${JSON.stringify({ image: inline })}\n\n`);
    });
    const result = await fixture.motif.stream("generate", {
      model: "gpt2",
      prompt: "chair",
    });
    const stream = result._unsafeUnwrap();
    const events = await collect(stream);
    expect(events[0]?._unsafeUnwrap()).toMatchObject({
      type: "images",
      files: [{ key: "image", url: inline }],
    });
    expect(events[0]?._unsafeUnwrap()).not.toHaveProperty("preview");
    expect(events[0]?._unsafeUnwrap()).not.toHaveProperty("final");
  });

  it("does not retry a rejected paid POST even when retries are configured", async () => {
    const fixture = await transport((response) => {
      response.writeHead(503, { "x-fal-request-id": "req-failed" });
      response.end('{"detail":"unavailable"}');
    });
    const result = await fixture.motif.stream("generate", {
      model: "gpt2",
      prompt: "chair",
    });
    expect(result._unsafeUnwrapErr()).toMatchObject({
      status: 503,
      requestId: "req-failed",
    });
    expect(fixture.calls).toHaveLength(1);
  });

  it("does not submit an already cancelled request", async () => {
    let calls = 0;
    const fetch: FalFetch = () => {
      calls++;
      throw new Error("Network forbidden");
    };
    const controller = new AbortController();
    controller.abort();
    const result = await createMotif({ falKey: "test", fetch }).stream(
      "generate",
      { model: "gpt2", prompt: "chair" },
      { signal: controller.signal }
    );
    expect(result._unsafeUnwrapErr().code).toBe("ABORTED");
    expect(calls).toBe(0);
  });

  it.each([
    'event: error\ndata: {"detail":"generation failed"}\n\n',
    'data: {"error":"generation failed"}\n\n',
    "data: {broken json}\n\n",
  ])(
    "reports provider and malformed SSE errors instead of success",
    async (frame) => {
      const fixture = await transport((response) => {
        sse(response);
        response.end(frame);
      });
      const result = await fixture.motif.stream("generate", {
        model: "gpt2",
        prompt: "chair",
      });
      const stream = result._unsafeUnwrap();
      const events = await collect(stream);
      expect(events.some((event) => event.isErr())).toBe(true);
      expect(fixture.calls).toHaveLength(1);
    }
  );

  it("rejects non-SSE success responses", async () => {
    const fixture = await transport((response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"images":[]}');
    });
    const result = await fixture.motif.stream("generate", {
      model: "gpt2",
      prompt: "chair",
    });
    expect(result._unsafeUnwrapErr().code).toBe("INVALID_STREAM_RESPONSE");
  });

  it.each(["break", "abort", "signal"])(
    "closes the connection on %s",
    async (mode) => {
      const fixture = await transport((response) => {
        sse(response);
        response.write('data: {"ready":true}\n\n');
      });
      const controller = new AbortController();
      const result = await fixture.motif.stream(
        "generate",
        { model: "gpt2", prompt: "chair" },
        { signal: controller.signal }
      );
      const stream = result._unsafeUnwrap();
      let cancelled = false;
      if (mode === "break") {
        for await (const event of stream.events) {
          if (event.isOk()) {
            break;
          }
          continue;
        }
      } else {
        const iterator = stream.events[Symbol.asyncIterator]();
        await iterator.next();
        const pending = iterator.next();
        if (mode === "abort") {
          stream.abort();
        } else {
          controller.abort();
        }
        const next = await pending;
        cancelled = next.done === true ? true : next.value.isErr();
      }
      expect(mode === "break" || cancelled).toBe(true);
      await fixture.expectDisconnected();
      expect(fixture.calls).toHaveLength(1);
    }
  );

  it("keeps the deadline active after headers arrive", async () => {
    const fixture = await transport((response) => {
      sse(response);
    });
    const result = await fixture.motif.stream(
      "generate",
      { model: "gpt2", prompt: "chair" },
      { timeout: 60 }
    );
    const stream = result._unsafeUnwrap();
    const events = await collect(stream);
    expect(events.some((event) => event.isErr())).toBe(true);
    expect(events.find((event) => event.isErr())?._unsafeUnwrapErr().code).toBe(
      "TIMEOUT"
    );
    await fixture.expectDisconnected();
    expect(fixture.calls).toHaveLength(1);
  });
});
