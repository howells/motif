// Tools that turn a flat image into a production asset: stacked layers, vector
// paths, PBR material maps, and 3D meshes.
//
// Part of the FAL_TOOLS registry; `../tools` assembles the groups and is the
// module every consumer imports.

import type { FalToolConfig } from "../tool-types";

export const ASSET_TOOLS = {
  "hunyuan3d-v3": {
    category: "3d",
    description:
      "Reconstruct a textured 3D mesh from a single image, with optional multi-view inputs.",
    endpoint: "fal-ai/hunyuan3d-v3/image-to-3d",
    inputField: "input_image_url",
    inputKind: "image",
    name: "Hunyuan3D v3 Image to 3D",
    outputKeys: ["model_glb", "model_urls", "thumbnail"],
    price: { kind: "call", usd: 0.375 },
    pricing:
      "$0.375/generation at the default Normal type; $0.45 low poly, $0.225 geometry only, and $0.15 each for PBR, multi-view, or a custom face count",
    queued: true,
    sourceUrl: "https://fal.ai/models/fal-ai/hunyuan3d-v3/image-to-3d",
    task: "single-image 3D reconstruction",
  },
  "ideogram-layerize-text": {
    category: "layers",
    description:
      "Split an image into background image layers plus editable HTML text containers.",
    endpoint: "fal-ai/ideogram/v3/layerize-text",
    inputField: "image_url",
    inputKind: "image",
    name: "Ideogram v3 Text Layerize",
    outputKeys: ["image_layers", "image", "text_html", "text_containers"],
    price: { kind: "call", usd: 0.09 },
    pricing: "$0.09/image",
    queued: true,
    sourceUrl: "https://fal.ai/models/fal-ai/ideogram/v3/layerize-text",
    task: "text and image layer extraction",
  },
  "ideogram-tiling": {
    category: "material",
    description:
      "Generate a seamlessly tiling texture, optionally conditioned on a source image.",
    endpoint: "ideogram/v4/tiling",
    inputField: "image_url",
    inputKind: "image",
    name: "Ideogram v4 Tiling",
    outputKeys: ["images"],
    price: { kind: "megapixel", usd: 0.06 },
    pricing:
      "$0.06/megapixel at the default BALANCED speed; $0.03 turbo, $0.10 quality",
    sourceUrl: "https://fal.ai/models/ideogram/v4/tiling",
    task: "seamless texture generation",
  },
  image2svg: {
    category: "vector",
    description: "Trace a raster image into layered SVG paths.",
    endpoint: "fal-ai/image2svg",
    inputField: "image_url",
    inputKind: "image",
    name: "Image to SVG",
    outputKeys: ["images"],
    price: { kind: "call", usd: 0.005 },
    pricing: "$0.005/image",
    sourceUrl: "https://fal.ai/models/fal-ai/image2svg",
    task: "raster to vector tracing",
  },
  patina: {
    category: "material",
    description:
      "Decompose a surface photograph into PBR maps: basecolor, normal, roughness, metalness, height.",
    endpoint: "fal-ai/patina",
    inputField: "image_url",
    inputKind: "image",
    name: "Patina PBR Maps",
    outputKeys: ["images"],
    // Output order follows the request's `maps` array, so read that first;
    // the fallback is the endpoint's own schema default.
    outputLabels: {
      images: {
        fallback: ["basecolor", "normal", "roughness", "metalness", "height"],
        fromOption: "maps",
      },
    },
    price: { kind: "metered" },
    pricing:
      "$0.01 base plus $0.01/megapixel per output map, so all 5 maps on a 1MP image cost $0.06; the listed rate is per map",
    queued: true,
    sourceUrl: "https://fal.ai/models/fal-ai/patina",
    task: "PBR material decomposition",
  },
  "patina-extract": {
    category: "material",
    description:
      "Extract a tiling PBR material from a prompted region of a photograph.",
    endpoint: "fal-ai/patina/material/extract",
    inputField: "image_url",
    inputKind: "image",
    name: "Patina Material Extract",
    outputKeys: ["images"],
    // Same `maps` option and schema default as fal-ai/patina, both verified.
    // `num_images` above 1 multiplies the array and breaks the mapping, which
    // the count check catches.
    outputLabels: {
      images: {
        fallback: ["basecolor", "normal", "roughness", "metalness", "height"],
        fromOption: "maps",
      },
    },
    price: { kind: "metered" },
    pricing:
      "$0.10 base only; add $0.02/megapixel plus $0.01/megapixel per map, so 1MP with all 5 maps is $0.17",
    queued: true,
    sourceUrl: "https://fal.ai/models/fal-ai/patina/material/extract",
    task: "tiling material extraction",
  },
  "qwen-layered": {
    category: "layers",
    description:
      "Split an image into a configurable number of stacked RGBA layers.",
    endpoint: "fal-ai/qwen-image-layered",
    inputField: "image_url",
    inputKind: "image",
    name: "Qwen Image Layered",
    outputKeys: ["images"],
    // fal publishes a figure but not what it counts. Encoding it as `call`
    // would assert a per-request price we cannot support, and this endpoint
    // returns several outputs — the same shape that made `seedream-layerize`
    // under-report by a factor of its layer count. `metered` reports null
    // rather than a number that is right only on one reading.
    price: { kind: "metered" },
    pricing:
      "$0.05 per image; fal does not say whether that counts the input image or each of the generated layers, so no estimate is reported",
    queued: true,
    sourceUrl: "https://fal.ai/models/fal-ai/qwen-image-layered",
    task: "image layer decomposition",
  },
  "recraft-vectorize": {
    category: "vector",
    description: "Convert a raster image into a clean SVG.",
    endpoint: "fal-ai/recraft/vectorize",
    inputField: "image_url",
    inputKind: "image",
    name: "Recraft Vectorize",
    outputKeys: ["image"],
    price: { kind: "call", usd: 0.04 },
    pricing: "$0.04/image, $0.08 with a vector style",
    sourceUrl: "https://fal.ai/models/fal-ai/recraft/vectorize",
    task: "raster to vector conversion",
  },
  "sam3-3d-align": {
    category: "3d",
    description: "Align SAM 3D objects and bodies into a shared scene.",
    endpoint: "fal-ai/sam-3/3d-align",
    inputField: "image_url",
    inputKind: "image",
    name: "SAM 3D Align",
    outputKeys: [
      "scene_glb",
      "model_glb",
      "visualization",
      "body_mesh_ply",
      "metadata",
    ],
    // fal publishes a figure but not what it counts. Encoding it as `call`
    // would assert a per-request price we cannot support, and this endpoint
    // returns several outputs — the same shape that made `seedream-layerize`
    // under-report by a factor of its layer count. `metered` reports null
    // rather than a number that is right only on one reading.
    price: { kind: "metered" },
    pricing:
      "$0.02 per unit; fal does not define a unit, so no estimate is reported",
    queued: true,
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/3d-align",
    task: "3D scene alignment",
  },
  "sam3-3d-body": {
    category: "3d",
    defaultOptions: {
      export_meshes: true,
      include_3d_keypoints: true,
      include_mhr_params: true,
    },
    description:
      "Reconstruct human body meshes and keypoints from a single image.",
    endpoint: "fal-ai/sam-3/3d-body",
    inputField: "image_url",
    inputKind: "image",
    name: "SAM 3D Body",
    outputKeys: ["model_glb", "visualization", "meshes", "metadata"],
    // fal publishes a figure but not what it counts. Encoding it as `call`
    // would assert a per-request price we cannot support, and this endpoint
    // returns several outputs — the same shape that made `seedream-layerize`
    // under-report by a factor of its layer count. `metered` reports null
    // rather than a number that is right only on one reading.
    price: { kind: "metered" },
    pricing:
      "$0.02 per unit; fal does not define a unit, so no estimate is reported",
    queued: true,
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/3d-body",
    task: "single-image 3D body reconstruction",
  },
  "sam3-3d-objects": {
    category: "3d",
    defaultOptions: {
      prompt: "car",
    },
    description:
      "Reconstruct one or more 3D objects from an image and prompts.",
    endpoint: "fal-ai/sam-3/3d-objects",
    inputField: "image_url",
    inputKind: "image",
    name: "SAM 3D Objects",
    outputKeys: [
      "gaussian_splat",
      "model_glb",
      "metadata",
      "individual_splats",
      "individual_glbs",
      "artifacts_zip",
    ],
    // fal publishes a figure but not what it counts. Encoding it as `call`
    // would assert a per-request price we cannot support, and this endpoint
    // returns several outputs — the same shape that made `seedream-layerize`
    // under-report by a factor of its layer count. `metered` reports null
    // rather than a number that is right only on one reading.
    price: { kind: "metered" },
    pricing:
      "$0.02 per unit; fal does not define a unit, and this endpoint returns one mesh per detected object, so no estimate is reported",
    queued: true,
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/3d-objects",
    task: "single-image 3D object reconstruction",
  },
  "seedream-layerize": {
    category: "layers",
    description:
      "Split an image into editable Seedream layers plus flattened previews.",
    endpoint: "bytedance/seedream/v5/pro/layerize",
    inputField: "image_url",
    inputKind: "image",
    name: "Seedream v5 Pro Layerize",
    outputKeys: ["layers", "images"],
    // Every element of `layers` carries its own `name` ("Left amber glass
    // bottle") and a `z_index` that orders the stack, verified live. Without
    // this the stack lands as layers.png … layers-5.png and the only way to
    // tell the reconstructed background plate from an object is to open them.
    outputLabels: {
      layers: { fromItem: { nameField: "name", orderField: "z_index" } },
    },
    price: { kind: "metered" },
    pricing:
      "$0.03375 per generated layer below 1536x1536 total area, $0.0675 per layer above; the listed rate is per layer, not per call",
    queued: true,
    sourceUrl: "https://fal.ai/models/bytedance/seedream/v5/pro/layerize",
    task: "image layer decomposition",
  },
  "seedvr-seamless": {
    category: "material",
    description: "Upscale a tiling texture while keeping its edges seamless. ",
    endpoint: "fal-ai/seedvr/upscale/image/seamless",
    inputField: "image_url",
    inputKind: "image",
    name: "SeedVR Seamless Upscale",
    outputKeys: ["image"],
    price: { kind: "megapixel", usd: 0.0025 },
    pricing: "$0.0025/megapixel",
    queued: true,
    sourceUrl: "https://fal.ai/models/fal-ai/seedvr/upscale/image/seamless",
    task: "seamless texture upscaling",
  },
  "trellis-2": {
    category: "3d",
    description:
      "Reconstruct a textured 3D mesh from a single image, with UV unwrapping.",
    endpoint: "fal-ai/trellis-2",
    inputField: "image_url",
    inputKind: "image",
    name: "TRELLIS 2",
    outputKeys: ["model_glb"],
    price: { kind: "call", usd: 0.3 },
    pricing: "$0.30 at the default 1024p; $0.25 at 512p, $0.35 at 1536p",
    queued: true,
    sourceUrl: "https://fal.ai/models/fal-ai/trellis-2",
    task: "single-image 3D reconstruction",
  },
} as const satisfies Record<string, FalToolConfig>;
