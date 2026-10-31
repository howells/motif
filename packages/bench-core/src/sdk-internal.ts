// The bench reads the SDK's per-model registry and fal client, which are not
// part of `@howells/motif-sdk`'s public index. It imports them from source.
export {
  aspectToFalImageSize,
  aspectToGptSize,
} from "../../motif-sdk/src/aspects";
export { buildGenerateBody } from "../../motif-sdk/src/generate";
export { GENERATION_MODELS, MODELS } from "../../motif-sdk/src/models";
export type { GenerationModelName } from "../../motif-sdk/src/models";
export { FalClient } from "../../motif-sdk/src/server";
export type {
  GenerateOptions,
  ImageOutputFormat,
  ModelConfig,
  MotifResponse,
  SizeMode,
} from "../../motif-sdk/src/types";
// The App's spending guard reads the registry's rates and preset sizes to
// derive a finite upper bound for a planned call (apps/bench/lib/app/budget).
export { FAL_PRESET_SIZES } from "../../motif-sdk/src/aspects";
export { estimateCost } from "../../motif-sdk/src/cost";
export { FAL_TOOLS, isFalToolId } from "../../motif-sdk/src/tools";
export type { FalToolPrice } from "../../motif-sdk/src/tool-types";
