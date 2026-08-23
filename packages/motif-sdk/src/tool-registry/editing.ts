// Tools that alter part of a frame while keeping the rest: erasing and filling,
// reframing onto a new canvas, and relighting.
//
// Part of the FAL_TOOLS registry; `../tools` assembles the groups and is the
// module every consumer imports.

import type { FalToolConfig } from "../tool-types";

export const EDITING_TOOLS = {
  "bria-eraser": {
    category: "erase",
    description:
      "Commercial-safe removal of a masked region, inpainted from surrounding context.",
    endpoint: "fal-ai/bria/eraser",
    inputField: "image_url",
    inputKind: "image",
    name: "Bria Eraser",
    outputKeys: ["image"],
    price: { kind: "call", usd: 0.04 },
    pricing: "$0.04/generation",
    sourceUrl: "https://fal.ai/models/fal-ai/bria/eraser",
    task: "masked object erasure",
  },
  "bria-expand": {
    category: "reframe",
    description:
      "Expand an image onto a larger canvas, generating the new border area.",
    endpoint: "fal-ai/bria/expand",
    inputField: "image_url",
    inputKind: "image",
    name: "Bria Image Expansion",
    outputKeys: ["image"],
    price: { kind: "call", usd: 0.04 },
    pricing: "$0.04/generation",
    sourceUrl: "https://fal.ai/models/fal-ai/bria/expand",
    task: "image outpainting",
  },
  "bria-genfill": {
    category: "erase",
    description:
      "Generative fill of a masked region from a prompt, commercial-safe.",
    endpoint: "fal-ai/bria/genfill",
    inputField: "image_url",
    inputKind: "image",
    name: "Bria GenFill",
    outputKeys: ["images"],
    price: { kind: "call", usd: 0.04 },
    pricing: "$0.04/generation",
    sourceUrl: "https://fal.ai/models/fal-ai/bria/genfill",
    task: "masked generative fill",
  },
  "finegrain-eraser": {
    category: "erase",
    description:
      "Remove a prompted object and its shadows and reflections, filling the gap.",
    endpoint: "fal-ai/finegrain-eraser",
    inputField: "image_url",
    inputKind: "image",
    name: "Finegrain Object Eraser",
    outputKeys: ["image"],
    price: { kind: "call", usd: 0.27 },
    pricing:
      "$0.27/image at the default standard mode; $0.18 express, $0.36 premium",
    sourceUrl: "https://fal.ai/models/fal-ai/finegrain-eraser",
    task: "prompted object erasure",
  },
  "flux-outpaint": {
    category: "reframe",
    description:
      "Outpaint an image by a per-edge pixel expansion with FLUX.2 pro.",
    endpoint: "fal-ai/flux-2-pro/outpaint",
    inputField: "image_url",
    inputKind: "image",
    name: "FLUX.2 Pro Outpaint",
    outputKeys: ["images"],
    price: { kind: "metered" },
    pricing:
      "$0.03 for the first output megapixel, then $0.015 per extra megapixel of input and output, rounded up",
    sourceUrl: "https://fal.ai/models/fal-ai/flux-2-pro/outpaint",
    task: "image outpainting",
  },
  "iclight-v2": {
    category: "relight",
    description:
      "Relight a subject from a prompt, harmonising it with a new light direction.",
    endpoint: "fal-ai/iclight-v2",
    inputField: "image_url",
    inputKind: "image",
    name: "IC-Light v2",
    outputKeys: ["images"],
    price: { kind: "megapixel", usd: 0.1 },
    pricing: "$0.10/megapixel",
    sourceUrl: "https://fal.ai/models/fal-ai/iclight-v2",
    task: "prompted relighting",
  },
  "ideogram-reframe": {
    category: "reframe",
    description: "Reframe an image to a new aspect ratio, generating the fill.",
    endpoint: "fal-ai/ideogram/v3/reframe",
    inputField: "image_url",
    inputKind: "image",
    name: "Ideogram v3 Reframe",
    outputKeys: ["images"],
    price: { kind: "call", usd: 0.06 },
    pricing:
      "$0.06/image at the default BALANCED speed; $0.03 turbo, $0.09 quality",
    sourceUrl: "https://fal.ai/models/fal-ai/ideogram/v3/reframe",
    task: "aspect ratio reframing",
  },
  "lighting-restoration": {
    category: "relight",
    description:
      "Restore natural, even lighting across one or more input images.",
    endpoint: "fal-ai/qwen-image-edit-plus-lora-gallery/lighting-restoration",
    inputField: "image_urls",
    inputKind: "images",
    name: "Qwen Lighting Restoration",
    outputKeys: ["images"],
    price: { kind: "megapixel", usd: 0.035 },
    pricing: "$0.035/megapixel",
    sourceUrl:
      "https://fal.ai/models/fal-ai/qwen-image-edit-plus-lora-gallery/lighting-restoration",
    task: "lighting restoration",
  },
  "object-removal": {
    category: "erase",
    description: "Remove a prompted object from an image and fill the gap.",
    endpoint: "fal-ai/object-removal",
    inputField: "image_url",
    inputKind: "image",
    name: "Object Removal",
    outputKeys: ["images"],
    price: { kind: "call", usd: 0.024 },
    pricing:
      "$0.024/image at the default best quality; $0.006 low, $0.012 medium, $0.018 high",
    sourceUrl: "https://fal.ai/models/fal-ai/object-removal",
    task: "prompted object removal",
  },
  "object-removal-bbox": {
    category: "erase",
    description: "Remove whatever falls inside supplied bounding boxes.",
    endpoint: "fal-ai/object-removal/bbox",
    inputField: "image_url",
    inputKind: "image",
    name: "Object Removal by Box",
    outputKeys: ["images"],
    price: { kind: "call", usd: 0.024 },
    pricing:
      "$0.024/image at the default best quality; $0.006 low, $0.012 medium, $0.018 high",
    sourceUrl: "https://fal.ai/models/fal-ai/object-removal/bbox",
    task: "bounding box object removal",
  },
  "object-removal-mask": {
    category: "erase",
    description: "Remove the masked region of an image and fill the gap.",
    endpoint: "fal-ai/object-removal/mask",
    inputField: "image_url",
    inputKind: "image",
    name: "Object Removal by Mask",
    outputKeys: ["images"],
    price: { kind: "call", usd: 0.024 },
    pricing:
      "$0.024/image at the default best quality; $0.006 low, $0.012 medium, $0.018 high",
    sourceUrl: "https://fal.ai/models/fal-ai/object-removal/mask",
    task: "masked object removal",
  },
  "remove-lighting": {
    category: "relight",
    description:
      "Strip baked-in lighting and shadows to leave a flat, neutral surface.",
    endpoint: "fal-ai/qwen-image-edit-plus-lora-gallery/remove-lighting",
    inputField: "image_urls",
    inputKind: "images",
    name: "Qwen Remove Lighting",
    outputKeys: ["images"],
    price: { kind: "megapixel", usd: 0.035 },
    pricing: "$0.035/megapixel",
    sourceUrl:
      "https://fal.ai/models/fal-ai/qwen-image-edit-plus-lora-gallery/remove-lighting",
    task: "lighting removal",
  },
  "smart-resize": {
    category: "reframe",
    description:
      "Resize one image to several target sizes, recomposing rather than cropping.",
    endpoint: "fal-ai/smart-resize",
    inputField: "image_url",
    inputKind: "image",
    name: "Smart Resize",
    outputKeys: ["images", "results"],
    price: { kind: "metered" },
    pricing:
      "$0.15 per output image, doubled at 4K, plus a $0.05 vision analysis fee per request",
    queued: true,
    sourceUrl: "https://fal.ai/models/fal-ai/smart-resize",
    task: "multi-size recomposition",
  },
  "text-removal": {
    category: "erase",
    defaultOptions: {
      output_format: "png",
    },
    description:
      "Remove all rendered text from an image, rebuilding what sat behind it.",
    endpoint: "fal-ai/image-editing/text-removal",
    inputField: "image_url",
    inputKind: "image",
    name: "Text Removal",
    outputKeys: ["images"],
    price: { kind: "call", usd: 0.04 },
    pricing: "$0.04/image",
    sourceUrl: "https://fal.ai/models/fal-ai/image-editing/text-removal",
    task: "text removal",
  },
} as const satisfies Record<string, FalToolConfig>;
