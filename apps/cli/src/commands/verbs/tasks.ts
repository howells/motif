/**
 * The task table: which command does which job, in the words a caller uses.
 *
 * Every surface that routes by task reads this one list - the `--help` command
 * list, the `whenToUse`, `notFor` and `tasks` fields on each `--describe`
 * command, the top-level `tasks` index, and `motif --describe tasks`. A
 * `--describe` command without a row here fails loudly rather than going out
 * unrouted.
 */

import { CREATIVE_TAXONOMY, LOOKS } from "@howells/motif-sdk";

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
  /** What to use instead, naming the sibling command or `motif tool` id. */
  readonly notFor: string;
  /** Task words that route here. Unique across the whole table. */
  readonly tasks: readonly string[];
  /** Listed in `--help`. False for flag-routed commands the options already show. */
  readonly inHelp: boolean;
}

/** Rows in `--help` order: generation, the verbs, then the wider commands. */
export const COMMAND_TASKS: readonly CommandTask[] = [
  {
    command: "generate",
    usage: 'motif "prompt"',
    summary: "make an image from a prompt, or edit with -e",
    whenToUse:
      "Make a new image from a text prompt, or change an image by passing it with -e and describing the result.",
    notFor:
      "Taking one object out (erase), changing an existing image's ratio (reframe), or a consistent set of images (series run).",
    tasks: [
      "create",
      "draw",
      "edit",
      "generate",
      "illustrate",
      "make",
      "render",
    ],
    inHelp: true,
  },
  {
    command: "erase",
    usage: 'motif erase "what" [image]',
    summary: "remove an object and fill the gap",
    whenToUse:
      "Remove an object, person or clutter from a photo, named in words, and fill the gap it leaves.",
    notFor:
      "An object with a visible shadow (tool finegrain-eraser), putting something else in the gap (tool bria-genfill), text (tool text-removal), or the whole background (--rmbg).",
    tasks: [
      "cleanup",
      "delete",
      "erase-object",
      "inpaint",
      "remove",
      "remove-object",
    ],
    inHelp: true,
  },
  {
    command: "reframe",
    usage: "motif reframe --og [image]",
    summary: "extend the canvas to a new aspect ratio",
    whenToUse:
      "Extend or recut an existing image to a new aspect ratio, such as square to 16:9, generating whatever the new edges need.",
    notFor:
      "Outpainting by a set margin (tool bria-expand or flux-outpaint), several sizes at once (tool smart-resize), or a new image at a given ratio (generate with -a or a preset).",
    tasks: [
      "crop",
      "expand",
      "extend",
      "outpaint",
      "ratio",
      "resize",
      "uncrop",
    ],
    inHelp: true,
  },
  {
    command: "segment",
    usage: 'motif segment "what" [image]',
    summary: "cut out or mask a named thing",
    whenToUse:
      "Cut out or mask a named thing in an image and get its mask files, boxes and scores back.",
    notFor:
      "The background behind the main subject (--rmbg), every region without a prompt (tool sam2-auto), video (tool sam3-video), or boxes without masks (ask --detect).",
    tasks: ["cut-out", "cutout", "isolate", "mask", "select"],
    inHelp: true,
  },
  {
    command: "ask",
    usage: 'motif ask "question" [image]',
    summary: "caption, count, detect or ask about an image",
    whenToUse:
      "Ask a question about an image, caption it, count things in it or find where they are, without writing a file.",
    notFor:
      "Transcribing a page of text (tool got-ocr), content moderation (tool nsfw), or pixel masks (segment).",
    tasks: [
      "caption",
      "count",
      "describe-image",
      "detect",
      "identify",
      "ocr",
      "query",
    ],
    inHelp: true,
  },
  {
    command: "enhance",
    usage: "motif enhance [image]",
    summary: "upscale, restore, denoise or sharpen",
    whenToUse:
      "Upscale, restore, denoise, sharpen or colour-correct an existing image, one Topaz mode at a time.",
    notFor:
      "A quick Clarity upscale of the last generation (--up), colourising a black-and-white photo (tool ddcolor), or video (tool topaz-video).",
    tasks: ["deblur", "denoise", "improve", "restore", "sharpen", "upscale"],
    inHelp: true,
  },
  {
    command: "layers",
    usage: "motif layers [image]",
    summary: "split an image into transparent layers",
    whenToUse:
      "Split a flat image into stacked transparent PNG layers that can be moved or edited separately.",
    notFor:
      "Named, z-ordered object layers (tool seedream-layerize), separating text from artwork (tool ideogram-layerize-text), or one masked object (segment).",
    tasks: ["decompose", "layer", "separate", "split"],
    inHelp: true,
  },
  {
    command: "vectorize",
    usage: "motif vectorize [image]",
    summary: "trace a raster image to a clean SVG",
    whenToUse:
      "Turn a raster logo, icon or illustration into a clean, editable SVG.",
    notFor:
      "Pixel-faithful tracing with many paths (tool image2svg), or drawing a new image from a prompt (generate).",
    tasks: ["svg", "trace", "vector", "vectorise"],
    inHelp: true,
  },
  {
    command: "sheet",
    usage: "motif sheet <images...>",
    summary: "lay images out on a captioned contact sheet",
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
    summary: "make a consistent set of images from a theme",
    whenToUse:
      "Make a set of related images that share one style from a single theme, such as six brutalist buildings.",
    notFor:
      "One image (generate), several takes of the same prompt (generate with -n), or variations of the last image (--vary).",
    tasks: ["batch", "consistent", "multi", "set", "themed"],
    inHelp: true,
  },
  {
    command: "series",
    usage: "motif series <subcommand>",
    summary: "keep a reusable style, references and history",
    whenToUse:
      "Keep a named style with reference images, a pinned look and mood, and its own history, so later images match it.",
    notFor:
      "A one-off themed set (series run creates or reuses a series for you), or a house register for one image (generate with --look).",
    tasks: ["album", "character", "collection", "project", "references"],
    inHelp: true,
  },
  {
    command: "tool",
    usage: "motif tool list",
    summary: "other fal utilities: depth, 3D, relight, OCR",
    whenToUse:
      "Reach a fal utility with no command of its own, such as depth maps, 3D models, relighting, materials, document OCR or moderation.",
    notFor:
      "Anything a command covers. erase, reframe, segment, ask, enhance, layers and vectorize make the same calls and put the saved path at the top level.",
    tasks: ["3d", "depth", "material", "pbr", "relight", "texture", "utility"],
    inHelp: true,
  },
  {
    command: "studio",
    usage: "motif studio",
    summary: "open the interactive terminal Studio",
    whenToUse:
      "Browse, generate and review images interactively in a terminal, as a person rather than a script.",
    notFor:
      "Agents and scripts, which call the commands directly with --format json.",
    tasks: ["gui", "interactive", "tui", "ui"],
    inHelp: true,
  },
  {
    command: "upscale",
    usage: "motif --up [image]",
    summary: "upscale the last image with Clarity",
    whenToUse:
      "Enlarge the last generation, or a given image, by 2 to 8 times with Clarity.",
    notFor:
      "Restoring, denoising or sharpening, or a faithful Topaz upscale (enhance).",
    tasks: ["enlarge"],
    inHelp: false,
  },
  {
    command: "rmbg",
    usage: "motif --rmbg",
    summary: "remove the background from the last image",
    whenToUse:
      "Cut the subject of the last generation out onto a transparent background.",
    notFor:
      "Taking one object out (erase), masking a named thing (segment), or generating with transparency from the start (generate with --transparent).",
    tasks: ["background", "remove-background", "transparent-background"],
    inHelp: false,
  },
  {
    command: "vary",
    usage: "motif --vary",
    summary: "make variations of the last image",
    whenToUse:
      "Make up to four variations of the last generation, keeping its prompt unless given a new one.",
    notFor:
      "A planned set of different scenes in one style (series run), or a specific change to an image (generate with -e).",
    tasks: ["alternatives", "remix", "variant", "variation", "variations"],
    inHelp: false,
  },
  {
    command: "video",
    usage: "motif --video [image]",
    summary: "animate an image into a short video",
    whenToUse: "Animate a still image into a 3 to 15 second video clip.",
    notFor:
      "Removing a video's background (tool bria-video-rmbg), or upscaling a video (tool topaz-video).",
    tasks: ["animate", "clip", "motion", "movie"],
    inHelp: false,
  },
  {
    command: "last",
    usage: "motif --last",
    summary: "show the last generation",
    whenToUse:
      "Find the path, prompt, model and cost of the most recent generation.",
    notFor: "Older generations (history).",
    tasks: ["latest", "previous", "recent"],
    inHelp: false,
  },
  {
    command: "history",
    usage: "motif --history",
    summary: "list past generations and spend",
    whenToUse:
      "List past generations with their paths, prompts, models and costs, and see what has been spent.",
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
      "Look up models, flags, enums, prices and output shapes as JSON before building a command.",
    notFor:
      "The arguments of one fal utility (motif tool describe <id>), or the task routing alone (motif --describe tasks).",
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

const HELP_USAGE_WIDTH = 30;
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
