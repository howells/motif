/**
 * Series management — consistent styling across related images.
 *
 * A series is a named collection with:
 * - A style prompt prefix (prepended to every generation)
 * - Reference images (tagged for selective inclusion)
 * - Default settings
 * - Output history for cumulative reference
 */

import { randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

import type { AspectRatio, Resolution } from "@howells/motif-sdk";

import { atomicWrite, MOTIF_DIR } from "./config";
import { validateEditPath, validateResourceId } from "./input";
import { isRecord, readJsonFile, requiredFieldProblem } from "./stored-json";
import { hasText } from "./text";

const SERIES_DIR = join(MOTIF_DIR, "series");

// -- Types --

export interface SeriesRef {
  /** When the reference was added */
  added: string;
  /** Human description of what this reference represents */
  description: string;
  /** Local filename within the series refs/ directory */
  filename: string;
  /** Tag for selective inclusion (e.g. "character", "location", "style") */
  tag: string;
}

export interface SeriesOutput {
  aspect: AspectRatio;
  /** Cost of this generation */
  cost: number | null;
  /** Local filename within the series outputs/ directory */
  filename: string;
  /** Full motif generation options */
  model: string;
  /** The prompt used to generate this image */
  prompt: string;
  /** Which ref tags were used */
  refsUsed: string[];
  resolution: Resolution;
  /** When generated */
  timestamp: string;
}

export interface SeriesConfig {
  /** Creation timestamp */
  created: string;
  /** Default aspect ratio */
  defaultAspect: AspectRatio;
  /** Default resolution */
  defaultResolution: Resolution;
  /** Unique series ID */
  id: string;
  /** Pinned house look id, applied to every scene prompt */
  look?: string;
  /** Pinned light mood id, applied to every scene prompt */
  mood?: string;
  /** Human-readable name */
  name: string;
  /** Generated outputs */
  outputs: SeriesOutput[];
  /** Reference images */
  refs: SeriesRef[];
  /** Slug for directory naming */
  slug: string;
  /** Style prompt prefix — prepended to every generation in this series */
  stylePrompt: string;
  /** Last modified timestamp */
  updated: string;
}

// -- Helpers --

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 64);
}

function ensureSeriesDir(): void {
  if (!existsSync(SERIES_DIR)) {
    mkdirSync(SERIES_DIR, { mode: 0o700, recursive: true });
  }
}

function seriesPath(slug: string): string {
  validateResourceId(slug, "series slug");
  return join(SERIES_DIR, slug);
}

function seriesConfigPath(slug: string): string {
  return join(seriesPath(slug), "series.json");
}

function seriesRefsDir(slug: string): string {
  return join(seriesPath(slug), "refs");
}

function seriesOutputsDir(slug: string): string {
  return join(seriesPath(slug), "outputs");
}

// -- CRUD --

export async function createSeries(options: {
  name: string;
  stylePrompt?: string;
  defaultAspect?: AspectRatio;
  defaultResolution?: Resolution;
  fromImage?: string;
  look?: string;
  mood?: string;
}): Promise<SeriesConfig> {
  ensureSeriesDir();

  const slug = slugify(options.name);
  const dir = seriesPath(slug);

  if (existsSync(dir)) {
    throw new Error(`Series "${options.name}" already exists (slug: ${slug})`);
  }
  // Checked before anything is created, so a bad image leaves no half-made series.
  const sourcePath = hasText(options.fromImage)
    ? validateEditPath(options.fromImage)
    : undefined;

  mkdirSync(dir, { mode: 0o700, recursive: true });
  mkdirSync(join(dir, "refs"), { recursive: true });
  mkdirSync(join(dir, "outputs"), { recursive: true });

  const config: SeriesConfig = {
    created: new Date().toISOString(),
    defaultAspect: options.defaultAspect ?? "1:1",
    defaultResolution: options.defaultResolution ?? "2K",
    id: randomUUID(),
    name: options.name,
    outputs: [],
    refs: [],
    slug,
    stylePrompt: options.stylePrompt ?? "",
    updated: new Date().toISOString(),
  };
  if (hasText(options.look)) {
    config.look = options.look;
  }
  if (hasText(options.mood)) {
    config.mood = options.mood;
  }

  // Copy the initial style reference image if provided
  if (sourcePath !== undefined) {
    const filename = `style-${basename(sourcePath)}`;
    cpSync(sourcePath, join(dir, "refs", filename));
    config.refs.push({
      added: config.created,
      description: "Initial style reference (from series creation)",
      filename,
      tag: "style",
    });
  }

  await saveSeries(config);
  return config;
}

function seriesProblem(slug: string, value: unknown): string | undefined {
  if (!isRecord(value)) {
    return "expected a JSON object";
  }
  const field =
    requiredFieldProblem(value, "slug", "string") ??
    requiredFieldProblem(value, "name", "string") ??
    requiredFieldProblem(value, "defaultAspect", "string") ??
    requiredFieldProblem(value, "defaultResolution", "string") ??
    requiredFieldProblem(value, "updated", "string");
  if (field !== undefined) {
    return field;
  }
  if (value.slug !== slug) {
    return `"slug" is ${JSON.stringify(value.slug)} but the directory is "${slug}"`;
  }
  const { outputs, refs } = value;
  if (!Array.isArray(refs)) {
    return '"refs" must be an array';
  }
  for (const ref of refs) {
    if (
      !isRecord(ref) ||
      requiredFieldProblem(ref, "filename", "string") !== undefined ||
      requiredFieldProblem(ref, "tag", "string") !== undefined
    ) {
      return 'each of "refs" needs a string "filename" and "tag"';
    }
  }
  if (!Array.isArray(outputs)) {
    return '"outputs" must be an array';
  }
  for (const output of outputs) {
    if (
      !isRecord(output) ||
      requiredFieldProblem(output, "filename", "string") !== undefined ||
      requiredFieldProblem(output, "prompt", "string") !== undefined ||
      !Array.isArray(output.refsUsed)
    ) {
      return 'each of "outputs" needs a string "filename" and "prompt" and a "refsUsed" array';
    }
  }
  return undefined;
}

export function seriesExists(slug: string): boolean {
  return existsSync(seriesConfigPath(slug));
}

export async function loadSeries(slug: string): Promise<SeriesConfig> {
  const config = await readJsonFile<SeriesConfig>(
    seriesConfigPath(slug),
    (value) => seriesProblem(slug, value)
  );
  if (config === undefined) {
    throw new Error(`Series not found: ${slug}`);
  }
  return config;
}

export async function saveSeries(config: SeriesConfig): Promise<void> {
  const updated = { ...config, updated: new Date().toISOString() };
  await atomicWrite(
    seriesConfigPath(config.slug),
    JSON.stringify(updated, null, 2)
  );
}

/**
 * Every series, newest first. A directory without a `series.json` is not a
 * series and is left out; a `series.json` that cannot be used fails the listing
 * with `CorruptFileError` naming it.
 */
export async function listSeries(): Promise<SeriesConfig[]> {
  ensureSeriesDir();

  const slugs = readdirSync(SERIES_DIR, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() && existsSync(join(SERIES_DIR, d.name, "series.json"))
    )
    .map((d) => d.name);

  const series = await Promise.all(slugs.map(loadSeries));
  return series.sort(
    (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
  );
}

export async function deleteSeries(slug: string): Promise<void> {
  const dir = seriesPath(slug);
  if (!existsSync(dir)) {
    throw new Error(`Series not found: ${slug}`);
  }
  rmSync(dir, { force: true, recursive: true });
}

// -- Reference management --

export async function addRef(
  slug: string,
  imagePath: string,
  tag: string,
  description: string
): Promise<SeriesRef> {
  validateResourceId(tag, "ref tag");
  const config = await loadSeries(slug);

  const sourcePath = validateEditPath(imagePath);

  const filename = `${tag}-${basename(sourcePath)}`;
  const refsDir = seriesRefsDir(slug);
  const destPath = join(refsDir, filename);

  // Ensure destination stays within the refs directory
  if (!resolve(destPath).startsWith(`${resolve(refsDir)}/`)) {
    throw new Error(`Ref filename escapes series refs directory: ${filename}`);
  }

  cpSync(sourcePath, destPath);

  const ref: SeriesRef = {
    added: new Date().toISOString(),
    description,
    filename,
    tag,
  };

  config.refs.push(ref);
  await saveSeries(config);
  return ref;
}

export async function removeRef(slug: string, filename: string): Promise<void> {
  const config = await loadSeries(slug);

  const idx = config.refs.findIndex((r) => r.filename === filename);
  if (idx === -1) {
    throw new Error(`Reference not found: ${filename}`);
  }

  const refsDir = seriesRefsDir(slug);
  const refPath = join(refsDir, filename);

  // Ensure path stays within the refs directory
  if (!resolve(refPath).startsWith(`${resolve(refsDir)}/`)) {
    throw new Error(`Ref filename escapes series refs directory: ${filename}`);
  }

  if (existsSync(refPath)) {
    unlinkSync(refPath);
  }

  const updatedRefs = [
    ...config.refs.slice(0, idx),
    ...config.refs.slice(idx + 1),
  ];
  await saveSeries({ ...config, refs: updatedRefs });
}

/** Get absolute paths to reference images matching the given tags */
export function resolveRefs(config: SeriesConfig, tags?: string[]): string[] {
  const refsDir = seriesRefsDir(config.slug);

  const matching = tags
    ? config.refs.filter((r) => tags.includes(r.tag))
    : config.refs;

  return matching
    .map((r) => join(refsDir, r.filename))
    .filter((p) => existsSync(p));
}

// -- Output tracking --

export async function recordOutput(
  slug: string,
  output: SeriesOutput
): Promise<void> {
  const config = await loadSeries(slug);
  config.outputs.push(output);
  await saveSeries(config);
}

/**
 * Build the full prompt by prepending the series style prompt. The scene
 * starts a new sentence after the style, so it takes a capital.
 */
export function buildSeriesPrompt(
  config: SeriesConfig,
  scenePrompt: string
): string {
  if (!config.stylePrompt) {
    return scenePrompt;
  }
  return `${config.stylePrompt}. ${scenePrompt.charAt(0).toUpperCase()}${scenePrompt.slice(1)}`;
}

export { SERIES_DIR, seriesOutputsDir, seriesRefsDir };
