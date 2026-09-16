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
  cover?: boolean;
  describe?: string | boolean;
  dryRun?: boolean;
  edit?: string[];
  ephemeral?: boolean;
  feed?: boolean;
  fields?: string;
  format?: string;
  history?: boolean;
  landscape?: boolean;
  last?: boolean;
  limit?: string;
  look?: string;
  mask?: string;
  model?: string;
  /** A mood id, or `false` from `--no-mood`. */
  mood?: string | false;
  negative?: string;
  noOpen?: boolean;
  num?: string;
  offset?: string;
  og?: boolean;
  output?: string;
  outputFormat?: string;
  param?: string[];
  portrait?: boolean;
  reel?: boolean;
  resolution?: string;
  seed?: string;
  square?: boolean;
  story?: boolean;
  tier?: string;
  transparent?: boolean;
  ultra?: boolean;
  wallpaper?: boolean;
  wide?: boolean;
}

/** JSON payload accepted via stdin */
export interface StdinPayload {
  aspect?: string;
  /** generate, last, history or describe; a removed command names its replacement (see `commands/removed.ts`). */
  command?: string;
  dryRun?: boolean;
  /** Look and mood ids; `mood: null` drops any mood. */
  creative?: CreativeInput;
  editImages?: string[];
  ephemeral?: boolean;
  // History options
  limit?: number;
  maskImageUrl?: string;
  model?: string;
  negativePrompt?: string;
  noOpen?: boolean;
  numImages?: number;
  offset?: number;
  output?: string;
  outputFormat?: string;
  preset?: string;
  prompt?: string;
  resolution?: string;
  seed?: number;
  tier?: string;
  transparent?: boolean;
}
