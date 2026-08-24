// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/probe-model-output.mjs --confirm  (spends credits)
//
// What each model actually returns, measured from the bytes of a real
// generation. This is not derivable from a schema and not implied by
// `supportsOutputFormat`: that flag says whether the argument is accepted,
// which tells a caller they cannot ask for PNG but not that what arrives is
// 4:2:0 chroma subsampled JPEG — chroma averaged over 2x2 blocks, invisible in
// a photograph and destructive at a matte edge.
//
// The container is a label. The subsampling is the fact that changes a decision.

export interface ModelOutputShape {
  /** File container the endpoint returns. */
  container: string;
  /** Whether the encoding preserves every pixel exactly. */
  lossless: boolean;
  /** Bits per channel. */
  bitDepth?: number;
  /** Whether the returned file carries an alpha channel. */
  hasAlpha?: boolean;
  /** JPEG chroma subsampling, e.g. "4:4:4" or "4:2:0". Absent for lossless containers. */
  subsampling?: string;
}

export const MODEL_OUTPUT: Record<string, ModelOutputShape> = {
  "banana": { container: "png", lossless: true, bitDepth: 8 },
  "banana2": { container: "png", lossless: true, bitDepth: 8 },
  "flux": { container: "jpeg", subsampling: "4:4:4", lossless: false, bitDepth: 8 },
  "flux-fast": { container: "jpeg", subsampling: "4:4:4", lossless: false, bitDepth: 8 },
  "flux2-dev": { container: "png", lossless: true, bitDepth: 8 },
  "flux2-flex": { container: "jpeg", subsampling: "4:4:4", lossless: false, bitDepth: 8 },
  "flux2-max": { container: "jpeg", subsampling: "4:4:4", lossless: false, bitDepth: 8 },
  "flux2-pro": { container: "jpeg", subsampling: "4:4:4", lossless: false, bitDepth: 8 },
  "flux2-turbo": { container: "png", lossless: true, bitDepth: 8 },
  "gemini": { container: "png", lossless: true, bitDepth: 8 },
  "gemini3": { container: "png", lossless: true, bitDepth: 8 },
  "gpt": { container: "png", lossless: true, bitDepth: 8 },
  "gpt2": { container: "png", lossless: true, bitDepth: 8 },
  "grok-image": { container: "png", lossless: true, bitDepth: 8 },
  "ideogram": { container: "png", lossless: true, bitDepth: 8 },
  "ideogram4": { container: "jpeg", subsampling: "4:4:4", lossless: false, bitDepth: 8 },
  "qwen": { container: "png", lossless: true, bitDepth: 8 },
  "qwen3": { container: "png", lossless: true, bitDepth: 8 },
  "recraft": { container: "webp (lossless)", lossless: true, hasAlpha: true, bitDepth: 8 },
  "recraft4": { container: "webp (lossless)", lossless: true, hasAlpha: true, bitDepth: 8 },
  "seedream4": { container: "jpeg", subsampling: "4:4:4", lossless: false, bitDepth: 8 },
  "seedream45": { container: "jpeg", subsampling: "4:2:0", lossless: false, bitDepth: 8 },
  "seedream5": { container: "jpeg", subsampling: "4:2:0", lossless: false, bitDepth: 8 },
  "seedream5-lite": { container: "jpeg", subsampling: "4:2:0", lossless: false, bitDepth: 8 },
};

/** What a model returns, or undefined if it has not been probed. */
export function modelOutput(model: string): ModelOutputShape | undefined {
  return MODEL_OUTPUT[model];
}
