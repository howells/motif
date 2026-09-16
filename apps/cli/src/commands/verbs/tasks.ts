/**
 * The task table: which command does which job, in the words a caller uses.
 *
 * Every surface that routes by task reads this one list - the `--help` command
 * list, the `whenToUse`, `notFor` and `tasks` fields on each `--describe`
 * command, the top-level `tasks` index, and `motif --describe tasks`. A
 * `--describe` command without a row here fails loudly rather than going out
 * unrouted.
 */

import { CREATIVE_TAXONOMY, LOOKS, TASKS } from "@howells/motif-sdk";
import type { TaskId } from "@howells/motif-sdk";

import { TASK_VERBS } from "./task-verbs";
import { tableUsage } from "./verb-kit";

export interface CommandTask {
  /**
   * Key under `--describe` `commands`. `series run` is the one subcommand with
   * a row of its own, and `studio` the one command `--describe` doesn't cover.
   */
  readonly command: string;
  /** Invocation shape, as `--help` prints it. */
  readonly usage: string;
  /** Task-phrased one-liner for `--help`. */
  readonly summary: string;
  /** One sentence, in the words a caller would type. */
  readonly whenToUse: string;
  /** What to use instead, naming the sibling command. */
  readonly notFor: string;
  /** Task words that route here. Unique across the whole table. */
  readonly tasks: readonly string[];
  /** Listed in `--help`. False for flag-routed commands the options already show. */
  readonly inHelp: boolean;
}

/**
 * A Task verb's row: `whenToUse` and `notFor` come from the SDK's Task
 * registry, so the routing a caller reads is the routing the SDK resolves.
 */
function verbRow(
  task: TaskId,
  summary: string,
  tasks: readonly string[]
): CommandTask {
  const definition = TASK_VERBS.find((verb) => verb.command === task);
  return {
    command: task,
    // vary is the one verb registered outside the Task verb definitions.
    usage:
      definition === undefined
        ? `motif ${task} [image]`
        : tableUsage(definition),
    summary,
    whenToUse: TASKS[task].summary,
    notFor: TASKS[task].notFor,
    tasks,
    inHelp: true,
  };
}

/** Rows in `--help` order: generation, the Task verbs, then the wider commands. */
export const COMMAND_TASKS: readonly CommandTask[] = [
  {
    command: "generate",
    usage: 'motif "prompt"',
    summary: "make an image from a prompt",
    whenToUse:
      "Make a new image from a text prompt, or change an image by passing it with -e and describing the result.",
    notFor: TASKS.generate.notFor,
    tasks: ["create", "draw", "edit", "illustrate", "make", "render"],
    inHelp: true,
  },
  verbRow("vary", "variations of an image", [
    "alternatives",
    "remix",
    "variant",
    "variation",
    "variations",
  ]),
  verbRow("erase", "remove something, fill the gap", [
    "cleanup",
    "delete",
    "erase-object",
    "inpaint",
    "remove",
    "remove-object",
  ]),
  verbRow("cutout", "remove the background", [
    "background",
    "isolate",
    "remove-background",
    "rmbg",
    "transparent-background",
  ]),
  verbRow("reframe", "extend to a new aspect ratio", [
    "crop",
    "expand",
    "extend",
    "outpaint",
    "ratio",
    "resize",
    "uncrop",
  ]),
  verbRow("upscale", "make it larger", [
    "enlarge",
    "hi-res",
    "super-resolution",
  ]),
  verbRow("restore", "fix noise, blur, damage, colour", [
    "colorize",
    "colourise",
    "deblur",
    "denoise",
    "improve",
    "repair",
    "sharpen",
  ]),
  verbRow("relight", "relight to a described light or a mood", [
    "light",
    "lighting",
    "shadows",
  ]),
  verbRow("restyle", "redraw in a reference's style", [
    "style-transfer",
    "stylise",
    "stylize",
  ]),
  verbRow("segment", "mask a named thing", ["cut-out", "mask", "select"]),
  verbRow("ask", "caption, count, find or ask", [
    "caption",
    "count",
    "describe-image",
    "detect",
    "identify",
    "ocr",
    "query",
  ]),
  verbRow("layers", "split into transparent layers", [
    "decompose",
    "layer",
    "separate",
    "split",
  ]),
  verbRow("vectorize", "trace to a clean SVG", [
    "svg",
    "trace",
    "vector",
    "vectorise",
  ]),
  verbRow("map", "depth, edge, normal or pose map", [
    "control-map",
    "depth",
    "edges",
    "normals",
    "pose",
  ]),
  verbRow("material", "PBR maps from a surface photo", [
    "pbr",
    "roughness",
    "surface",
  ]),
  verbRow("tile", "a seamlessly tiling texture", [
    "pattern",
    "seamless",
    "texture",
    "tiling",
  ]),
  verbRow("mesh", "a textured 3D mesh, rigged with --rig", [
    "3d",
    "glb",
    "model-3d",
    "rig",
  ]),
  verbRow("try-on", "dress a person in a garment", ["dress", "outfit", "wear"]),
  verbRow("animate", "turn an image into a video", [
    "clip",
    "motion",
    "movie",
    "video",
  ]),
  {
    command: "sheet",
    usage: "motif sheet <images...>",
    summary: "a captioned contact sheet",
    whenToUse:
      "Compare several saved images side by side on one captioned grid, from files or the last few generations.",
    notFor:
      "Making the images (generate or series run), or combining images into one new picture (generate with several -e).",
    tasks: ["collage", "compare", "contact-sheet", "grid", "montage"],
    inHelp: true,
  },
  {
    command: "series run",
    usage: 'motif series run "theme"',
    summary: "a consistent set from a theme",
    whenToUse:
      "Make a set of related images that share one style from a single theme, such as six brutalist buildings.",
    notFor:
      "One image (generate), several takes of the same prompt (generate with -n), or variations of an image (vary).",
    tasks: ["batch", "consistent", "multi", "set", "themed"],
    inHelp: true,
  },
  {
    command: "series",
    usage: "motif series <subcommand>",
    summary: "a reusable style and references",
    whenToUse:
      "Keep a named style with reference images, a pinned look and mood, and its own history, so later images match it.",
    notFor:
      "A one-off themed set (series run creates or reuses a series for you), or a house register for one image (generate with --look).",
    tasks: ["album", "character", "collection", "project", "references"],
    inHelp: true,
  },
  {
    command: "studio",
    usage: "motif studio",
    summary: "the interactive terminal Studio",
    whenToUse:
      "Browse, generate and review images interactively in a terminal, as a person rather than a script.",
    notFor:
      "Agents and scripts, which call the commands directly with --format json.",
    tasks: ["gui", "interactive", "tui", "ui"],
    inHelp: true,
  },
  {
    command: "last",
    usage: "motif --last",
    summary: "show the last generation",
    whenToUse: "Find the path, prompt and cost of the most recent generation.",
    notFor: "Older generations (history).",
    tasks: ["latest", "previous", "recent"],
    inHelp: false,
  },
  {
    command: "history",
    usage: "motif --history",
    summary: "list past generations and spend",
    whenToUse:
      "List past generations with their paths, prompts and costs, and see what has been spent.",
    notFor:
      "Only the most recent generation (last), or one series' images (motif series history <slug>).",
    tasks: ["cost", "log", "past", "spend"],
    inHelp: false,
  },
  {
    command: "describe",
    usage: "motif --describe [command]",
    summary: "print the CLI schema as JSON",
    whenToUse:
      "Look up commands, flags, enums, Tiers and the Model ids -m accepts, as JSON, before building a command.",
    notFor: "The task routing alone (motif --describe tasks).",
    tasks: ["capabilities", "models", "schema"],
    inHelp: false,
  },
  {
    command: "errors",
    usage: "motif --describe errors",
    summary: "list error codes and how to recover",
    whenToUse:
      "Look up what an error code means, whether retrying can help, and how to recover.",
    notFor:
      "The error from a failed call, which already carries its code, details and suggestions on stderr.",
    tasks: ["error", "exit-codes", "troubleshoot"],
    inHelp: false,
  },
];

/** A task table row by command, or a thrown error naming the missing row. */
export function commandTask(command: string): CommandTask {
  const row = COMMAND_TASKS.find((candidate) => candidate.command === command);
  if (row === undefined) {
    throw new Error(`No task table row for command: ${command}`);
  }
  return row;
}

/** The three routing fields `--describe` puts on a command. */
export type TaskRouting = Pick<CommandTask, "whenToUse" | "notFor" | "tasks">;

export function taskRouting(row: CommandTask): TaskRouting {
  return { whenToUse: row.whenToUse, notFor: row.notFor, tasks: row.tasks };
}

function buildTaskIndex() {
  const index = new Map<string, string>();
  for (const row of COMMAND_TASKS) {
    for (const task of row.tasks) {
      const claimed = index.get(task);
      if (claimed !== undefined) {
        throw new Error(
          `Task word "${task}" routes to both ${claimed} and ${row.command}`
        );
      }
      index.set(task, row.command);
    }
  }
  return Object.fromEntries(index);
}

/** Task word to command, e.g. `remove` to `erase`. */
export const TASK_INDEX = buildTaskIndex();

/** Placeholders in a `usage`: `"what"`, `[image]`, `<images...>`. */
function isPlaceholder(token: string): boolean {
  return (
    token.startsWith('"') || token.startsWith("[") || token.startsWith("<")
  );
}

/** An argument as it would be typed, quoted when the shell would split it. */
function shellWord(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : JSON.stringify(arg);
}

/** A corrected invocation for positionals that start with a task word. */
export interface TaskCorrection {
  /** The command line to run instead, e.g. `motif erase "the car" x.png`. */
  readonly invocation: string;
  readonly row: CommandTask;
}

/**
 * Rewrite positionals led by a task word, such as `remove "the car" x.png`,
 * onto the command the word routes to. The remaining arguments fill the
 * row's placeholders in order; words spilling past a leading text placeholder
 * are joined into it, since that is an unquoted prompt. A row whose usage
 * takes no arguments gets its usage alone. Null when the first positional is
 * not a task word.
 */
export function taskCorrection(
  positionals: readonly string[]
): TaskCorrection | null {
  const [word, ...rest] = positionals;
  const command =
    word === undefined ? undefined : TASK_INDEX[word.toLowerCase()];
  if (command === undefined) {
    return null;
  }
  const row = commandTask(command);
  const tokens = row.usage.split(" ");
  const firstPlaceholder = tokens.findIndex(isPlaceholder);
  if (firstPlaceholder === -1) {
    return { invocation: row.usage, row };
  }
  const { flags, placeholders } = usageSlots(tokens.slice(firstPlaceholder));
  const unlimited = placeholders.some((token) => token.includes("..."));
  const overflow = rest.length - placeholders.length;
  const args =
    !unlimited && overflow > 0 && placeholders[0]?.startsWith('"') === true
      ? [rest.slice(0, overflow + 1).join(" "), ...rest.slice(overflow + 1)]
      : rest;
  return {
    invocation: [
      ...tokens.slice(0, firstPlaceholder),
      ...args.map(shellWord),
      ...flags,
    ].join(" "),
    row,
  };
}

/**
 * A usage's tail split into positional placeholders and the flags it
 * requires, e.g. `[image] --like <image>`. Optional flags such as `[--rig]`
 * are left out of a correction.
 */
function usageSlots(tokens: readonly string[]): {
  flags: string[];
  placeholders: string[];
} {
  const flags: string[] = [];
  const placeholders: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (token.startsWith("[--")) {
      while (!(tokens[index] ?? "]").endsWith("]")) {
        index += 1;
      }
    } else if (token.startsWith("--")) {
      const value = tokens[index + 1];
      const takesValue = value?.startsWith("<") === true;
      flags.push(takesValue ? `${token} ${value}` : token);
      index += takesValue ? 1 : 0;
    } else {
      placeholders.push(token);
    }
  }
  return { flags, placeholders };
}

/** Room for the longest help usage and a two-space gap. */
const HELP_USAGE_WIDTH = 40;
const HELP_LINE_WIDTH = 78;

/**
 * Ids as indented, comma-separated lines short enough that commander's own
 * 80-column wrap leaves them alone.
 */
function idLines(ids: readonly string[]): string[] {
  const lines: string[] = [];
  let line = "";
  for (const id of ids) {
    const next = line === "" ? `  ${id}` : `${line}, ${id}`;
    if (line !== "" && next.length > HELP_LINE_WIDTH) {
      lines.push(`${line},`);
      line = `  ${id}`;
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines;
}

/** The `--help` block: commands by task, then the look and mood ids. */
export function helpTaskList(): string {
  return [
    "Commands, by task:",
    ...COMMAND_TASKS.filter((row) => row.inHelp).map(
      (row) => `  ${row.usage.padEnd(HELP_USAGE_WIDTH)}${row.summary}`
    ),
    "  When to use each, and what to use instead: motif --describe tasks",
    "",
    "Looks, a house style added to the prompt: --look <id>",
    ...idLines(LOOKS.map((look) => look.id)),
    "Moods, the light for looks that take one: --mood <id>",
    ...idLines(CREATIVE_TAXONOMY.mood.map((mood) => mood.id)),
  ].join("\n");
}
