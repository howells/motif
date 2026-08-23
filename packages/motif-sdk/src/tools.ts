// Public module for the fal tool registry. The entry data lives in
// `./tool-registry/*`, grouped by what the tools do, because a single literal
// was well past the file-size ceiling. This module is the only entry point:
// it re-exports the types and assembles the groups into one `FAL_TOOLS`
// object, so `import { ... } from "./tools"` keeps working unchanged.

import { ANALYSIS_TOOLS } from "./tool-registry/analysis";
import { ASSET_TOOLS } from "./tool-registry/assets";
import { BACKGROUND_TOOLS } from "./tool-registry/background";
import { EDITING_TOOLS } from "./tool-registry/editing";
import { STRUCTURE_TOOLS } from "./tool-registry/structure";
import type {
  FalToolConfig,
  FalToolRequest,
  FalToolRunOptions,
} from "./tool-types";

export type {
  FalToolConfig,
  FalToolInputKind,
  FalToolPrice,
  FalToolRequest,
  FalToolRunOptions,
} from "./tool-types";

const FAL_EXPLORE_CHECKED_AT = "2026-08-23";

// Spread into a single object literal, not merged at runtime: that is what
// keeps `keyof typeof FAL_TOOLS` a union of the literal tool ids rather than
// widening to `string`, which `FalToolId` and `isFalToolId` both depend on.
export const FAL_TOOLS = {
  ...ANALYSIS_TOOLS,
  ...ASSET_TOOLS,
  ...BACKGROUND_TOOLS,
  ...EDITING_TOOLS,
  ...STRUCTURE_TOOLS,
} as const satisfies Record<string, FalToolConfig>;

export const FAL_TOOLS_CHECKED_AT = FAL_EXPLORE_CHECKED_AT;
// `Object.keys` is typed as `string[]`; narrowing to the concrete key union is
// sound here because `FAL_TOOLS` is a closed literal object, but TS cannot prove
// it. Preserves the exported `FalToolId` union derived below.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
export const FAL_TOOL_IDS = Object.keys(
  FAL_TOOLS
) as (keyof typeof FAL_TOOLS)[];
export type FalToolId = (typeof FAL_TOOL_IDS)[number];

export function isFalToolId(tool: string): tool is FalToolId {
  return Object.hasOwn(FAL_TOOLS, tool);
}

export function buildFalToolRequest(
  options: FalToolRunOptions
): FalToolRequest {
  if (!isFalToolId(options.tool)) {
    throw new Error(`Unknown fal tool: ${options.tool}`);
  }
  const tool = FAL_TOOLS[options.tool];
  const values =
    options.inputs ??
    (options.input !== undefined && options.input !== ""
      ? [options.input]
      : []);
  if (values.length === 0) {
    throw new Error(`${options.tool} requires input media`);
  }

  const mediaValue = tool.inputKind === "images" ? values : values[0];
  const defaultOptions =
    "defaultOptions" in tool ? tool.defaultOptions : undefined;
  const body = {
    ...defaultOptions,
    ...options.options,
    [tool.inputField]: mediaValue,
  };

  return { body, endpoint: tool.endpoint, tool };
}
