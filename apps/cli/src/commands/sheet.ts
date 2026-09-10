/**
 * sheet command — lay saved images out on one contact sheet.
 *
 * `motif sheet a.png b.png` or `motif sheet --last 6`. Each cell is the image
 * fitted into a 512 px square on a warm off-white ground, captioned from
 * history (model, look, mood, cost) or with the filename when history has no
 * record of it. The output path follows the same rules as generation.
 */

import { existsSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

import { formatCost } from "@howells/motif-sdk";
import chalk from "chalk";
import { Command } from "commander";
import sharp from "sharp";

import { loadConfig, loadHistory } from "../utils/config";
import type { Generation } from "../utils/config";
import {
  exitForErrorCode,
  formatForParseErrors,
  handleError,
  routeCommanderErrors,
  validateOption,
  validateOutput,
} from "../utils/errors";
import { generateFilename, openImage } from "../utils/image";
import { parseIntegerOption, validateEditPath } from "../utils/input";
import { emit, emitError, isStructured } from "../utils/output";
import type { EmitOptions } from "../utils/output";
import { hasText } from "../utils/text";

/** Long edge of each image cell, in pixels. */
export const SHEET_CELL = 512;
/** Height of the caption band under each cell. */
export const SHEET_CAPTION_HEIGHT = 48;
/** Margin around the sheet and gap between cells. */
export const SHEET_GAP = 24;
/** Warm off-white ground behind and around every cell. */
export const SHEET_BACKGROUND = "#F5F1EA";
const CAPTION_COLOUR = "#4A443C";
const CAPTION_MAX_CHARS = 60;
const SHEET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export interface SheetCell {
  caption: string;
  path: string;
}

interface SheetOptions {
  cols?: string;
  fields?: string;
  format?: string;
  last?: string;
  open?: boolean;
  output?: string;
}

/**
 * Caption for one image: model, look, mood and cost from the newest history
 * entry whose output is this file, or the filename when there is none.
 */
export function captionFor(
  path: string,
  generations: readonly Generation[]
): string {
  const target = resolve(path);
  const match = generations
    .toReversed()
    .find((g) => resolve(g.output) === target);
  if (match === undefined) {
    return basename(path);
  }
  return [
    match.model,
    match.look,
    match.mood,
    match.cost === null ? "cost unknown" : formatCost(match.cost),
  ]
    .filter((part): part is string => hasText(part))
    .join(" · ");
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function captionSvg(caption: string): Buffer {
  const text =
    caption.length > CAPTION_MAX_CHARS
      ? `${caption.slice(0, CAPTION_MAX_CHARS - 1)}…`
      : caption;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_CELL}" height="${SHEET_CAPTION_HEIGHT}"><text x="${SHEET_CELL / 2}" y="30" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="${CAPTION_COLOUR}">${escapeXml(text)}</text></svg>`
  );
}

/** Default column count: roughly square. */
export function defaultColumns(count: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(count)));
}

/** Render the sheet to `outputPath` and return its pixel size. */
export async function renderSheet(
  cells: readonly SheetCell[],
  outputPath: string,
  cols: number
): Promise<{ height: number; width: number }> {
  const rows = Math.ceil(cells.length / cols);
  const cellHeight = SHEET_CELL + SHEET_CAPTION_HEIGHT;
  const width = SHEET_GAP + cols * (SHEET_CELL + SHEET_GAP);
  const height = SHEET_GAP + rows * (cellHeight + SHEET_GAP);

  const layers = await Promise.all(
    cells.map(async (cell, index) => {
      const left = SHEET_GAP + (index % cols) * (SHEET_CELL + SHEET_GAP);
      const top =
        SHEET_GAP + Math.floor(index / cols) * (cellHeight + SHEET_GAP);
      const image = await sharp(cell.path)
        .resize(SHEET_CELL, SHEET_CELL, {
          background: SHEET_BACKGROUND,
          fit: "contain",
        })
        .png()
        .toBuffer();
      return [
        { input: image, left, top },
        { input: captionSvg(cell.caption), left, top: top + SHEET_CELL },
      ];
    })
  );

  await sharp({
    create: { background: SHEET_BACKGROUND, channels: 3, height, width },
  })
    .composite(layers.flat())
    .toFile(outputPath);
  return { height, width };
}

/** The newest `count` history outputs still on disk, oldest first. */
function lastOutputs(
  generations: readonly Generation[],
  count: number
): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const generation of generations.toReversed()) {
    if (paths.length === count) {
      break;
    }
    const path = resolve(generation.output);
    if (!seen.has(path) && existsSync(path)) {
      seen.add(path);
      paths.push(path);
    }
  }
  return paths.toReversed();
}

async function buildSheet(
  files: string[],
  opts: SheetOptions,
  emitOpts: EmitOptions
): Promise<void> {
  const { format } = emitOpts;
  if (files.length > 0 === (opts.last !== undefined)) {
    handleError(
      new Error(
        "Pass image files (motif sheet a.png b.png) or --last <n>, not both and not neither"
      ),
      "INVALID_OPTION",
      format
    );
  }

  const history = await loadHistory();
  let paths: string[];
  if (opts.last === undefined) {
    try {
      paths = files.map((file) => validateEditPath(file));
    } catch (error) {
      handleError(error, "INVALID_IMAGE_PATH", format);
    }
  } else {
    const count = validateOption(format, () =>
      parseIntegerOption(opts.last ?? "", "--last", { max: 100, min: 1 })
    );
    paths = lastOutputs(history.generations, count);
    if (paths.length === 0) {
      emitError(
        {
          code: "NO_PREVIOUS",
          message: "History has no saved images that still exist on disk",
        },
        format
      );
      exitForErrorCode("NO_PREVIOUS");
    }
  }

  const cols = Math.min(
    paths.length,
    opts.cols === undefined
      ? defaultColumns(paths.length)
      : validateOption(format, () =>
          parseIntegerOption(opts.cols ?? "", "--cols", { max: 20, min: 1 })
        )
  );

  const outputPath = validateOutput(
    format,
    hasText(opts.output) ? opts.output : generateFilename("sheet")
  );
  if (!SHEET_EXTENSIONS.has(extname(outputPath).toLowerCase())) {
    handleError(
      new Error(
        `Sheet output must end in ${[...SHEET_EXTENSIONS].join(", ")}: ${opts.output ?? outputPath}`
      ),
      "INVALID_OUTPUT_PATH",
      format
    );
  }

  const cells = paths.map((path) => ({
    caption: captionFor(path, history.generations),
    path,
  }));

  let size: { height: number; width: number };
  try {
    size = await renderSheet(cells, outputPath, cols);
  } catch (error) {
    handleError(error, "INVALID_IMAGE_PATH", format);
  }

  const result = {
    cols,
    count: cells.length,
    height: size.height,
    path: outputPath,
    width: size.width,
  };
  if (isStructured(format)) {
    emit({ command: "sheet", ...result }, emitOpts);
  } else {
    console.log(
      chalk.green(`✓ Sheet: ${outputPath}`) +
        chalk.dim(
          ` (${size.width}x${size.height}, ${cells.length} images, ${cols} columns)`
        )
    );
  }

  const config = await loadConfig();
  if (config.openAfterGenerate && opts.open !== false) {
    openImage(outputPath);
  }
}

export async function runSheet(args: string[]): Promise<void> {
  const format = formatForParseErrors(args);
  const program = routeCommanderErrors(
    new Command()
      .name("motif sheet")
      .description("Lay saved images out on one captioned contact sheet")
      .argument("[files...]", "Images to include")
      .option("--last <n>", "Use the newest n images from history")
      .option(
        "-o, --output <file>",
        "Output file (.png, .jpg or .webp). Default: sheet-<timestamp>.png"
      )
      .option("--cols <n>", "Columns (default: roughly square)")
      .option("--format <format>", "Output format: human, json, ndjson")
      .option("--fields <fields>", "Comma-separated fields to include")
      .option("--no-open", "Don't open the sheet afterwards"),
    format
  );
  program.action(async (files: string[], opts: SheetOptions) => {
    await buildSheet(files, opts, {
      fields: opts.fields,
      format,
      sanitize: true,
    });
  });
  await program.parseAsync(["node", "motif-sheet", ...args]);
}
