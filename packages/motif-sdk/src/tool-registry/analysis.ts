// Tools that read an image and return a description, a location, or a verdict
// rather than a new image: captioning, VQA, detection, OCR, and moderation.
//
// Part of the FAL_TOOLS registry; `../tools` assembles the groups and is the
// module every consumer imports.

import type { FalToolConfig } from "../tool-types";

export const ANALYSIS_TOOLS = {
  "got-ocr": {
    category: "analysis",
    description:
      "Transcribe text from one or more images, optionally as formatted multi-page output.",
    endpoint: "fal-ai/got-ocr/v2",
    inputField: "input_image_urls",
    inputKind: "images",
    name: "GOT-OCR 2.0",
    outputKeys: ["outputs"],
    price: { kind: "metered" },
    pricing: "$0.05/image",
    queued: true,
    sourceUrl: "https://fal.ai/models/fal-ai/got-ocr/v2",
    task: "optical character recognition",
  },
  "moondream-caption": {
    category: "analysis",
    description: "Write a short, normal, or long caption for an image.",
    endpoint: "fal-ai/moondream3-preview/caption",
    inputField: "image_url",
    inputKind: "image",
    name: "Moondream 3 Caption",
    outputKeys: ["output"],
    price: { kind: "metered" },
    pricing: "$0.40/M input tokens, $3.50/M output tokens",
    sourceUrl: "https://fal.ai/models/fal-ai/moondream3-preview/caption",
    task: "image captioning",
  },
  "moondream-detect": {
    category: "analysis",
    description:
      "Detect prompted objects and return their bounding boxes, with an optional preview.",
    endpoint: "fal-ai/moondream3-preview/detect",
    inputField: "image_url",
    inputKind: "image",
    name: "Moondream 3 Detect",
    outputKeys: ["objects", "image"],
    price: { kind: "metered" },
    pricing: "$0.40/M input tokens, $3.50/M output tokens",
    sourceUrl: "https://fal.ai/models/fal-ai/moondream3-preview/detect",
    task: "object detection",
  },
  "moondream-point": {
    category: "analysis",
    description:
      "Return point coordinates for every instance of a prompted subject.",
    endpoint: "fal-ai/moondream3-preview/point",
    inputField: "image_url",
    inputKind: "image",
    name: "Moondream 3 Point",
    outputKeys: ["points", "image"],
    price: { kind: "metered" },
    pricing: "$0.40/M input tokens, $3.50/M output tokens",
    sourceUrl: "https://fal.ai/models/fal-ai/moondream3-preview/point",
    task: "object pointing",
  },
  "moondream-query": {
    category: "analysis",
    description: "Answer a free-form question about an image, with reasoning.",
    endpoint: "fal-ai/moondream3-preview/query",
    inputField: "image_url",
    inputKind: "image",
    name: "Moondream 3 Query",
    outputKeys: ["output", "reasoning"],
    price: { kind: "metered" },
    pricing: "$0.40/M input tokens, $3.50/M output tokens",
    sourceUrl: "https://fal.ai/models/fal-ai/moondream3-preview/query",
    task: "visual question answering",
  },
  nsfw: {
    category: "moderation",
    description: "Predict whether one or more images contain NSFW concepts.",
    endpoint: "fal-ai/x-ailab/nsfw",
    inputField: "image_urls",
    inputKind: "images",
    name: "NSFW Checker",
    outputKeys: ["has_nsfw_concepts"],
    price: { kind: "metered" },
    pricing: "$0.001/image",
    sourceUrl: "https://fal.ai/models/fal-ai/x-ailab/nsfw",
    task: "vision moderation",
  },
} as const satisfies Record<string, FalToolConfig>;
