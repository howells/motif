/**
 * Shared CLI option and stdin payload types.
 *
 * These describe the parsed Commander options (`CliOptions`) and the JSON
 * payload accepted via stdin (`StdinPayload`). They are shared by the CLI
 * router and the generate command.
 */

import type { CreativeInput } from "./creative";

export interface CliOptions {
  aspect?: string;
  describe?: string | boolean;
  dryRun?: boolean;
  edit?: string[];
  ephemeral?: boolean;
  fields?: string;
  format?: string;
  history?: boolean;
  last?: boolean;
  limit?: string;
  look?: string;
  markup?: string;
  mask?: string;
  model?: string;
  /** A mood id, or `false` from `--no-mood`. */
  mood?: string | false;
  negative?: string;
  num?: string;
  open?: boolean;
  offset?: string;
  output?: string;
  outputFormat?: string;
  param?: string[];
  resolution?: string;
  seed?: string;
  tier?: string;
  transparent?: boolean;
}

/** JSON payload accepted via stdin */
export interface StdinPayload {
  aspect?: string;
  /** generate, last, history or describe. */
  command?: string;
  dryRun?: boolean;
  /** Look and mood ids; `mood: null` drops any mood. */
  creative?: CreativeInput;
  editImages?: string[];
  ephemeral?: boolean;
  // History options
  limit?: number;
  markupImageUrl?: string;
  maskImageUrl?: string;
  model?: string;
  negativePrompt?: string;
  numImages?: number;
  offset?: number;
  open?: boolean;
  output?: string;
  outputFormat?: string;
  preset?: string;
  prompt?: string;
  resolution?: string;
  seed?: number;
  tier?: string;
  transparent?: boolean;
}
