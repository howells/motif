import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { isTaskId, sumCosts } from "@howells/motif-sdk";
import type { AspectRatio, Resolution, TaskId } from "@howells/motif-sdk";

import {
  isRecord,
  optionalFieldProblem,
  readJsonFile,
  requiredFieldProblem,
  StorageError,
} from "./stored-json";
import { hasText } from "./text";

const MOTIF_DIR = join(homedir(), ".motif");
const CONFIG_PATH = join(MOTIF_DIR, "config.json");
const HISTORY_PATH = join(MOTIF_DIR, "history.json");
const LOCAL_CONFIG_PATH = ".motifrc";

/** A Model pinned for one Task: `tasks.<task>.model` in config. */
export interface TaskPin {
  model: string;
}

export interface MotifConfig {
  apiKey?: string;
  defaultAspect: AspectRatio;
  defaultResolution: Resolution;
  tasks?: Partial<Record<TaskId, TaskPin>>;
}

export interface Generation {
  aspect: AspectRatio;
  /**
   * USD actually billed for this run, or null where nothing knows the figure —
   * a per-second or metered endpoint. Never 0 for unknown: a zero meaning
   * "we don't know" is indistinguishable from one meaning "free".
   */
  cost: number | null;
  editedFrom?: string;
  id: string;
  /** Reference images the run took besides its source, e.g. restyle's --like. */
  references?: string[];
  /** Look id, when the run used one. */
  look?: string;
  model: string;
  /** Mood id, when the run used one. */
  mood?: string;
  output: string;
  prompt: string;
  resolution: Resolution;
  timestamp: string;
}

/**
 * Running spend, in two halves.
 *
 * `session`, `today` and `allTime` sum only the runs whose cost is known.
 * `unknown` counts, per the same three windows, the runs that were left out, so
 * a total can say "$1.23 plus 4 metered runs" instead of quietly reading as
 * complete.
 */
export interface TotalCost {
  session: number;
  today: number;
  allTime: number;
  unknown: {
    session: number;
    today: number;
    allTime: number;
  };
}

export interface History {
  generations: Generation[];
  lastSessionDate: string;
  totalCost: TotalCost;
}

const DEFAULT_CONFIG: MotifConfig = {
  defaultAspect: "1:1",
  defaultResolution: "2K",
};

/** The Model pinned per Task, for `resolveTask`'s environment. */
export function taskPins(config: MotifConfig): Partial<Record<TaskId, string>> {
  const pins: Partial<Record<TaskId, string>> = {};
  for (const [task, pin] of Object.entries(config.tasks ?? {})) {
    if (isTaskId(task) && hasText(pin?.model)) {
      pins[task] = pin.model;
    }
  }
  return pins;
}

const emptyTotalCost = (): TotalCost => ({
  allTime: 0,
  session: 0,
  today: 0,
  unknown: { allTime: 0, session: 0, today: 0 },
});

const today = (): string => new Date().toISOString().split("T")[0] ?? "";

const emptyHistory = (): History => ({
  generations: [],
  lastSessionDate: today(),
  totalCost: emptyTotalCost(),
});

const COST_WINDOWS = ["session", "today", "allTime"] as const;

function configProblem(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return "expected a JSON object";
  }
  return (
    optionalFieldProblem(value, "apiKey", "string") ??
    optionalFieldProblem(value, "defaultAspect", "string") ??
    optionalFieldProblem(value, "defaultResolution", "string") ??
    optionalFieldProblem(value, "tasks", "object")
  );
}

function historyProblem(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return "expected a JSON object";
  }
  if (!Array.isArray(value.generations)) {
    return '"generations" must be an array';
  }
  if (!value.generations.every(isRecord)) {
    return '"generations" must hold only objects';
  }
  const lastSessionDate = requiredFieldProblem(
    value,
    "lastSessionDate",
    "string"
  );
  if (lastSessionDate !== undefined) {
    return lastSessionDate;
  }
  const { totalCost } = value;
  if (!isRecord(totalCost)) {
    return '"totalCost" must be an object';
  }
  const { unknown } = totalCost;
  if (!isRecord(unknown)) {
    return '"totalCost.unknown" must be an object';
  }
  for (const window of COST_WINDOWS) {
    const problem =
      requiredFieldProblem(totalCost, window, "number") ??
      requiredFieldProblem(unknown, window, "number");
    if (problem !== undefined) {
      return `"totalCost" is incomplete: ${problem}`;
    }
  }
  return undefined;
}

function ensureMotifDir(): void {
  if (!existsSync(MOTIF_DIR)) {
    try {
      mkdirSync(MOTIF_DIR, { mode: 0o700, recursive: true });
    } catch (error) {
      throw new StorageError(MOTIF_DIR, "write", error);
    }
  }
}

/**
 * Write file atomically using temp-rename pattern
 * Prevents corruption if process is interrupted mid-write
 */
export async function atomicWrite(
  filePath: string,
  data: string
): Promise<void> {
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    // Write to temp file with restrictive permissions
    writeFileSync(tempPath, data, { mode: 0o600 });
    // Atomic rename (on POSIX systems)
    renameSync(tempPath, filePath);
  } catch (error) {
    // Clean up temp file on failure
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw new StorageError(filePath, "write", error);
  }
}

/** Layer one config over another; `tasks` merges per Task. */
export function mergeConfigLayers(
  base: MotifConfig,
  layer: Partial<MotifConfig>
): MotifConfig {
  const merged: MotifConfig = { ...base, ...layer };
  if (base.tasks !== undefined || layer.tasks !== undefined) {
    merged.tasks = { ...base.tasks, ...layer.tasks };
  }
  return merged;
}

/**
 * The config in effect: defaults, then `~/.motif/config.json`, then `.motifrc`
 * in the working directory. A file that exists but cannot be used throws
 * `CorruptFileError`; a missing one is skipped.
 */
export async function loadConfig(): Promise<MotifConfig> {
  ensureMotifDir();

  let config = { ...DEFAULT_CONFIG };
  for (const path of [CONFIG_PATH, LOCAL_CONFIG_PATH]) {
    const stored = await readJsonFile<Partial<MotifConfig>>(
      path,
      configProblem
    );
    if (stored !== undefined) {
      config = mergeConfigLayers(config, stored);
    }
  }
  return config;
}

/**
 * Merge `config` into `~/.motif/config.json`, so only the keys passed are
 * written. A config file that cannot be used throws `CorruptFileError` and is
 * left as it is.
 */
export async function saveConfig(config: Partial<MotifConfig>): Promise<void> {
  ensureMotifDir();

  const existing =
    (await readJsonFile<Partial<MotifConfig>>(CONFIG_PATH, configProblem)) ??
    {};
  await atomicWrite(
    CONFIG_PATH,
    JSON.stringify({ ...existing, ...config }, null, 2)
  );
}

/**
 * The saved history, with the session and daily costs reset on a new day. A
 * missing file is an empty history; a file that cannot be used throws
 * `CorruptFileError`, so the next write cannot replace it.
 */
export async function loadHistory(): Promise<History> {
  ensureMotifDir();

  const history = await readJsonFile<History>(HISTORY_PATH, historyProblem);
  if (history === undefined) {
    return emptyHistory();
  }

  if (history.lastSessionDate !== today()) {
    history.totalCost.session = 0;
    history.totalCost.today = 0;
    history.totalCost.unknown.session = 0;
    history.totalCost.unknown.today = 0;
    history.lastSessionDate = today();
  }
  return history;
}

export async function saveHistory(history: History): Promise<void> {
  ensureMotifDir();
  await atomicWrite(HISTORY_PATH, JSON.stringify(history, null, 2));
}

export async function addGeneration(generation: Generation): Promise<void> {
  await addGenerations([generation]);
}

export async function addGenerations(generations: Generation[]): Promise<void> {
  if (generations.length === 0) {
    return;
  }

  const history = await loadHistory();

  // Runs whose cost is unknown are counted, not summed as zero: adding them in
  // as free is what made the session total under-report real spend.
  const { known, unknown } = sumCosts(generations.map((g) => g.cost));
  history.generations.push(...generations);
  history.totalCost.session += known;
  history.totalCost.today += known;
  history.totalCost.allTime += known;
  history.totalCost.unknown.session += unknown;
  history.totalCost.unknown.today += unknown;
  history.totalCost.unknown.allTime += unknown;

  history.lastSessionDate = today();

  // Keep only last 100 generations (remove oldest from front)
  while (history.generations.length > 100) {
    history.generations.shift();
  }

  await saveHistory(history);
}

export async function getLastGeneration(): Promise<Generation | null> {
  const history = await loadHistory();
  // Generations are stored oldest-first, so last element is most recent
  return history.generations.at(-1) ?? null;
}

export const MISSING_FAL_KEY_MESSAGE =
  "FAL_KEY not found. Set FAL_KEY environment variable or add apiKey to ~/.motif/config.json";

export function generateId(): string {
  // Use cryptographically secure UUID for guaranteed uniqueness
  return randomUUID();
}

/** A history prompt's leading `[verb] ` tag, from an earlier Task run. */
const HISTORY_TAG_REGEX = /^\[[\w-]+\]\s*/;

/**
 * The history prompt for a Task run: `[verb]`, then the prompt it came from.
 * A source made by an earlier Task run already carries a tag, which is
 * replaced so history never reads "[layers] [layers]".
 */
export function historyPrompt(
  command: string,
  prompt: string | undefined
): string {
  const base = (prompt ?? "").replace(HISTORY_TAG_REGEX, "").trim();
  return hasText(base) ? `[${command}] ${base}` : `[${command}]`;
}

/** What a history entry is made of; `newGeneration` adds the id and timestamp. */
export type GenerationFields = Omit<Generation, "id" | "timestamp"> & {
  timestamp?: string;
};

/**
 * A history entry, with an id, and a timestamp unless the caller shares one.
 * Optional fields are left out when they have nothing to say.
 */
export function newGeneration(fields: GenerationFields): Generation {
  return {
    aspect: fields.aspect,
    cost: fields.cost,
    ...(hasText(fields.editedFrom) && { editedFrom: fields.editedFrom }),
    id: generateId(),
    ...(hasText(fields.look) && { look: fields.look }),
    model: fields.model,
    ...(hasText(fields.mood) && { mood: fields.mood }),
    output: fields.output,
    prompt: fields.prompt,
    ...(fields.references !== undefined &&
      fields.references.length > 0 && { references: fields.references }),
    resolution: fields.resolution,
    timestamp: fields.timestamp ?? new Date().toISOString(),
  };
}

export { CONFIG_PATH, HISTORY_PATH, MOTIF_DIR };
