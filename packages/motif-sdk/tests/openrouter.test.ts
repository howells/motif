import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createMotifImage } from "../src/image/index";
import {
  OPENROUTER_GEMINI_IMAGE_MODELS,
  openRouterModelSlug,
} from "../src/image/openrouter";
import { MotifError } from "../src/index";

const PNG_B64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]).toString("base64");

const bodySchema = z.record(z.string(), z.unknown());
const referencesSchema = z.array(
  z.object({ image_url: z.object({ url: z.string() }) })
);

interface Seen {
  url: string;
  authorization: string | null;
  body: Record<string, unknown>;
}

/** An injected fetch standing in for OpenRouter; records the request it saw. */
function fakeOpenRouter(
  seen: Seen[],
  reply: () => Response = () =>
    Response.json({
      data: [{ b64_json: PNG_B64, media_type: "image/png" }],
      usage: { cost: 0.0421 },
    })
) {
  return async (url: string, init: RequestInit = {}): Promise<Response> => {
    await Promise.resolve();
    seen.push({
      url,
      authorization: new Headers(init.headers).get("authorization"),
      body: bodySchema.parse(JSON.parse(z.string().parse(init.body))),
    });
    return reply();
  };
}

describe("OpenRouter model mapping", () => {
  it("maps every bare Gemini name to its google/ slug", () => {
    for (const [name, slug] of Object.entries(OPENROUTER_GEMINI_IMAGE_MODELS)) {
      expect(slug).toBe(`google/${name}`);
      expect(openRouterModelSlug(name)).toBe(slug);
    }
  });

  it("passes an OpenRouter slug through and rejects an unknown bare name", () => {
    expect(openRouterModelSlug("google/gemini-3.1-flash-image")).toBe(
      "google/gemini-3.1-flash-image"
    );
    expect(() => openRouterModelSlug("gemini-9-imaginary")).toThrow(MotifError);
  });
});

describe("OpenRouter adapter over the real image layer", () => {
  it("generates through /images with the slug, key and aspect ratio, and reports usage.cost", async () => {
    const seen: Seen[] = [];
    const img = createMotifImage({
      openrouter: { apiKey: "or-key" },
      fetch: fakeOpenRouter(seen),
    });
    const result = await img.generate({
      prompt: "a bare concrete wall",
      model: "gemini-3.1-flash-image",
      aspectRatio: "16:9",
    });

    expect(result.isOk()).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://openrouter.ai/api/v1/images");
    expect(seen[0]?.authorization).toBe("Bearer or-key");
    expect(seen[0]?.body).toMatchObject({
      model: "google/gemini-3.1-flash-image",
      prompt: "a bare concrete wall",
      aspect_ratio: "16:9",
    });
    if (result.isOk()) {
      expect(result.value.provider).toBe("openrouter");
      expect(result.value.images[0]?.mediaType).toBe("image/png");
      expect(result.value.cost).toStrictEqual({
        usd: 0.0421,
        source: "provider-metadata",
      });
    }
  });

  it("sends edit images as input_references data URLs", async () => {
    const seen: Seen[] = [];
    const img = createMotifImage({
      openrouter: { apiKey: "or-key" },
      fetch: fakeOpenRouter(seen),
    });
    const result = await img.edit({
      images: [
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ],
      instruction: "make it blue",
      model: "gemini-2.5-flash-image",
    });

    expect(result.isOk()).toBe(true);
    const refs = referencesSchema.parse(seen[0]?.body.input_references);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it("fails on a mask instead of dropping it", async () => {
    const seen: Seen[] = [];
    const img = createMotifImage({
      openrouter: { apiKey: "or-key" },
      fetch: fakeOpenRouter(seen),
    });
    const result = await img.edit({
      images: [new Uint8Array([1])],
      mask: new Uint8Array([2]),
      instruction: "x",
      model: "gemini-2.5-flash-image",
    });

    expect(result.isErr()).toBe(true);
    expect(seen).toHaveLength(0);
  });

  it("surfaces an OpenRouter error with its HTTP status", async () => {
    const img = createMotifImage({
      openrouter: { apiKey: "or-key" },
      fetch: fakeOpenRouter([], () =>
        Response.json(
          { error: { message: "No endpoints found for google/nope" } },
          { status: 404 }
        )
      ),
    });
    const result = await img.generate({
      prompt: "x",
      model: "google/nope",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status).toBe(404);
      expect(result.error.message).toContain("No endpoints found");
    }
  });

  it("fails on an unknown bare model name before any request", async () => {
    const seen: Seen[] = [];
    const img = createMotifImage({
      openrouter: { apiKey: "or-key" },
      fetch: fakeOpenRouter(seen),
    });
    const result = await img.generate({ prompt: "x", model: "gemini-9" });

    expect(result.isErr()).toBe(true);
    expect(seen).toHaveLength(0);
  });
});
