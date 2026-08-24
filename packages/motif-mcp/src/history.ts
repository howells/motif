/**
 * readHistory
 *
 * Reads recent CLI generations from ~/.motif/history.json.
 * The MCP package can't import from apps/cli, so this duplicates
 * the minimal logic needed to read the shared history file.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HISTORY_PATH = join(homedir(), ".motif", "history.json");

export interface HistoryEntry {
  aspect: string;
  /**
   * USD billed, or null where the endpoint is metered or per-second and no
   * figure is knowable. Never 0 for unknown — a caller summing these would
   * otherwise read a metered Topaz run as free.
   */
  cost: number | null;
  editedFrom?: string;
  filePath: string;
  id: string;
  model: string;
  prompt: string;
  resolution: string;
  timestamp: string;
}

export interface HistoryResult {
  /**
   * Spend in two halves: `allTime`/`session`/`today` sum only the runs whose
   * cost is known, and `unknown` counts, per the same windows, the runs left
   * out of those sums.
   */
  costs: HistoryCosts;
  generations: HistoryEntry[];
  hasMore: boolean;
  limit: number;
  offset: number;
  total: number;
}

export interface HistoryCosts {
  allTime: number;
  session: number;
  today: number;
  unknown: {
    allTime: number;
    session: number;
    today: number;
  };
}

interface RawGeneration {
  aspect: string;
  cost: number | null;
  editedFrom?: string;
  id: string;
  model: string;
  output: string;
  prompt: string;
  resolution: string;
  timestamp: string;
}

interface RawHistory {
  generations: RawGeneration[];
  totalCost: Omit<HistoryCosts, "unknown"> &
    Partial<Pick<HistoryCosts, "unknown">>;
}

const emptyResult = (limit: number, offset: number): HistoryResult => ({
  costs: {
    allTime: 0,
    session: 0,
    today: 0,
    unknown: { allTime: 0, session: 0, today: 0 },
  },
  generations: [],
  hasMore: false,
  limit,
  offset,
  total: 0,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Structural check for the history file shape this reader relies on.
 *
 * Entry fields are trusted as written by the CLI (the sole writer of
 * `~/.motif/history.json`); only the containers the pagination logic
 * dereferences are verified.
 */
function isRawHistory(value: unknown): value is RawHistory {
  return (
    isRecord(value) &&
    Array.isArray(value.generations) &&
    isRecord(value.totalCost)
  );
}

export function readHistory(limit = 10, offset = 0): HistoryResult {
  if (!existsSync(HISTORY_PATH)) {
    return emptyResult(limit, offset);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(HISTORY_PATH, "utf-8"));
  } catch {
    return emptyResult(limit, offset);
  }
  if (!isRawHistory(parsed)) {
    return emptyResult(limit, offset);
  }
  const history = parsed;

  // Stored oldest-first; reverse for newest-first
  const all = [...history.generations].reverse();
  const total = all.length;
  const page = all.slice(offset, offset + limit);

  return {
    costs: {
      allTime: history.totalCost.allTime,
      session: history.totalCost.session,
      today: history.totalCost.today,
      // Absent in files written before the CLI counted metered runs. Zero is
      // the honest reading there: those files recorded metered runs as $0 and
      // kept no record of how many.
      unknown: history.totalCost.unknown ?? {
        allTime: 0,
        session: 0,
        today: 0,
      },
    },
    generations: page.map((g) => ({
      aspect: g.aspect,
      cost: g.cost,
      filePath: g.output,
      id: g.id,
      model: g.model,
      prompt: g.prompt,
      resolution: g.resolution,
      timestamp: g.timestamp,
      ...(g.editedFrom === undefined ? {} : { editedFrom: g.editedFrom }),
    })),
    hasMore: offset + limit < total,
    limit,
    offset,
    total,
  };
}
