/**
 * motif CLI — agent-first image generation.
 *
 * Security posture: the agent is not a trusted operator.
 * All inputs are validated. Output paths must stay inside the git root (or CWD outside a repo).
 * Use --dry-run before mutating commands.
 */

import {
  ASPECT_RATIOS,
  formatCost,
  RESOLUTIONS,
  sanitizePrompt,
  TIERS,
} from "@howells/motif-sdk";
import chalk from "chalk";
import { Command } from "commander";

import { runDescribe } from "./commands/describe";
import { generateImage } from "./commands/generate";
import { runHistory } from "./commands/history";
import {
  exitRemoved,
  REMOVED_STDIN_COMMANDS,
  refuseRemovedStdinFields,
} from "./commands/removed";
import { helpTaskList, taskCorrection } from "./commands/verbs/tasks";
import type { CliOptions, StdinPayload } from "./utils/cli-types";
import { getLastGeneration, loadConfig } from "./utils/config";
import {
  exitForErrorCode,
  formatForParseErrors,
  handleError,
  refuseFlagValues,
  routeCommanderErrors,
} from "./utils/errors";
import { readStdinJson, reservedPromptSuggestion } from "./utils/input";
import { emit, emitError, isStructured, resolveFormat } from "./utils/output";
import type { EmitOptions, OutputFormat } from "./utils/output";
import { firstText, hasText } from "./utils/text";
import { PACKAGE_VERSION } from "./version";

/** Commander collector: each `-e <file>` or `--param` adds one value. */
function collectRepeatable(value: string, previous?: string[]): string[] {
  return [...(previous ?? []), value];
}

// -- Commands --

async function showLastGeneration(emitOpts: EmitOptions): Promise<void> {
  const last = await getLastGeneration();
  if (!last) {
    if (isStructured(emitOpts.format)) {
      emit({ command: "last", result: null }, emitOpts);
    } else {
      console.log(chalk.yellow("No previous generations found"));
    }
    return;
  }

  if (isStructured(emitOpts.format)) {
    emit({ command: "last", ...last }, emitOpts);
    return;
  }

  console.log(chalk.bold("\nLast Generation:"));
  console.log(
    `  Prompt: ${chalk.cyan(last.prompt.slice(0, 60))}${last.prompt.length > 60 ? "..." : ""}`
  );
  console.log(`  Aspect: ${last.aspect} | Resolution: ${last.resolution}`);
  console.log(`  Output: ${chalk.dim(last.output)}`);
  console.log(`  Cost:   ${chalk.yellow(formatCost(last.cost))}`);
  console.log(`  Time:   ${new Date(last.timestamp).toLocaleString()}`);
}

/**
 * Refuse positionals led by a task word, naming the command it means, the
 * same way a prompt matching a command word is refused. Returns when the
 * first positional is not a task word.
 */
function refuseTaskWord(positionals: string[], format: OutputFormat): void {
  const correction = taskCorrection(positionals);
  if (correction === null) {
    return;
  }
  const { invocation, row } = correction;
  emitError(
    {
      code: "INVALID_OPTION",
      details: { didYouMean: invocation, task: positionals[0] },
      message: `${JSON.stringify(positionals[0])} isn't a motif command. Did you mean '${invocation}'?`,
      suggestions: [
        `Run '${invocation}'`,
        `motif ${row.command}: ${row.whenToUse}`,
      ],
    },
    format
  );
  exitForErrorCode("INVALID_OPTION");
}

// -- Main entry --

export async function runCli(
  args: string[],
  preloadedConfig?: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
  const config = preloadedConfig ?? (await loadConfig());

  const program = new Command()
    .name("motif")
    // The command list rides in the description so it prints straight after
    // Usage, ahead of the long options list.
    .description(`Motif: images and video through fal\n\n${helpTaskList()}`)
    .version(PACKAGE_VERSION)
    .argument("[prompt]", "Image generation prompt")
    // Agent-first global flags
    .option(
      "--format <format>",
      "Output format: json, human, ndjson (default: auto-detect from TTY)"
    )
    .option(
      "--fields <fields>",
      "Comma-separated fields to include in output (e.g. --fields id,cost,path)"
    )
    .option("--dry-run", "Validate inputs without making API calls")
    .option(
      "--ephemeral",
      "Save output locally, then delete fal request IO payloads when possible"
    )
    // Model choice
    .option("--tier <tier>", `Trade cost against quality: ${TIERS.join(", ")}`)
    .option("-m, --model <id>", "Run this Model instead of the ranked choice")
    .option(
      "--param <key=value>",
      "A Model-only request field; repeat for more. Needs -m",
      collectRepeatable
    )
    .option(
      "-e, --edit <file>",
      "Reference image for editing; repeat for more (-e a.png -e b.png)",
      collectRepeatable
    )
    .option(
      "-a, --aspect <ratio>",
      `Aspect ratio (${ASPECT_RATIOS.join(", ")})`
    )
    .option("-r, --resolution <res>", `Resolution (${RESOLUTIONS.join(", ")})`)
    .option("-o, --output <file>", "Output filename")
    .option("-n, --num <count>", "Number of images 1-4")
    // Format presets
    .option("--cover", "Kindle/eBook cover: 2:3, 2K (1600×2400)")
    .option("--square", "Square: 1:1")
    .option("--landscape", "Landscape: 16:9")
    .option("--portrait", "Portrait: 2:3")
    // Social media presets
    .option("--story", "Instagram/TikTok Story: 9:16 (1080×1920)")
    .option("--reel", "Instagram Reel: 9:16 (1080×1920)")
    .option("--feed", "Instagram Feed portrait: 4:5 (1080×1350)")
    .option("--og", "Open Graph / social share: 16:9 (1200×630)")
    // Device presets
    .option("--wallpaper", "iPhone wallpaper: 9:16")
    // Cinematic presets
    .option("--wide", "Cinematic wide: 21:9")
    .option("--ultra", "Ultra-wide banner: 21:9, 2K")
    // Output options
    .option("--transparent", "Transparent background PNG")
    .option("--mask <path>", "Mask image for an edit with -e")
    .option("--last", "Show last generation info")
    .option("--no-open", "Don't open image after generation")
    .option("--seed <n>", "Reproducible generation seed")
    .option("--negative <text>", "Negative prompt: what not to include")
    .option("--output-format <format>", "Output format: jpeg, png, webp")
    // Creative direction
    .option("--look <id>", "House look id, e.g. editorial")
    .option("--mood <id>", "Light mood id, e.g. overcast")
    .option("--no-mood", "Drop any mood, including one from stdin JSON")
    // Introspection & history
    .option("--describe [command]", "Show CLI schema as JSON (for agents)")
    .option("--history", "Show generation history")
    .option("--limit <n>", "History: number of entries (default 10)")
    .option("--offset <n>", "History: skip first N entries");

  // Commander's own parse failures (unknown option, missing argument) must
  // honour the same error contract as everything else the CLI emits. Surplus
  // positionals led by a task word, such as `motif remove "the car" x.png`,
  // name the command that word means instead.
  const parseFormat = formatForParseErrors(args);
  routeCommanderErrors(program, parseFormat, (err) => {
    if (err.code === "commander.excessArguments") {
      refuseTaskWord(program.args, parseFormat);
    }
  });

  program.parse(args);
  refuseFlagValues(program, parseFormat);

  const options = program.opts<CliOptions>();
  const prompt = program.args[0];

  /**
   * Whether argv alone says what to do. When it does, stdin can only add to a
   * decided action, so waiting on it forever is what made the CLI hang under
   * `execFile` — a parent that holds the write end open never sends EOF. When
   * it does not, stdin is the whole input and must not be cut short.
   */
  const argvDecidesAction =
    prompt !== undefined ||
    options.describe !== undefined ||
    options.history === true ||
    options.last === true;

  // Resolve output format (TTY detection + explicit flag)
  const format = resolveFormat(options.format);
  const emitOpts: EmitOptions = {
    fields: options.fields,
    format,
    sanitize: true, // Always sanitize API responses
  };

  // -- Read stdin JSON if piped --
  let stdinData: StdinPayload | null = null;
  try {
    stdinData = await readStdinJson<StdinPayload>(!argvDecidesAction);
  } catch (error) {
    handleError(error, "INVALID_STDIN", format);
  }

  // Stdin can specify a command
  const stdinCommand = stdinData?.command;
  if (stdinData?.dryRun === true) {
    options.dryRun = true;
  }

  // -- Describe (schema introspection) --
  if (options.describe !== undefined || stdinCommand === "describe") {
    const cmdName =
      typeof options.describe === "string" ? options.describe : undefined;
    try {
      runDescribe(cmdName, emitOpts);
    } catch (error) {
      handleError(error, "DESCRIBE_FAILED", format);
    }
    return;
  }

  // -- History --
  if (options.history === true || stdinCommand === "history") {
    await runHistory(
      {
        limit:
          stdinData?.limit ??
          (hasText(options.limit)
            ? Number.parseInt(options.limit, 10)
            : undefined),
        offset:
          stdinData?.offset ??
          (hasText(options.offset)
            ? Number.parseInt(options.offset, 10)
            : undefined),
      },
      emitOpts
    );
    return;
  }

  // -- Last --
  if (options.last === true || stdinCommand === "last") {
    await showLastGeneration(emitOpts);
    return;
  }

  // -- Removed stdin commands --
  const removedUse =
    stdinCommand === undefined
      ? undefined
      : REMOVED_STDIN_COMMANDS[stdinCommand];
  if (stdinCommand !== undefined && removedUse !== undefined) {
    exitRemoved(
      `stdin command ${JSON.stringify(stdinCommand)}`,
      removedUse,
      format
    );
  }
  if (stdinData) {
    refuseRemovedStdinFields(stdinData, format);
  }

  // Refuse a bare positional prompt that is exactly a motif command word
  // (e.g. `motif history`): almost always a mistyped command, and generating
  // from it would spend credits. Checked before the API-key gate so the
  // mistake is reported even without FAL_KEY set. Stdin JSON prompts bypass
  // this deliberately — that is the escape hatch for intentional one-word
  // prompts that collide with command words.
  if (hasText(prompt)) {
    const didYouMean = reservedPromptSuggestion(prompt);
    if (didYouMean !== null) {
      emitError(
        {
          code: "RESERVED_PROMPT",
          details: { didYouMean, prompt: prompt.trim() },
          message: `Prompt ${JSON.stringify(prompt.trim())} matches a motif command word; refusing to generate. Did you mean '${didYouMean}'?`,
        },
        format
      );
      exitForErrorCode("RESERVED_PROMPT");
    }
  }

  // -- Generate --
  const resolvedPrompt = firstText(prompt, stdinData?.prompt);
  if (resolvedPrompt !== undefined) {
    const sanitized = sanitizePrompt(resolvedPrompt);
    if (!sanitized) {
      emitError(
        { code: "EMPTY_PROMPT", message: "Prompt is empty after sanitization" },
        format
      );
      exitForErrorCode("EMPTY_PROMPT");
    }
    await generateImage(sanitized, options, stdinData, config, emitOpts);
    return;
  }

  // No prompt and no command = show help.
  program.help();
}
