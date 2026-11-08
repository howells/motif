import { describe, expect, it } from "vitest";

import { estimateCost } from "../src/cost";
import { buildGenerateBody } from "../src/generate";
import { ImageSizeBoundsError } from "../src/index";
import { buildFalToolRequest } from "../src/tools";

describe(buildGenerateBody, () => {
  it.each(["flare", "sunburst"])(
    "routes %s generation and masked editing",
    (model) => {
      const generated = buildGenerateBody({
        model,
        prompt: "A ceramic vase",
        quality: "xhigh",
        transparent: true,
      });
      expect(generated.endpoint).toBe(
        `openai/gpt-image-2.6/${model}/text-to-image`
      );
      expect(generated.body).toMatchObject({
        quality: "xhigh",
        background: "transparent",
        output_format: "png",
      });
      expect(generated.body).not.toHaveProperty("reasoning_effort");
      const edited = buildGenerateBody({
        model,
        prompt: "Change the glaze",
        quality: "max",
        editImageUrls: ["https://example.com/vase.png"],
        maskImageUrl: "https://example.com/mask.png",
      });
      expect(edited.endpoint).toBe(`openai/gpt-image-2.6/${model}/edit`);
      expect(edited.body).toMatchObject({
        quality: "max",
        mask_url: "https://example.com/mask.png",
        image_urls: ["https://example.com/vase.png"],
      });
      expect(edited.body).not.toHaveProperty("mask_image_url");
      // An edit with no aspect keeps the edited image's shape.
      expect(edited.body.image_size).toBe("auto");
      expect(
        buildGenerateBody({
          aspect: "16:9",
          editImageUrls: ["https://example.com/vase.png"],
          model,
          prompt: "Change the glaze",
        }).body.image_size
      ).not.toBe("auto");
      expect(estimateCost(model)).toBeNull();
      expect(() =>
        buildGenerateBody({
          model,
          prompt: "Change the glaze",
          editImageUrls: Array.from(
            { length: 17 },
            () => "https://example.com/vase.png"
          ),
        })
      ).toThrow("at most 16 reference images");
    }
  );

  it.each(["flare", "sunburst"])(
    "defaults %s to max quality, with an explicit override",
    (model) => {
      expect(
        buildGenerateBody({ model, prompt: "A poster" }).body
      ).toMatchObject({ quality: "max" });
      const low = buildGenerateBody({
        model,
        prompt: "A poster",
        quality: "low",
      }).body;
      expect(low.quality).toBe("low");
      expect(low).not.toHaveProperty("reasoning_effort");
    }
  );

  it("routes Nano Banana 2.1 references and MAI 2.5's single-image edit", () => {
    const reference = "https://example.com/reference.png";
    const banana = buildGenerateBody({
      model: "banana21",
      prompt: "A poster",
      editImageUrls: [reference],
      resolution: "4K",
      aspect: "8:1",
    });
    expect(banana.endpoint).toBe("google/nano-banana-2.1/edit");
    expect(banana.body).toMatchObject({
      image_urls: [reference],
      resolution: "4K",
      aspect_ratio: "8:1",
    });
    expect(estimateCost("banana21", "4K")).toBeNull();
    const mai = buildGenerateBody({
      model: "mai-image-2.5",
      prompt: "A poster",
      editImageUrls: [reference],
    });
    expect(mai.endpoint).toBe("microsoft/mai-image-2.5/edit");
    expect(mai.body.image_urls).toEqual([reference]);
    expect(() =>
      buildGenerateBody({
        model: "mai-image-2.5",
        prompt: "A poster",
        editImageUrls: [reference, reference],
      })
    ).toThrow("at most 1 reference");
  });

  it("rejects xhigh and max quality on older GPT models", () => {
    expect(() =>
      buildGenerateBody({
        model: "gpt",
        prompt: "A ceramic vase",
        quality: "max",
      })
    ).toThrow("quality must be one of");
  });

  it("enriches creative direction before building the fal request body", () => {
    const { body } = buildGenerateBody({
      creative: {
        mood: "nocturne",
      },
      model: "banana",
      prompt: "luxury watch on black marble",
    });

    expect(body.prompt).toMatch(/^Luxury watch on black marble\. \S/);
    expect(body.prompt).not.toBe("luxury watch on black marble");
    expect(body).not.toHaveProperty("creative");
  });

  it("normalizes GPT Image 1.5 text generation controls", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "16:9",
      background: "transparent",
      model: "gpt",
      outputFormat: "png",
      prompt: "studio portrait",
      quality: "medium",
      syncMode: true,
    });

    expect(endpoint).toBe("fal-ai/gpt-image-1.5");
    expect(body).toMatchObject({
      background: "transparent",
      image_size: "1536x1024",
      num_images: 1,
      output_format: "png",
      prompt: "studio portrait",
      quality: "medium",
      sync_mode: true,
    });
  });

  it("rejects transparent output on a model with no background parameter", () => {
    // A PNG container alone cannot carry alpha. Fail rather than bill for an
    // opaque image the caller asked to be transparent.
    expect(() =>
      buildGenerateBody({
        model: "flux2-pro",
        prompt: "isolated paint chip",
        transparent: true,
      })
    ).toThrow("does not support transparent output");
  });

  it("keeps transparent output on the model that does carry a background parameter", () => {
    const { body } = buildGenerateBody({
      model: "gpt",
      prompt: "isolated paint chip",
      transparent: true,
    });

    expect(body).toMatchObject({
      background: "transparent",
      output_format: "png",
    });
  });

  it("normalizes GPT Image 1.5 edit controls and defaults edit size to auto", () => {
    const { endpoint, body } = buildGenerateBody({
      editImageUrls: ["https://example.com/ref.png"],
      inputFidelity: "high",
      maskImageUrl: "https://example.com/mask.png",
      model: "gpt",
      prompt: "replace the product label",
    });

    expect(endpoint).toBe("fal-ai/gpt-image-1.5/edit");
    expect(body).toMatchObject({
      image_size: "auto",
      image_urls: ["https://example.com/ref.png"],
      input_fidelity: "high",
      mask_image_url: "https://example.com/mask.png",
      prompt: "replace the product label",
      quality: "high",
    });
  });

  it("sizes GPT Image 2.6 exactly at the requested resolution", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "1:1",
      model: "sunburst",
      outputFormat: "png",
      prompt: "minimal square app icon",
    });

    expect(endpoint).toBe("openai/gpt-image-2.6/sunburst/text-to-image");
    expect(body).toMatchObject({
      image_size: { height: 2048, width: 2048 },
      output_format: "png",
      prompt: "minimal square app icon",
      quality: "max",
    });
  });

  it.each([
    ["4:3", "1K", { height: 1152, width: 1536 }],
    ["4:3", "4K", { height: 2448, width: 3264 }],
    ["16:9", "4K", { height: 2160, width: 3840 }],
    ["3:1", "4K", { height: 1280, width: 3840 }],
    ["1:1", "0.5K", { height: 816, width: 816 }],
  ] as const)(
    "keeps GPT Image 2.6 %s at %s inside fal's limits",
    (aspect, resolution, imageSize) => {
      const { body } = buildGenerateBody({
        aspect,
        model: "flare",
        prompt: "a room",
        resolution,
      });
      expect(body.image_size).toEqual(imageSize);
    }
  );

  it("refuses a GPT Image 2.6 edit resolution without an aspect", () => {
    expect(() =>
      buildGenerateBody({
        editImageUrls: ["https://example.com/room.png"],
        model: "sunburst",
        prompt: "extend the room",
        resolution: "4K",
      })
    ).toThrow("pass an aspect with resolution");
  });

  it("sizes a GPT Image 2.6 edit with an aspect at its resolution", () => {
    const { body } = buildGenerateBody({
      aspect: "4:3",
      editImageUrls: ["https://example.com/room.png"],
      model: "sunburst",
      prompt: "extend the room",
      resolution: "4K",
    });
    expect(body.image_size).toEqual({ height: 2448, width: 3264 });
  });

  it("normalizes GPT Image 2.6 edit masks, quality, sync mode, and custom image size", () => {
    const { endpoint, body } = buildGenerateBody({
      editImageUrls: ["https://example.com/interior.png"],
      imageSize: { height: 720, width: 1280 },
      maskImageUrl: "https://example.com/wall-mask.png",
      model: "sunburst",
      prompt: "change the wall color",
      quality: "auto",
      syncMode: true,
    });

    expect(endpoint).toBe("openai/gpt-image-2.6/sunburst/edit");
    expect(body).toMatchObject({
      image_size: { height: 720, width: 1280 },
      image_urls: ["https://example.com/interior.png"],
      mask_url: "https://example.com/wall-mask.png",
      prompt: "change the wall color",
      quality: "auto",
      sync_mode: true,
    });
  });

  it("routes Nano Banana 2 edits through the verified edit endpoint", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "16:9",
      editImageUrls: ["https://example.com/input.png"],
      enableWebSearch: true,
      model: "banana2",
      outputFormat: "webp",
      prompt: "make it a product photo",
      resolution: "4K",
      safetyTolerance: "3",
      seed: 42,
    });

    expect(endpoint).toBe("fal-ai/nano-banana-2/edit");
    expect(body).toMatchObject({
      aspect_ratio: "16:9",
      enable_web_search: true,
      image_urls: ["https://example.com/input.png"],
      num_images: 1,
      output_format: "webp",
      prompt: "make it a product photo",
      resolution: "4K",
      safety_tolerance: "3",
      seed: 42,
    });
  });

  it("normalizes Nano Banana 2 current API controls", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "auto",
      enableGoogleSearch: true,
      enableWebSearch: true,
      limitGenerations: false,
      model: "banana2",
      prompt: "grounded current product launch poster",
      resolution: "0.5K",
      syncMode: true,
      thinkingLevel: "minimal",
    });

    expect(endpoint).toBe("fal-ai/nano-banana-2");
    expect(body).toMatchObject({
      aspect_ratio: "auto",
      enable_google_search: true,
      enable_web_search: true,
      limit_generations: false,
      num_images: 1,
      prompt: "grounded current product launch poster",
      resolution: "0.5K",
      sync_mode: true,
      thinking_level: "minimal",
    });
  });

  it("normalizes FLUX.2 Flex controls to fal field names", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "4:3",
      enableSafetyChecker: false,
      guidanceScale: 3.5,
      model: "flux2-flex",
      numInferenceSteps: 24,
      outputFormat: "png",
      prompt: "sharp packaging mockup",
      seed: 7,
    });

    expect(endpoint).toBe("fal-ai/flux-2-flex");
    expect(body).toMatchObject({
      enable_safety_checker: false,
      guidance_scale: 3.5,
      image_size: "landscape_4_3",
      num_inference_steps: 24,
      output_format: "png",
      prompt: "sharp packaging mockup",
      seed: 7,
    });
    expect(body).not.toHaveProperty("num_images");
  });

  it("rejects unsupported output formats before fal rejects the request", () => {
    expect(() =>
      buildGenerateBody({
        model: "flux2-flex",
        outputFormat: "webp",
        prompt: "sharp packaging mockup",
      })
    ).toThrow("FLUX.2 Flex supports output formats: jpeg, png");
  });

  it("rejects options that the selected model does not support", () => {
    expect(() =>
      buildGenerateBody({
        model: "flux2-flex",
        prompt: "simple product render",
        quality: "high",
      })
    ).toThrow("FLUX.2 Flex does not support quality");

    expect(() =>
      buildGenerateBody({
        maskImageUrl: "https://example.com/mask.png",
        model: "gpt",
        prompt: "masked edit without edit image",
      })
    ).toThrow("maskImageUrl requires editImageUrls");

    expect(() =>
      buildGenerateBody({
        expandPrompt: true,
        model: "banana2",
        prompt: "unsupported prompt expansion",
      })
    ).toThrow("Nano Banana 2 does not support expandPrompt");

    expect(() =>
      buildGenerateBody({
        imageSize: { height: 720, width: 1280 },
        model: "banana2",
        prompt: "unsupported custom size",
      })
    ).toThrow("Nano Banana 2 does not support imageSize");
  });

  it("normalizes Grok resolution casing for fal", () => {
    const { endpoint, body } = buildGenerateBody({
      model: "grok-image",
      numImages: 2,
      prompt: "fast editorial sketch",
      resolution: "2K",
    });

    expect(endpoint).toBe("xai/grok-imagine-image");
    expect(body).toMatchObject({
      aspect_ratio: "1:1",
      num_images: 2,
      resolution: "2k",
    });
  });

  it("maps Seedream 5.0 Pro aspect to a fal image_size preset", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "16:9",
      model: "seedream5",
      prompt: "editorial hero shot",
      seed: 11,
      syncMode: true,
    });

    expect(endpoint).toBe("bytedance/seedream/v5/pro/text-to-image");
    expect(body).toMatchObject({
      image_size: "landscape_16_9",
      num_images: 1,
      prompt: "editorial hero shot",
      seed: 11,
      sync_mode: true,
    });
  });

  it("routes Seedream 5.0 Pro edits through the edit endpoint", () => {
    const { endpoint, body } = buildGenerateBody({
      editImageUrls: ["https://example.com/a.png", "https://example.com/b.png"],
      model: "seedream5",
      prompt: "swap the background",
    });

    expect(endpoint).toBe("bytedance/seedream/v5/pro/edit");
    expect(body).toMatchObject({
      image_urls: ["https://example.com/a.png", "https://example.com/b.png"],
      prompt: "swap the background",
    });
  });

  it("maps Seedream 5.0 Lite to its text-to-image endpoint", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "1:1",
      model: "seedream5-lite",
      numImages: 2,
      prompt: "sticker sheet",
    });

    expect(endpoint).toBe("bytedance/seedream/v5/lite/text-to-image");
    expect(body).toMatchObject({
      image_size: "square_hd",
      num_images: 2,
      prompt: "sticker sheet",
    });
  });

  it("routes Seedream 5.0 Lite edits through the edit endpoint", () => {
    const { endpoint, body } = buildGenerateBody({
      editImageUrls: ["https://example.com/logo.png"],
      model: "seedream5-lite",
      prompt: "recolor the logo",
    });

    expect(endpoint).toBe("bytedance/seedream/v5/lite/edit");
    expect(body).toMatchObject({
      image_urls: ["https://example.com/logo.png"],
    });
  });

  it("normalizes FLUX.2 Turbo controls to fal field names", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "4:3",
      enableSafetyChecker: false,
      guidanceScale: 2.5,
      model: "flux2-turbo",
      outputFormat: "webp",
      prompt: "fast concept sketch",
      seed: 3,
    });

    expect(endpoint).toBe("fal-ai/flux-2/turbo");
    expect(body).toMatchObject({
      enable_safety_checker: false,
      guidance_scale: 2.5,
      image_size: "landscape_4_3",
      num_images: 1,
      output_format: "webp",
      prompt: "fast concept sketch",
      seed: 3,
    });
  });

  it("maps Recraft V4.1 aspect to fal fields", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "16:9",
      model: "recraft41",
      prompt: "flat brand illustration",
    });

    expect(endpoint).toBe("fal-ai/recraft/v4.1/text-to-image");
    expect(body).toStrictEqual({
      image_size: "landscape_16_9",
      prompt: "flat brand illustration",
    });
  });

  it("refuses inputFidelity on a GPT Image 2.6 edit, which /edit doesn't take", () => {
    expect(() =>
      buildGenerateBody({
        editImageUrls: ["https://example.com/ref.png"],
        inputFidelity: "high",
        model: "sunburst",
        prompt: "replace the label",
      })
    ).toThrow("GPT Image 2.6 Sunburst does not support inputFidelity");
  });

  it("caps Grok Imagine Image references at fal's 3", () => {
    expect(() =>
      buildGenerateBody({
        editImageUrls: [1, 2, 3, 4].map((n) => `https://example.com/${n}.png`),
        model: "grok-image",
        prompt: "combine these",
      })
    ).toThrow("at most 3 reference images");
  });

  it("sends an exact size for a ratio no fal preset holds", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "2:3",
      model: "ideogram4",
      numImages: 2,
      prompt: "bold typographic poster",
      renderingSpeed: "QUALITY",
      seed: 5,
    });

    expect(endpoint).toBe("ideogram/v4");
    expect(body).toMatchObject({
      image_size: { height: 1008, width: 672 },
      num_images: 2,
      prompt: "bold typographic poster",
      rendering_speed: "QUALITY",
      seed: 5,
    });
  });

  it("sends FLUX.2 Pro 3:2 as exact dimensions in that ratio", () => {
    const { body } = buildGenerateBody({
      aspect: "3:2",
      model: "flux2-pro",
      prompt: "a harbour at dawn",
    });

    expect(body.image_size).toStrictEqual({ height: 672, width: 1008 });
  });

  it("scales an exact size up to a Model's minimum pixel count", () => {
    const { body } = buildGenerateBody({
      aspect: "3:2",
      model: "seedream5-lite",
      prompt: "a harbour at dawn",
    });

    expect(body.image_size).toStrictEqual({ height: 1568, width: 2352 });
  });

  it("refuses a ratio outside a Model's limits rather than rounding it", () => {
    expect(() =>
      buildGenerateBody({
        aspect: "4:1",
        model: "sunburst",
        prompt: "a banner",
      })
    ).toThrow(ImageSizeBoundsError);
  });

  it("keeps the named preset where one holds the ratio exactly", () => {
    const { body } = buildGenerateBody({
      aspect: "16:9",
      model: "flux2-pro",
      prompt: "a harbour at dawn",
    });

    expect(body.image_size).toBe("landscape_16_9");
  });
});

describe("newer model routes", () => {
  it("sends Muse Image a free aspect ratio and up to ten References", () => {
    const generated = buildGenerateBody({
      aspect: "16:9",
      model: "muse-image",
      prompt: "A plaster wall",
    });
    expect(generated.endpoint).toBe("meta/muse-image/text-to-image");
    expect(generated.body).toMatchObject({ aspect_ratio: "16:9" });
    expect(generated.body).not.toHaveProperty("resolution");
    const urls = Array.from(
      { length: 10 },
      (_, index) => `https://example.com/${index}.png`
    );
    const edited = buildGenerateBody({
      editImageUrls: urls,
      model: "muse-image",
      prompt: "Match the first",
    });
    expect(edited.endpoint).toBe("meta/muse-image/edit");
    expect(edited.body).toMatchObject({ image_urls: urls });
    expect(() =>
      buildGenerateBody({
        editImageUrls: [...urls, "https://example.com/10.png"],
        model: "muse-image",
        prompt: "Too many",
      })
    ).toThrow("at most 10 reference images");
    expect(() =>
      buildGenerateBody({ aspect: "auto", model: "muse-image", prompt: "x" })
    ).toThrow("aspect must be one of");
  });

  it("sends Krea 3 an exact image size and fal's own defaults", () => {
    const generated = buildGenerateBody({
      aspect: "21:9",
      model: "krea3",
      prompt: "A brick arch",
    });
    expect(generated.endpoint).toBe("krea/v3/text-to-image");
    expect(generated.body.image_size).toStrictEqual({
      height: 432,
      width: 1008,
    });
    // Ultra reasoning ignores image_size and costs a flat $0.27 or more, so
    // Motif leaves model and reasoning_level at fal's defaults.
    expect(generated.body).not.toHaveProperty("reasoning_level");
    expect(generated.body).not.toHaveProperty("model");
    expect(generated.body).not.toHaveProperty("num_images");
    const edited = buildGenerateBody({
      editImageUrls: ["https://example.com/a.png"],
      model: "krea3",
      prompt: "Make it dusk",
    });
    expect(edited.endpoint).toBe("krea/v3/edit");
    expect(edited.body.image_urls).toStrictEqual(["https://example.com/a.png"]);
    expect(() =>
      buildGenerateBody({ model: "krea3", numImages: 2, prompt: "x" })
    ).toThrow("Krea 3 does not support numImages");
    expect(() =>
      buildGenerateBody({
        editImageUrls: Array.from(
          { length: 9 },
          (_, index) => `https://example.com/${index}.png`
        ),
        model: "krea3",
        prompt: "x",
      })
    ).toThrow("at most 8 reference images");
  });

  it("routes Qwen Image 3 edits to its edit endpoint with up to three References", () => {
    const edited = buildGenerateBody({
      editImageUrls: ["https://example.com/a.png", "https://example.com/b.png"],
      model: "qwen3",
      prompt: "Swap the tile",
    });
    expect(edited.endpoint).toBe("alibaba/qwen-image-3/edit");
    expect(edited.body.image_urls).toHaveLength(2);
    expect(() =>
      buildGenerateBody({
        editImageUrls: Array.from(
          { length: 4 },
          (_, index) => `https://example.com/${index}.png`
        ),
        model: "qwen3",
        prompt: "x",
      })
    ).toThrow("at most 3 reference images");
  });

  it("sends Grok Imagine Image Quality a lowercase resolution", () => {
    const generated = buildGenerateBody({
      model: "grok-image-quality",
      prompt: "A terrazzo floor",
      resolution: "2K",
    });
    expect(generated.endpoint).toBe(
      "xai/grok-imagine-image/quality/text-to-image"
    );
    expect(generated.body).toMatchObject({
      aspect_ratio: "1:1",
      resolution: "2k",
    });
    const edited = buildGenerateBody({
      editImageUrls: ["https://example.com/a.png"],
      model: "grok-image-quality",
      prompt: "Make it matte",
      resolution: "1K",
    });
    expect(edited.endpoint).toBe("xai/grok-imagine-image/quality/edit");
    expect(edited.body).toMatchObject({ resolution: "1k" });
    expect(() =>
      buildGenerateBody({
        model: "grok-image-quality",
        prompt: "x",
        resolution: "4K",
      })
    ).toThrow("resolution must be one of");
  });
});

describe(buildFalToolRequest, () => {
  it("normalizes SAM 3 image options into the fal request body", () => {
    const { endpoint, body } = buildFalToolRequest({
      input: "https://example.com/input.png",
      options: {
        apply_mask: false,
        max_masks: 5,
        prompt: "shoe",
      },
      tool: "sam3-image",
    });

    expect(endpoint).toBe("fal-ai/sam-3/image");
    expect(body).toMatchObject({
      apply_mask: false,
      image_url: "https://example.com/input.png",
      max_masks: 5,
      output_format: "png",
      prompt: "shoe",
    });
  });

  it("uses batch image input for the NSFW checker", () => {
    const { endpoint, body } = buildFalToolRequest({
      inputs: ["https://example.com/a.png", "https://example.com/b.png"],
      tool: "nsfw",
    });

    expect(endpoint).toBe("fal-ai/x-ailab/nsfw");
    expect(body).toStrictEqual({
      image_urls: ["https://example.com/a.png", "https://example.com/b.png"],
    });
  });

  it("exposes fal image utility defaults for depth tools", () => {
    const { endpoint, body } = buildFalToolRequest({
      input: "https://example.com/input.png",
      tool: "marigold-depth",
    });

    expect(endpoint).toBe("fal-ai/imageutils/marigold-depth");
    expect(body).toMatchObject({
      ensemble_size: 10,
      image_url: "https://example.com/input.png",
      num_inference_steps: 10,
    });
  });
});
