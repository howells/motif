/**
 * Routing for the seven promoted verbs.
 *
 * These are the fal capabilities worth a name of their own: the ones a caller
 * reaches for often enough that `motif tool run sam3-image --option ...` is the
 * wrong shape. Everything else stays behind `motif tool`.
 *
 * Each verb takes an optional trailing image path and falls back to the last
 * generation, supports `--dry-run`, `-o/--output`, `--format`, `--fields` and
 * `--no-open`, and is implemented as a descriptor over `runImageOperation`.
 */

import { Command } from "commander";

import { loadConfig } from "../../utils/config";
import type { MotifConfig } from "../../utils/config";
import { ask } from "./ask";
import { enhance } from "./enhance";
import { erase, layers, reframe, segment, vectorize } from "./image-verbs";
import { requireApiKey, verbEmitOptions } from "./shared";
import type { VerbOptions } from "./shared";

export const VERB_NAMES = [
  "ask",
  "enhance",
  "erase",
  "layers",
  "reframe",
  "segment",
  "vectorize",
] as const;

export type VerbName = (typeof VERB_NAMES)[number];

export function isVerbName(value: string | undefined): value is VerbName {
  return VERB_NAMES.some((name) => name === value);
}

/** Flags every verb carries, so an agent learns one shape and reuses it. */
function withCommonOptions(command: Command): Command {
  return command
    .option("--dry-run", "Validate and price the call without running it")
    .option(
      "-o, --output <file-or-dir>",
      "Write here; a trailing / writes every output, named by registry key"
    )
    .option(
      "--format <format>",
      "Output format: json, human, ndjson (default: auto-detect from TTY)"
    )
    .option("--fields <fields>", "Comma-separated fields to include in output")
    .option("--no-open", "Don't open the result in a viewer");
}

export async function runVerbs(args: string[]): Promise<void> {
  const config = await loadConfig();
  const program = new Command()
    .name("motif")
    .description("Promoted fal capabilities with a verb of their own");

  registerAsk(program, config);
  registerEnhance(program, config);
  registerErase(program, config);
  registerLayers(program, config);
  registerReframe(program, config);
  registerSegment(program, config);
  registerVectorize(program, config);

  await program.parseAsync(["node", "motif", ...args]);
}

function registerSegment(program: Command, config: MotifConfig): void {
  withCommonOptions(
    program
      .command("segment <prompt> [image]")
      .description("Segment prompted objects out of an image (SAM 3)")
      .option("--rle", "Return run-length encoded masks as compact JSON")
  ).action(
    async (prompt: string, image: string | undefined, options: VerbOptions) => {
      const emitOpts = verbEmitOptions(options);
      requireApiKey(options, config, emitOpts.format);
      await segment(prompt, image, options, config, emitOpts);
    }
  );
}

function registerAsk(program: Command, config: MotifConfig): void {
  withCommonOptions(
    program
      .command("ask [question] [image]")
      .description("Ask a question about an image and get prose back")
      .option("--caption", "Caption the image instead of answering a question")
      .option("--detect <thing>", "Detect this thing and return its boxes")
      .option("--point <thing>", "Point at every instance of this thing")
  ).action(
    async (
      question: string | undefined,
      image: string | undefined,
      options: VerbOptions
    ) => {
      const emitOpts = verbEmitOptions(options);
      requireApiKey(options, config, emitOpts.format);
      await ask(question, image, options, config, emitOpts);
    }
  );
}

function registerErase(program: Command, config: MotifConfig): void {
  withCommonOptions(
    program
      .command("erase <prompt> [image]")
      .description("Remove a prompted object and fill the gap")
  ).action(
    async (prompt: string, image: string | undefined, options: VerbOptions) => {
      const emitOpts = verbEmitOptions(options);
      requireApiKey(options, config, emitOpts.format);
      await erase(prompt, image, options, config, emitOpts);
    }
  );
}

function registerReframe(program: Command, config: MotifConfig): void {
  withCommonOptions(
    program
      .command("reframe [image]")
      .description("Reframe an existing image to a new ratio, generating fill")
      .option("--cover", "Kindle/eBook cover: 2:3")
      .option("--landscape", "Landscape: 16:9")
      .option("--og", "Open Graph / social share: 16:9")
      .option("--portrait", "Portrait: 2:3")
      .option("--square", "Square: 1:1")
      .option("--story", "Instagram/TikTok Story: 9:16")
      .option("--wide", "Cinematic wide: 21:9")
  ).action(async (image: string | undefined, options: VerbOptions) => {
    const emitOpts = verbEmitOptions(options);
    requireApiKey(options, config, emitOpts.format);
    await reframe(image, options, config, emitOpts);
  });
}

function registerEnhance(program: Command, config: MotifConfig): void {
  withCommonOptions(
    program
      .command("enhance [image]")
      .description("Topaz enhancement — one mode at a time")
      .option("--upscale", "Faithful upscale, preserving detail (default)")
      .option("--generative", "Upscale, synthesising plausible new detail")
      .option("--creative", "Upscale, reimagining detail")
      .option("--transparent", "Upscale, preserving the alpha channel")
      .option("--restore", "Restore a damaged or degraded photograph")
      .option("--denoise", "Reduce noise at source resolution")
      .option("--sharpen", "Deblur and sharpen at source resolution")
      .option("--adjust", "Exposure, white balance, and colour adjustment")
  ).action(async (image: string | undefined, options: VerbOptions) => {
    const emitOpts = verbEmitOptions(options);
    requireApiKey(options, config, emitOpts.format);
    await enhance(image, options, config, emitOpts);
  });
}

function registerLayers(program: Command, config: MotifConfig): void {
  withCommonOptions(
    program
      .command("layers [image]")
      .description("Split an image into stacked RGBA layers")
  ).action(async (image: string | undefined, options: VerbOptions) => {
    const emitOpts = verbEmitOptions(options);
    requireApiKey(options, config, emitOpts.format);
    await layers(image, options, config, emitOpts);
  });
}

function registerVectorize(program: Command, config: MotifConfig): void {
  withCommonOptions(
    program
      .command("vectorize [image]")
      .description("Convert a raster image into a clean SVG")
  ).action(async (image: string | undefined, options: VerbOptions) => {
    const emitOpts = verbEmitOptions(options);
    requireApiKey(options, config, emitOpts.format);
    await vectorize(image, options, config, emitOpts);
  });
}
