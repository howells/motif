/**
 * MCP tools — InMemoryTransport tests
 *
 * Tests the MCP server using InMemoryTransport + Client so the full
 * protocol stack is exercised (capability handshake, ListTools, CallTool)
 * without stdio, subprocesses, or real fal.ai API calls.
 */

import type { MotifServer } from "@howells/motif-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";

import { createMotifMcpServer } from "../src/create-server.js";
import { readHistory } from "../src/history.js";
import type { HistoryResult } from "../src/history.js";

// ─── History mock ────────────────────────────────────────────────────
// vi.mock is hoisted — inline the value; cannot reference module-scope vars.
// (a `type`-only import above is compile-time-only, so it's safe to use here.)

vi.mock("../src/history.js", () => ({
  readHistory: vi
    .fn<(limit?: number, offset?: number) => HistoryResult>()
    .mockReturnValue({
      costs: { allTime: 0.26, session: 0.13, today: 0.13 },
      generations: [
        {
          aspect: "16:9",
          cost: 0.13,
          filePath: "/Users/example/motif-abc.png",
          id: "abc123",
          model: "gpt",
          prompt: "a red fox",
          resolution: "2K",
          timestamp: "2026-04-23T10:00:00.000Z",
        },
      ],
      hasMore: false,
      limit: 10,
      offset: 0,
      total: 1,
    }),
}));

// ─── Result-parsing helpers ─────────────────────────────────────────
//
// `client.callTool()`/`client.readResource()` return protocol-level content
// blocks (`{ type: "text", text: string } | { type: "image", ... } | ...`);
// each tool response is itself a JSON string. Narrowing via `block.type ===
// "text"` is a real type guard (no cast needed); JSON.parse's `any` return
// can't be avoided without a schema validator, so that one unsafe cast is
// isolated here instead of repeated at every call site below.

const getTextBlock = (result: CallToolResult): string => {
  const [block] = result.content;
  if (block?.type === "text") {
    return block.text;
  }
  throw new Error("Expected a text content block in tool result");
};

// `T` is return-position-only by design (see parseArgs in create-server.ts
// for the same shape/reasoning) — every call site names it explicitly since
// there is nothing to infer it from.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-parameters -- see comment above
const parseJson = <T>(text: string): T => JSON.parse(text) as T;

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- forwards the same intentionally-explicit T to parseJson, see comment above
const parseToolResult = <T>(result: CallToolResult): T =>
  parseJson<T>(getTextBlock(result));

// The MCP SDK types `Tool.inputSchema.properties` as a generic JSON-schema
// property bag; these tests assert on the specific shape TOOLS (in
// create-server.ts) actually declares, which isn't expressible without a
// narrowing assertion. A wrong shape fails loudly at the `expect` calls
// right after, so this isn't hiding a real bug class.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-parameters -- see comment above
const asSchemaProperties = <T>(properties: unknown): T => properties as T;

// ─── Mock helpers ────────────────────────────────────────────────────

const makeOk = <T>(value: T) => ({
  isErr: () => false,
  isOk: () => true,
  value,
});

const makeErr = (message: string) => ({
  error: { code: "GENERATION_FAILED", message },
  isErr: () => true,
  isOk: () => false,
});

const MOCK_IMAGES = [
  { height: 1024, url: "https://fal.media/img.png", width: 1024 },
];

/**
 * Build a mock `MotifServer`, returning both the strictly-typed `motif`
 * object (for `createMotifMcpServer`) and standalone references to each mock
 * function.
 *
 * Tests assert against and reconfigure the standalone references (e.g.
 * `generate.mockResolvedValue(...)`, `expect(generate).toHaveBeenCalledWith`)
 * rather than `motif.generate` — `motif` is cast to the real `MotifServer`
 * type below, so going through it would need an unsafe cast back to a Mock
 * on every read, and passing a still-bound object property straight to
 * `expect()`/`toHaveBeenCalledWith` is exactly the "unbound method" pattern
 * that pattern warns about. A plain local reference to the same underlying
 * mock sidesteps both without changing what's being tested.
 */
const makeMockMotif = () => {
  const estimateCost = vi
    .fn<(model: string, resolution?: string, numImages?: number) => number>()
    .mockReturnValue(0.13);
  const generate = vi
    .fn<(options: unknown) => Promise<unknown>>()
    .mockResolvedValue(makeOk({ images: MOCK_IMAGES, seed: 42 }));
  const removeBackground = vi
    .fn<(options: unknown) => Promise<unknown>>()
    .mockResolvedValue(
      makeOk({ images: [{ url: "https://fal.media/transparent.png" }] })
    );
  const upscale = vi
    .fn<(options: unknown) => Promise<unknown>>()
    .mockResolvedValue(
      makeOk({
        images: [
          {
            height: 2048,
            url: "https://fal.media/upscaled.png",
            width: 2048,
          },
        ],
      })
    );

  // The mock intentionally implements only the four methods create-server.ts
  // actually calls, not the full `MotifServer` surface (auth, request
  // internals, etc.) — there is no subset-safe way to express that in TS.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see comment above
  const motif = {
    estimateCost,
    generate,
    removeBackground,
    upscale,
  } as unknown as MotifServer;

  return { estimateCost, generate, motif, removeBackground, upscale };
};

// ─── Connect client ──────────────────────────────────────────────────

const makeClient = async (motif: MotifServer) => {
  const server = createMotifMcpServer(motif);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
};

// ─── Tool listing ────────────────────────────────────────────────────

describe("ListTools", () => {
  it("exposes exactly 5 tools", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(5);
  });

  it("tools have expected names", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("generate");
    expect(names).toContain("upscale");
    expect(names).toContain("remove_background");
    expect(names).toContain("vary");
    expect(names).toContain("history");
  });

  it("all tools have annotations", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(
        tool.annotations,
        `${tool.name} should have annotations`
      ).toBeDefined();
    }
  });

  it("generation tools have readOnlyHint: false and openWorldHint: true", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const { tools } = await client.listTools();
    const generationTools = tools.filter((t) => t.name !== "history");
    for (const tool of generationTools) {
      expect(tool.annotations?.readOnlyHint, `${tool.name} readOnlyHint`).toBe(
        false
      );
      expect(
        tool.annotations?.openWorldHint,
        `${tool.name} openWorldHint`
      ).toBe(true);
    }
  });

  it("history tool has readOnlyHint: true and openWorldHint: false", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const { tools } = await client.listTools();
    const historyTool = tools.find((t) => t.name === "history");
    expect(historyTool?.annotations?.readOnlyHint).toBe(true);
    expect(historyTool?.annotations?.openWorldHint).toBe(false);
  });

  it("all tools have outputSchema", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(
        tool.outputSchema,
        `${tool.name} should have outputSchema`
      ).toBeDefined();
    }
  });

  it("generate tool requires prompt", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const { tools } = await client.listTools();
    const generate = tools.find((t) => t.name === "generate");
    expect(generate?.inputSchema.required).toContain("prompt");
  });

  it("generate schema advertises current model, aspect, and resolution enums", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const { tools } = await client.listTools();
    const generate = tools.find((t) => t.name === "generate");
    const properties = asSchemaProperties<Record<string, { enum?: string[] }>>(
      generate?.inputSchema.properties
    );

    expect(properties.model?.enum).toContain("banana2");
    expect(properties.model?.enum).toContain("qwen");
    expect(properties.aspect?.enum).toContain("auto");
    expect(properties.aspect?.enum).toContain("8:1");
    expect(properties.resolution?.enum).toContain("0.5K");
  });

  it("generate schema advertises creative direction options", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const { tools } = await client.listTools();
    const generate = tools.find((t) => t.name === "generate");
    const properties = asSchemaProperties<
      Record<string, { properties?: Record<string, { enum?: string[] }> }>
    >(generate?.inputSchema.properties);

    expect(properties.creative?.properties?.recipe?.enum).toContain(
      "cinematic"
    );
    expect(properties.creative?.properties?.lighting?.enum).toContain("rim");
    expect(properties.creative?.properties?.material?.enum).toContain(
      "reflective"
    );
  });

  it("vary tool requires prompt and imageUrls", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const { tools } = await client.listTools();
    const vary = tools.find((t) => t.name === "vary");
    expect(vary?.inputSchema.required).toContain("prompt");
    expect(vary?.inputSchema.required).toContain("imageUrls");
  });

  it("vary schema advertises creative direction options", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const { tools } = await client.listTools();
    const vary = tools.find((t) => t.name === "vary");
    const properties = asSchemaProperties<
      Record<string, { properties?: Record<string, { enum?: string[] }> }>
    >(vary?.inputSchema.properties);

    expect(properties.creative?.properties?.shot?.enum).toContain("close-up");
    expect(properties.creative?.properties?.genre?.enum).toContain("film-noir");
  });
});

// ─── Resources ───────────────────────────────────────────────────────

describe("Resources", () => {
  it("exposes read-only registry resources", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const { resources } = await client.listResources();
    const uris = resources.map((resource) => resource.uri);

    expect(uris).toContain("motif://models");
    expect(uris).toContain("motif://tools");
    expect(uris).toContain("motif://leaderboards");
    expect(uris).toContain("motif://history/schema");
  });

  it("reads model registry resource as JSON", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const result = await client.readResource({ uri: "motif://models" });

    const [content] = result.contents;
    expect(content?.mimeType).toBe("application/json");
    if (!content || !("text" in content)) {
      throw new Error("Expected text resource content");
    }
    const parsed = parseJson<{ gpt: { endpoint: string } }>(content.text);
    expect(parsed.gpt).toMatchObject({
      endpoint: "fal-ai/gpt-image-1.5",
    });
  });

  it("reads history schema without exposing local history values", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const result = await client.readResource({ uri: "motif://history/schema" });

    const [content] = result.contents;
    if (!content || !("text" in content)) {
      throw new Error("Expected text resource content");
    }
    const parsed = parseJson<{ required: string[] }>(content.text);
    expect(parsed.required).toContain("generations");
    expect(JSON.stringify(parsed)).not.toContain("a red fox");
  });
});

// ─── generate tool ───────────────────────────────────────────────────

describe("generate tool", () => {
  it("calls motif.generate with prompt and default model", async () => {
    const { generate, motif } = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: { prompt: "a red fox" },
      name: "generate",
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt", prompt: "a red fox" })
    );
  });

  it("returns images array in structuredContent", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const result = await client.callTool({
      arguments: { prompt: "a fox" },
      name: "generate",
    });

    const parsed = parseToolResult<{ images: { url: string }[] }>(result);
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0].url).toBe("https://fal.media/img.png");
  });

  it("includes cost_estimate in response", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const result = await client.callTool({
      arguments: { prompt: "a fox" },
      name: "generate",
    });

    const parsed = parseToolResult<{ cost_estimate: number }>(result);
    expect(typeof parsed.cost_estimate).toBe("number");
  });

  it("omits optional dimensions when fal does not return them", async () => {
    const { generate, motif } = makeMockMotif();
    generate.mockResolvedValue(
      makeOk({
        images: [
          { height: null, url: "https://fal.media/no-dims.png", width: null },
        ],
      })
    );
    const client = await makeClient(motif);

    const result = await client.callTool({
      arguments: { prompt: "a fox" },
      name: "generate",
    });

    const parsed = parseToolResult<{ images: { url: string }[] }>(result);
    expect(parsed.images[0]).toEqual({ url: "https://fal.media/no-dims.png" });
  });

  it("resolves preset to aspect ratio", async () => {
    const { generate, motif } = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: { preset: "landscape", prompt: "a fox" },
      name: "generate",
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ aspect: "16:9" })
    );
  });

  it("passes current generation controls through to motif.generate", async () => {
    const { generate, motif } = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: {
        aspect: "auto",
        enableGoogleSearch: true,
        enableWebSearch: true,
        model: "banana2",
        outputFormat: "png",
        prompt: "a fox",
        resolution: "0.5K",
        seed: 42,
      },
      name: "generate",
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        aspect: "auto",
        enableGoogleSearch: true,
        enableWebSearch: true,
        model: "banana2",
        outputFormat: "png",
        prompt: "a fox",
        resolution: "0.5K",
        seed: 42,
      })
    );
  });

  it("passes creative direction through to motif.generate", async () => {
    const { generate, motif } = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: {
        creative: { lighting: "rim", material: "reflective" },
        prompt: "a fox",
      },
      name: "generate",
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        creative: { lighting: "rim", material: "reflective" },
        prompt: "a fox",
      })
    );
  });

  it("returns structured tool errors when generate fails", async () => {
    const { generate, motif } = makeMockMotif();
    generate.mockResolvedValue(makeErr("fal.ai 502"));
    const client = await makeClient(motif);

    const result = await client.callTool({
      arguments: { prompt: "a fox" },
      name: "generate",
    });

    expect(result.isError).toBe(true);
    const parsed = parseToolResult<{
      code: string;
      error: boolean;
      is_retriable: boolean;
      message: string;
    }>(result);
    expect(parsed).toMatchObject({
      code: "GENERATION_FAILED",
      error: true,
      is_retriable: true,
      message: "fal.ai 502",
    });
  });
});

// ─── upscale tool ────────────────────────────────────────────────────

describe("upscale tool", () => {
  it("calls motif.upscale with imageUrl and default model", async () => {
    const { motif, upscale } = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: { imageUrl: "https://example.com/img.png" },
      name: "upscale",
    });

    expect(upscale).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://example.com/img.png",
        model: "clarity",
      })
    );
  });

  it("returns upscaled image URL", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const result = await client.callTool({
      arguments: { imageUrl: "https://example.com/img.png" },
      name: "upscale",
    });

    const parsed = parseToolResult<{ images: { url: string }[] }>(result);
    expect(parsed.images[0].url).toBe("https://fal.media/upscaled.png");
  });
});

// ─── remove_background tool ──────────────────────────────────────────

describe("remove_background tool", () => {
  it("calls motif.removeBackground with imageUrl and default model", async () => {
    const { motif, removeBackground } = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: { imageUrl: "https://example.com/img.png" },
      name: "remove_background",
    });

    expect(removeBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://example.com/img.png",
        model: "rmbg",
      })
    );
  });

  it("returns transparent PNG URL", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const result = await client.callTool({
      arguments: { imageUrl: "https://example.com/img.png" },
      name: "remove_background",
    });

    const parsed = parseToolResult<{ images: { url: string }[] }>(result);
    expect(parsed.images[0].url).toBe("https://fal.media/transparent.png");
  });
});

// ─── vary tool ───────────────────────────────────────────────────────

describe("vary tool", () => {
  it("calls motif.generate with editImageUrls", async () => {
    const { generate, motif } = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: {
        imageUrls: ["https://example.com/ref.png"],
        prompt: "make it blue",
      },
      name: "vary",
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        editImageUrls: ["https://example.com/ref.png"],
        prompt: "make it blue",
      })
    );
  });

  it("passes inputFidelity when provided", async () => {
    const { generate, motif } = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: {
        imageUrls: ["https://example.com/ref.png"],
        inputFidelity: "high",
        prompt: "variation",
      },
      name: "vary",
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ inputFidelity: "high" })
    );
  });

  it("passes creative direction through to motif.generate", async () => {
    const { generate, motif } = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: {
        creative: { genre: "film-noir", shot: "close-up" },
        imageUrls: ["https://example.com/ref.png"],
        prompt: "variation",
      },
      name: "vary",
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        creative: { genre: "film-noir", shot: "close-up" },
        editImageUrls: ["https://example.com/ref.png"],
        prompt: "variation",
      })
    );
  });

  it("returns image variation URLs when fal omits dimensions", async () => {
    const { generate, motif } = makeMockMotif();
    generate.mockResolvedValue(
      makeOk({
        images: [
          { height: null, url: "https://fal.media/variation.png", width: null },
        ],
      })
    );
    const client = await makeClient(motif);

    const result = await client.callTool({
      arguments: {
        imageUrls: ["https://example.com/ref.png"],
        prompt: "variation",
      },
      name: "vary",
    });

    const parsed = parseToolResult<{ images: { url: string }[] }>(result);
    expect(parsed.images[0]).toEqual({
      url: "https://fal.media/variation.png",
    });
  });
});

// ─── history tool ────────────────────────────────────────────────────

describe("history tool", () => {
  it("calls readHistory with default limit and offset", async () => {
    const client = await makeClient(makeMockMotif().motif);

    await client.callTool({ arguments: {}, name: "history" });

    expect(readHistory).toHaveBeenCalledWith(10, 0);
  });

  it("passes custom limit and offset to readHistory", async () => {
    const client = await makeClient(makeMockMotif().motif);

    await client.callTool({
      arguments: { limit: 5, offset: 20 },
      name: "history",
    });

    expect(readHistory).toHaveBeenCalledWith(5, 20);
  });

  it("returns generations array in response", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const result = await client.callTool({ arguments: {}, name: "history" });

    const parsed = parseToolResult<HistoryResult>(result);
    expect(parsed.generations).toHaveLength(1);
    expect(parsed.generations[0]?.prompt).toBe("a red fox");
    expect(parsed.generations[0]?.filePath).toBe(
      "/Users/example/motif-abc.png"
    );
  });

  it("returns pagination metadata", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const result = await client.callTool({ arguments: {}, name: "history" });

    const parsed = parseToolResult<HistoryResult>(result);
    expect(parsed.total).toBe(1);
    expect(parsed.hasMore).toBe(false);
    expect(typeof parsed.offset).toBe("number");
    expect(typeof parsed.limit).toBe("number");
  });

  it("returns cost summary", async () => {
    const client = await makeClient(makeMockMotif().motif);
    const result = await client.callTool({ arguments: {}, name: "history" });

    const parsed = parseToolResult<HistoryResult>(result);
    expect(typeof parsed.costs.allTime).toBe("number");
    expect(typeof parsed.costs.today).toBe("number");
    expect(typeof parsed.costs.session).toBe("number");
  });
});

// ─── Unknown tool ────────────────────────────────────────────────────

describe("unknown tool", () => {
  it("throws MethodNotFound for unknown tool names", async () => {
    const client = await makeClient(makeMockMotif().motif);

    await expect(
      client.callTool({ arguments: {}, name: "nonexistent" })
    ).rejects.toThrow("Unknown tool: nonexistent");
  });
});
