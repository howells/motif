import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { isTaskId, sumCosts } from "@howells/motif-sdk";
import type { AspectRatio, Resolution, TaskId } from "@howells/motif-sdk";

import { parseJsonAs } from "./json";
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
  openAfterGenerate: boolean;
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
  openAfterGenerate: true,
};

/** A config file as stored: known fields plus whatever else the user wrote. */
export type StoredConfig = Partial<MotifConfig> & Record<string, unknown>;

export interface MigratedConfig {
  /** Whether the file had legacy keys, so the global file is rewritten. */
  changed: boolean;
  config: StoredConfig;
}

/**
 * One legacy key's move onto a Task pin. `shippedDefault` is the value the old
 * `saveConfig` wrote into every saved file, so it is not a user choice and is
 * dropped rather than pinned. `renames` maps values whose Model id changed.
 */
function legacyPin(
  value: unknown,
  shippedDefault: string,
  renames: Readonly<Record<string, string>> = {}
): TaskPin | undefined {
  if (
    typeof value !== "string" ||
    !hasText(value) ||
    value === shippedDefault
  ) {
    return undefined;
  }
  return { model: renames[value] ?? value };
}

/**
 * Move a config written before Tasks onto `tasks.<task>.model`. Pure. An
 * existing `tasks` entry wins over a legacy key, and legacy keys are removed
 * whether or not they became a pin.
 */
export function migrateLegacyConfig(raw: StoredConfig): MigratedConfig {
  const { backgroundRemover, defaultModel, upscaler, ...config } = raw;
  const changed = ["backgroundRemover", "defaultModel", "upscaler"].some(
    (key) => Object.hasOwn(raw, key)
  );
  if (!changed) {
    return { changed, config: raw };
  }
  const tasks: Partial<Record<TaskId, TaskPin>> = {
    cutout: legacyPin(backgroundRemover, "rmbg", {
      bria: "bria-rmbg",
      rmbg: "birefnet",
    }),
    generate: legacyPin(defaultModel, "banana"),
    upscale: legacyPin(upscaler, "clarity"),
    ...raw.tasks,
  };
  const pinned = Object.fromEntries(
    Object.entries(tasks).filter(([, pin]) => pin !== undefined)
  );
  if (Object.keys(pinned).length > 0) {
    config.tasks = pinned;
  }
  return { changed, config };
}

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

const DEFAULT_HISTORY: History = {
  generations: [],
  lastSessionDate: new Date().toISOString().split("T")[0] ?? "",
  totalCost: emptyTotalCost(),
};

function ensureMotifDir(): void {
  if (!existsSync(MOTIF_DIR)) {
    mkdirSync(MOTIF_DIR, { mode: 0o700, recursive: true });
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
    throw error;
  }
}

/**
 * Migrate a parsed global config and try to write the migrated file back once.
 * A failed write only warns: the migrated values are still used this run.
 */
export async function migrateGlobalConfig(
  stored: StoredConfig,
  rewrite: (data: string) => Promise<void>,
  path: string = CONFIG_PATH
): Promise<StoredConfig> {
  const { changed, config } = migrateLegacyConfig(stored);
  if (changed) {
    try {
      await rewrite(JSON.stringify(config, null, 2));
    } catch (error) {
      console.error(
        `Warning: Could not rewrite ${path}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return config;
}

/** Layer one config over another; `tasks` merges per Task. */
export function mergeConfigLayers(
  base: MotifConfig,
  layer: StoredConfig
): MotifConfig {
  const merged: MotifConfig = { ...base, ...layer };
  if (base.tasks !== undefined || layer.tasks !== undefined) {
    merged.tasks = { ...base.tasks, ...layer.tasks };
  }
  return merged;
}

export async function loadConfig(): Promise<MotifConfig> {
  ensureMotifDir();

  let config = { ...DEFAULT_CONFIG };

  // Load global config
  if (existsSync(CONFIG_PATH)) {
    let stored: StoredConfig | undefined;
    try {
      stored = parseJsonAs<StoredConfig>(await readFile(CONFIG_PATH, "utf-8"));
    } catch (error) {
      console.error(
        `Warning: Failed to parse ${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`
      );
      console.error("Using default configuration.");
    }
    if (stored !== undefined) {
      const globalConfig = await migrateGlobalConfig(stored, async (data) => {
        await atomicWrite(CONFIG_PATH, data);
      });
      config = mergeConfigLayers(config, globalConfig);
    }
  }

  // Load local config (overrides global)
  if (existsSync(LOCAL_CONFIG_PATH)) {
    try {
      const raw = await readFile(LOCAL_CONFIG_PATH, "utf-8");
      // Migrated in memory only: a project's .motifrc is never rewritten.
      const { config: localConfig } = migrateLegacyConfig(
        parseJsonAs<StoredConfig>(raw)
      );
      config = mergeConfigLayers(config, localConfig);
    } catch (error) {
      console.error(
        `Warning: Failed to parse ${LOCAL_CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return config;
}

export async function saveConfig(config: Partial<MotifConfig>): Promise<void> {
  ensureMotifDir();

  let existing: StoredConfig = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = await readFile(CONFIG_PATH, "utf-8");
      existing = migrateLegacyConfig(parseJsonAs<StoredConfig>(raw)).config;
    } catch {
      // Start from an empty file if the existing config is corrupted
    }
  }

  const merged = { ...existing, ...config };
  await atomicWrite(CONFIG_PATH, JSON.stringify(merged, null, 2));
}

/** A history file's totals, whose unknown counts predate MOT-38 and may be absent. */
type StoredTotalCost = Omit<TotalCost, "unknown"> &
  Partial<Pick<TotalCost, "unknown">>;

/**
 * Fill in the unknown-run counts a history file written before MOT-38 has no
 * field for. Those files recorded metered runs as costing zero, so nothing in
 * them can say how many there were: they load as zero rather than as a guess,
 * and the counts become accurate from the next run on.
 */
function withUnknownCounts(totals: StoredTotalCost | undefined): TotalCost {
  if (totals === undefined) {
    return emptyTotalCost();
  }
  return {
    allTime: totals.allTime,
    session: totals.session,
    today: totals.today,
    unknown: totals.unknown ?? { allTime: 0, session: 0, today: 0 },
  };
}

export async function loadHistory(): Promise<History> {
  ensureMotifDir();

  if (!existsSync(HISTORY_PATH)) {
    return { ...DEFAULT_HISTORY, totalCost: emptyTotalCost() };
  }

  try {
    const raw = await readFile(HISTORY_PATH, "utf-8");
    const parsed = parseJsonAs<History>(raw);
    const history: History = {
      ...parsed,
      totalCost: withUnknownCounts(parsed.totalCost),
    };

    // Reset session/daily costs if it's a new day
    const today = new Date().toISOString().split("T")[0] ?? "";
    if (history.lastSessionDate !== today) {
      history.totalCost.session = 0;
      history.totalCost.today = 0;
      history.totalCost.unknown.session = 0;
      history.totalCost.unknown.today = 0;
      history.lastSessionDate = today;
    }

    return history;
  } catch (error) {
    console.error(
      `Warning: Failed to load history from ${HISTORY_PATH}: ${error instanceof Error ? error.message : String(error)}`
    );
    console.error("Starting with empty history.");
    return { ...DEFAULT_HISTORY, totalCost: emptyTotalCost() };
  }
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
  // as free is what made the session total under-report real spend. MOT-38.
  const { known, unknown } = sumCosts(generations.map((g) => g.cost));
  history.generations.push(...generations);
  history.totalCost.session += known;
  history.totalCost.today += known;
  history.totalCost.allTime += known;
  history.totalCost.unknown.session += unknown;
  history.totalCost.unknown.today += unknown;
  history.totalCost.unknown.allTime += unknown;

  history.lastSessionDate = new Date().toISOString().split("T")[0] ?? "";

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

export { CONFIG_PATH, HISTORY_PATH, MOTIF_DIR };
