/**
 * What a model returns, and whether you can get something lossless out of it.
 *
 * Two facts live in different places and neither is useful alone:
 *
 *   - `MODEL_OUTPUT` (generated, measured from real bytes) says what arrives
 *     when you ask for nothing.
 *   - `supportsOutputFormat` on the model says whether you are allowed to ask
 *     for something else.
 *
 * A caller who reads only the first concludes `flux2-pro` is lossy; it defaults
 * to JPEG but returns PNG on request. A caller who reads only the second
 * concludes `seedream5` is fine; the flag is false, and what that actually
 * means is 4:2:0 chroma - averaged over 2x2 blocks, invisible in a photograph
 * and destructive to anything dividing by alpha at a soft edge.
 *
 * So the answer is derived from both at read time rather than written down a
 * third time. Every price and output-key defect in this registry came from one
 * fact stored twice.
 */

import { MODEL_OUTPUT } from "./model-output.generated";
import type { ModelOutputShape } from "./model-output.generated";
import { MODELS } from "./models";

export { MODEL_OUTPUT } from "./model-output.generated";
export type { ModelOutputShape } from "./model-output.generated";

/** Whether a lossless file can be obtained, and what it costs to ask. */
export type LosslessAvailability =
  /** Lossless by default; ask for nothing. */
  | "default"
  /** Lossy by default, lossless when `outputFormat` is set. */
  | "on-request"
  /** No lossless route: the endpoint returns a lossy container and rejects the argument. */
  | "unavailable"
  /** Not probed. Absence of evidence, not evidence of a limitation. */
  | "unknown";

/** Measured shape of what a model returns by default, if it has been probed. */
export function modelOutput(model: string): ModelOutputShape | undefined {
  return MODEL_OUTPUT[model];
}

/**
 * Whether this model can produce a lossless file at all.
 *
 * The question a caller actually has, answered from the measured default and
 * the accepted arguments together.
 */
export function losslessAvailability(model: string): LosslessAvailability {
  const shape = MODEL_OUTPUT[model];
  if (shape === undefined) {
    return "unknown";
  }
  if (shape.lossless) {
    return "default";
  }
  return MODELS[model]?.supportsOutputFormat === true
    ? "on-request"
    : "unavailable";
}

/**
 * One line a human or an agent can act on, e.g.
 * `"jpeg 4:2:0, no lossless route"` or `"jpeg 4:4:4, PNG on request"`.
 */
export function describeModelOutput(model: string): string {
  const shape = MODEL_OUTPUT[model];
  if (shape === undefined) {
    return "not measured";
  }
  const base =
    shape.subsampling === undefined || shape.subsampling === ""
      ? shape.container
      : `${shape.container} ${shape.subsampling}`;
  const suffix: Record<LosslessAvailability, string> = {
    default: "lossless",
    "on-request": "lossless on request",
    unavailable: "no lossless route",
    unknown: "lossless route not measured",
  };
  return `${base}, ${suffix[losslessAvailability(model)]}`;
}
