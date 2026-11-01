/**
 * Display names from the SDK's registry: "Seedream 4.0", not `seedream4`.
 * Server-only, since the registry is.
 */
import { FAL_TOOLS, MODELS, isFalToolId } from "@motif/bench-core/sdk-internal";

export const modelName = (id: string): string => {
  const model = MODELS[id];
  if (model !== undefined) {
    return model.name;
  }
  return isFalToolId(id) ? FAL_TOOLS[id].name : id;
};

/** How long a Model usually takes, from the SDK's benchmark, if it has one. */
export const typicalMs = (id: string): number | null => {
  const seconds = MODELS[id]?.benchmark?.speed?.medianSeconds;
  return seconds === undefined ? null : Math.round(seconds * 1000);
};
