/** The Commands index: every catalogue entry, grouped by where it runs.
 *
 * The six phase 1 Tasks are working forms in the App. `--last` and
 * `--history` open the Library, which is the App's form of both. Everything
 * else runs in the terminal today and has a page showing how. */
import type { CatalogueEntry } from "./catalogue";
import { CATALOGUE } from "./catalogue";

export const APP_TASK_IDS = [
  "generate",
  "vary",
  "erase",
  "cutout",
  "reframe",
  "upscale",
] as const;

export type AppTaskId = (typeof APP_TASK_IDS)[number];

/** The Tasks that start from an existing image: everything but generate. */
export const SOURCE_TASK_IDS: readonly Exclude<AppTaskId, "generate">[] = [
  "vary",
  "erase",
  "cutout",
  "reframe",
  "upscale",
];

export const isAppTaskId = (id: string): id is AppTaskId =>
  (APP_TASK_IDS as readonly string[]).includes(id);

/** Terminal commands whose App form is the Library. */
export const LIBRARY_IDS: ReadonlySet<string> = new Set(["last", "history"]);

const GROUPS = [
  {
    ids: [...APP_TASK_IDS, "last", "history"],
    name: "In the App now",
  },
  {
    ids: [
      "sheet",
      "restore",
      "relight",
      "restyle",
      "try-on",
      "segment",
      "ask",
      "map",
      "material",
      "tile",
      "series-run",
      "series",
    ],
    name: "Coming to the App next",
  },
  {
    ids: ["animate", "mesh", "layers", "vectorize"],
    name: "Later: video, 3D and files",
  },
  { ids: ["studio", "describe", "errors"], name: "Terminal only" },
] as const;

const ENTRIES = new Map<string, CatalogueEntry>();
for (const group of CATALOGUE) {
  for (const entry of group.entries) {
    ENTRIES.set(entry.id, entry);
  }
}

export const commandEntry = (id: string): CatalogueEntry | undefined =>
  ENTRIES.get(id);

/** The command as you'd type its name: `series run`, `--last` → `last`. */
export const commandName = (entry: CatalogueEntry): string =>
  entry.verb.replace(/^--/u, "");

/** A Task's name as the interface shows it: `erase` → `Erase`,
 * `try-on` → `Try-on`. Lowercase stays for what you type in a terminal. */
export const taskTitle = (id: string): string =>
  `${id.slice(0, 1).toUpperCase()}${id.slice(1)}`;

/** The command as a heading names it: `series run` → `Series run`. */
export const commandTitle = (entry: CatalogueEntry): string =>
  taskTitle(commandName(entry));

/** A summary as a table cell, without its full stop. */
export const shortSummary = (entry: CatalogueEntry): string =>
  entry.summary.replace(/\.$/u, "");

export interface CommandGroup {
  readonly entries: readonly CatalogueEntry[];
  readonly name: string;
}

export const COMMAND_GROUPS: readonly CommandGroup[] = GROUPS.map((group) => ({
  entries: group.ids.flatMap((id) => {
    const entry = ENTRIES.get(id);
    return entry === undefined ? [] : [entry];
  }),
  name: group.name,
}));

export const COMMAND_COUNT = COMMAND_GROUPS.reduce(
  (sum, group) => sum + group.entries.length,
  0
);
