/**
 * Writes the command pages from the tool itself.
 *
 * Reads, in this order of authority:
 *  - the built CLI (`apps/cli/bin/motif`): `--help` for the synopsis and
 *    options, `--describe` for the one-line description, and a real
 *    `--dry-run` for the dry-run example. Dry runs need no key and no network.
 *  - the SDK's Task table and registries: which Models a command ranks, what
 *    each is called, and what it costs per image where the registry says.
 *
 * and writes `docs/commands/**` (pages and sidebar metadata). That folder is
 * build output: it is git-ignored and rebuilt by `pnpm dev` and `pnpm build`.
 * Fails loudly when the CLI is not built or a command stops matching its
 * table, so a page can never go out describing something the tool no longer
 * does.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_TIER, TASKS, TIERS } from "@howells/motif-sdk";
import type { RankedModel, TaskDefinition, TaskId } from "@howells/motif-sdk";
import { z } from "zod";

// The registries behind a Model's display name and price are not part of the
// SDK's public index, so they are read from source, as `@motif/bench-core`
// does for the same reason.
import { MODELS } from "../../../packages/motif-sdk/src/models";
import type { FalToolConfig } from "../../../packages/motif-sdk/src/tool-types";
import { FAL_TOOLS } from "../../../packages/motif-sdk/src/tools";
import type { ModelConfig } from "../../../packages/motif-sdk/src/types";
import { here, motif } from "./cli";
import { GROUPS } from "./commands";
import type { CommandSpec, GroupSpec, Picture } from "./commands";
import { dryRun } from "./dry-run";

const CLI_BUILD = here("../../cli/dist/index.js");
const OUT = here("../docs/commands");
const IMAGES = here("../public/images/commands");

// ─── The CLI ────────────────────────────────────────────────────────────

interface Flag {
  readonly description: string;
  readonly flag: string;
}

interface Help {
  readonly flags: readonly Flag[];
  /** Subcommands, for the one command that has them. */
  readonly subcommands?: readonly Flag[];
  readonly synopsis: string;
}

const FLAG_LINE = /^ {2}(-\S.*?) {2,}(\S.*)$/u;
const CONTINUATION = /^ {10,}(\S.*)$/u;

/** The Options block of a `--help` text, with wrapped descriptions rejoined. */
function parseFlags(help: string): Flag[] {
  const flags: { description: string; flag: string }[] = [];
  let inOptions = false;
  for (const line of help.split("\n")) {
    if (line === "Options:") {
      inOptions = true;
    } else if (inOptions && line.trim() === "") {
      inOptions = false;
    } else if (inOptions) {
      const match = FLAG_LINE.exec(line);
      const more = CONTINUATION.exec(line);
      const last = flags.at(-1);
      if (match?.[1] !== undefined && match[2] !== undefined) {
        flags.push({ description: match[2], flag: match[1] });
      } else if (more?.[1] !== undefined && last !== undefined) {
        last.description = `${last.description} ${more[1]}`;
      }
    }
  }
  return flags.filter((entry) => !entry.flag.endsWith("--help"));
}

/** `motif x [options] [y]` as `motif x [y] [options]`, so every synopsis ends
 * the same way. */
function parseSynopsis(help: string): string {
  const usage = help.split("\n").find((line) => line.startsWith("Usage: "));
  if (usage === undefined) {
    throw new Error("a --help text had no Usage line");
  }
  const tokens = usage
    .replace("Usage: ", "")
    .split(" ")
    .filter((token) => token !== "[options]");
  return `${tokens.join(" ")} [options]`;
}

function readHelp(args: readonly string[], cwd: string, home: string): Help {
  const { code, out } = motif([...args, "--help"], cwd, home);
  if (code !== 0) {
    throw new Error(`motif ${args.join(" ")} --help exited ${code}`);
  }
  return { flags: parseFlags(out), synopsis: parseSynopsis(out) };
}

/** The flags that are not the command's own: they appear on every command and
 * are listed once, on the All commands page. */
const COMMON = new Set([
  "--fields",
  "--format",
  "--no-open",
  "--param",
  "--seed",
  "-m, --model",
  "-o, --output",
]);

/** The flag name without its argument: `--mask <path>` is `--mask`. */
const flagKey = (flag: string): string =>
  flag.split(/ <| \[/u)[0]?.trim() ?? flag;

const isCommon = (entry: Flag): boolean => COMMON.has(flagKey(entry.flag));

/** Flags that belong to other commands but appear in the bare `motif` help,
 * which is where generate, last and history live. */
const NOT_GENERATE = new Set([
  "--describe",
  "--history",
  "--last",
  "--limit",
  "--offset",
  "--version",
  "-V, --version",
]);

// ─── Models and price ───────────────────────────────────────────────────

const usd = (value: number): string => {
  const fixed = value.toFixed(3);
  return `$${fixed.endsWith("0") ? fixed.slice(0, -1) : fixed}`;
};

interface ModelFacts {
  readonly name: string;
  readonly price: string;
  /** The price is a flat figure per image, not a rate with a unit. */
  readonly perImage: boolean;
}

const TOOLS = new Map<string, FalToolConfig>(Object.entries(FAL_TOOLS));
const GENERATION = new Map<string, ModelConfig>(Object.entries(MODELS));

/** The first clause of a registry's price note, which carries the unit:
 * `$0.025/megapixel`, `$0.11/sec`. */
const rate = (note: string): string =>
  note.split(/[;,]| plus /u)[0]?.trim() ?? note;

/** The display name and price of a Model id. Never the id itself: a Model id
 * is an alias the registry keys on, not something a reader knows. A flat
 * figure is per image; anything else shows the registry's own rate. */
function modelFacts(id: string): ModelFacts {
  const tool = TOOLS.get(id);
  if (tool !== undefined) {
    const price = tool.price;
    const flat =
      price.kind === "call" &&
      price.per === undefined &&
      price.fee === undefined &&
      price.extras === undefined &&
      price.multipliers === undefined;
    return flat
      ? { name: tool.name, perImage: true, price: usd(price.usd) }
      : { name: tool.name, perImage: false, price: rate(tool.pricing) };
  }
  const model = GENERATION.get(id);
  if (model !== undefined) {
    const each = model.pricePerImageUsd;
    if (each === null) {
      return { name: model.name, perImage: false, price: "Billed by use" };
    }
    return each === undefined
      ? { name: model.name, perImage: false, price: rate(model.pricing) }
      : { name: model.name, perImage: true, price: usd(each) };
  }
  throw new Error(`Model "${id}" is in a Task ranking but in no registry`);
}

const CAPABILITY_PHRASE = new Map<string, string>([
  ["mask", "when you pass a mask"],
  ["references", "when you pass a reference"],
  ["transparency", "for transparent output"],
]);

const sentenceCase = (text: string): string =>
  `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;

/** When a ranked entry is chosen, in the words a reader would use. */
function whenChosen(entry: RankedModel, flags: readonly Flag[]): string {
  const parts = [sentenceCase(entry.tier)];
  if (entry.mode !== undefined) {
    const flag = `--${entry.mode}`;
    const known = flags.some((candidate) => flagKey(candidate.flag) === flag);
    parts.push(known ? `with \`${flag}\`` : `in ${entry.mode} mode`);
  }
  for (const need of entry.requires ?? []) {
    parts.push(CAPABILITY_PHRASE.get(need) ?? `needs ${need}`);
  }
  return parts.join(", ");
}

const tierOrder = [
  DEFAULT_TIER,
  ...TIERS.filter((tier) => tier !== DEFAULT_TIER),
];

/** The Models a Task ranks, as display names with a price, plus the sentence
 * that introduces them. */
function modelTable(task: TaskId, flags: readonly Flag[]): string[] {
  const definition: TaskDefinition = TASKS[task];
  const ranked = definition.models.toSorted(
    (left, right) =>
      tierOrder.indexOf(left.tier) - tierOrder.indexOf(right.tier)
  );
  const facts = ranked.map((entry) => ({
    entry,
    facts: modelFacts(entry.model),
  }));
  const rows = facts.map(
    ({ entry, facts: each }) =>
      `| ${each.name} | ${whenChosen(entry, flags)} | ${each.price} |`
  );
  const allPerImage = facts.every(({ facts: each }) => each.perImage);
  return [
    allPerImage
      ? "Motif picks the Model for the Tier. Prices are per image."
      : "Motif picks the Model for the Tier. Prices are per image where a Model has one; any other shows how it is billed. A rate that depends on the size of the file or the length of the clip is a rate, not a total, so check it with a dry run.",
    "",
    "| Model | Chosen at | Price |",
    "| --- | --- | ---: |",
    ...rows,
  ];
}

// ─── Text ───────────────────────────────────────────────────────────────

/** Make a CLI string safe in MDX and in a table cell. */
const escapeText = (text: string): string =>
  text
    .replaceAll("\\", "\\\\")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replaceAll("<", "&lt;")
    .replaceAll("|", "\\|");

const withStop = (text: string): string =>
  /[.!?]$/u.test(text) ? text : `${text}.`;

const fence = (body: string, lang = "sh"): string =>
  `\`\`\`${lang}\n${body}\n\`\`\``;

const inline = (code: string): string => `\`${code.replaceAll("`", "")}\``;

// ─── Pictures ───────────────────────────────────────────────────────────

function pictures(items: readonly Picture[]): string {
  const ratio = items.find((item) => item.ratio !== undefined)?.ratio;
  const style =
    ratio === undefined
      ? ""
      : ` style={{ aspectRatio: "${ratio}", objectFit: "cover" }}`;
  const figures = items.map((item) => {
    if (!existsSync(join(IMAGES, item.file))) {
      throw new Error(`Missing picture public/images/commands/${item.file}`);
    }
    return [
      "  <figure>",
      `    <img src="/images/commands/${item.file}" alt="${item.alt}" loading="lazy"${style} />`,
      `    <figcaption>${item.caption}</figcaption>`,
      "  </figure>",
    ].join("\n");
  });
  return [
    `<div class="docs-pictures docs-pictures-${items.length}">`,
    ...figures,
    "</div>",
  ].join("\n");
}

// ─── Commands that are not a single verb ───────────────────────────────

/** `last`, `history`, `describe` and `studio` are not verbs with a help text of
 * their own: they are flags on the bare `motif`, or the Studio. Their options
 * are picked from the bare help by name, so the words stay the CLI's. */
const BARE = {
  describe: {
    flags: ["--describe", "--format", "--fields"],
    synopsis: "motif --describe [command]",
  },
  history: {
    flags: ["--history", "--limit", "--offset", "--format", "--fields"],
    synopsis: "motif --history [options]",
  },
  last: { flags: ["--last", "--format", "--fields"], synopsis: "motif --last" },
  studio: { flags: [], synopsis: "motif studio" },
} as const;

const isBare = (id: string): id is keyof typeof BARE => id in BARE;

function bareHelp(id: keyof typeof BARE, root: Help): Help {
  const wanted = new Set<string>(BARE[id].flags);
  return {
    flags: root.flags.filter((entry) => wanted.has(flagKey(entry.flag))),
    synopsis: BARE[id].synopsis,
  };
}

// ─── Series subcommands ─────────────────────────────────────────────────

const SUBCOMMAND_LINE = /^ {2}(\S.*?) {2,}(\S.*)$/u;

/** The Commands block of `motif series --help`: one row for each subcommand. */
function seriesSubcommands(cwd: string, home: string): Flag[] {
  const { code, out } = motif(["series", "--help"], cwd, home);
  if (code !== 0) {
    throw new Error(`motif series --help exited ${code}`);
  }
  const rows: { description: string; flag: string }[] = [];
  let inCommands = false;
  for (const line of out.split("\n")) {
    if (line === "Commands:") {
      inCommands = true;
    } else if (inCommands && line.trim() === "") {
      inCommands = false;
    } else if (inCommands) {
      const match = SUBCOMMAND_LINE.exec(line);
      const more = CONTINUATION.exec(line);
      const last = rows.at(-1);
      if (match?.[1] !== undefined && match[2] !== undefined) {
        const tokens = match[1]
          .split(" ")
          .filter((token) => token !== "[options]");
        rows.push({
          description: match[2],
          flag: `motif series ${tokens.join(" ")}`,
        });
      } else if (more?.[1] !== undefined && last !== undefined) {
        last.description = `${last.description} ${more[1]}`;
      }
    }
  }
  return rows.filter((row) => !row.flag.includes(" help"));
}

// ─── Pages ──────────────────────────────────────────────────────────────

const isTask = (id: string): id is TaskId => id in TASKS;

const optionsTable = (flags: readonly Flag[]): string =>
  [
    "| Flag | What it does |",
    "| --- | --- |",
    ...flags.map(
      (entry) =>
        `| ${inline(entry.flag)} | ${escapeText(withStop(entry.description))} |`
    ),
  ].join("\n");

interface Described {
  readonly description: string;
  readonly supportsDryRun: boolean;
}

const DESCRIBE = z.object({
  commands: z.record(
    z.string(),
    z.object({
      description: z.string().optional(),
      supports_dry_run: z.boolean().optional(),
    })
  ),
});

function describeAll(cwd: string, home: string): Map<string, Described> {
  const { code, out } = motif(["--describe", "--format", "json"], cwd, home);
  if (code !== 0) {
    throw new Error(`motif --describe exited ${code}`);
  }
  const parsed = DESCRIBE.parse(JSON.parse(out));
  return new Map(
    Object.entries(parsed.commands).map(([id, entry]) => [
      id,
      {
        description: entry.description ?? "",
        supportsDryRun: entry.supports_dry_run === true,
      },
    ])
  );
}

function modelsSection(spec: CommandSpec, help: Help): string[] {
  if (isTask(spec.id)) {
    return ["## Models and price", "", ...modelTable(spec.id, help.flags), ""];
  }
  if (spec.id === "series") {
    return [
      "## Models and price",
      "",
      "`series run` uses the same Models as [generate](/commands/generate#models-and-price), so it costs what they cost, once for each image in the set.",
      "",
    ];
  }
  if (spec.id === "sheet") {
    return [
      "## Models and price",
      "",
      "No Model runs. The sheet is laid out on your machine from images you already have, so it costs nothing.",
      "",
    ];
  }
  return [];
}

function dryRunSection(
  spec: CommandSpec,
  help: Help,
  described: Described | undefined
): string[] {
  const dryRunnable =
    help.flags.some((entry) => flagKey(entry.flag) === "--dry-run") ||
    described?.supportsDryRun === true;
  if (!dryRunnable) {
    return [
      "## Dry run",
      "",
      "This command spends nothing, so it has no dry run.",
      "",
    ];
  }
  const hasFields = help.flags.some(
    (entry) => flagKey(entry.flag) === "--fields"
  );
  const { command, output } = dryRun(spec, spec.example, hasFields);
  return [
    "## Dry run",
    "",
    "Check the cost before you spend. The output path is where the file would go.",
    "",
    fence(command),
    "",
    fence(output, "json"),
    "",
  ];
}

function commandPage(
  spec: CommandSpec,
  group: GroupSpec,
  help: Help,
  described: Described | undefined
): string {
  const own = help.flags.filter((entry) => !isCommon(entry));
  const subcommands = help.subcommands ?? [];
  const lines: string[] = [
    "---",
    `title: ${spec.id}`,
    `description: ${JSON.stringify(withStop(spec.lede ?? spec.summary))}`,
    "sidebar:",
    `  label: ${spec.id}`,
    "---",
    "",
    "{/* Generated by scripts/generate-commands.ts. Do not edit. */}",
    "",
    ...(spec.inApp ? ['<p class="docs-in-app">In the App</p>', ""] : []),
    "## Synopsis",
    "",
    fence(help.synopsis),
    "",
    "## Example",
    "",
    spec.example.note,
    "",
    fence(spec.example.args),
    "",
    ...(spec.example.output === undefined
      ? []
      : [fence(spec.example.output, "text"), ""]),
    ...(spec.example.pictures === undefined
      ? []
      : [pictures(spec.example.pictures), ""]),
    ...(subcommands.length === 0
      ? []
      : [
          "## Subcommands",
          "",
          "`series run` makes a themed set in one go. The other subcommands keep a named style, with reference images and its own history, so later images match it.",
          "",
          [
            "| Subcommand | What it does |",
            "| --- | --- |",
            ...subcommands.map(
              (row) =>
                `| ${inline(row.flag)} | ${escapeText(withStop(row.description))} |`
            ),
          ].join("\n"),
          "",
        ]),
    ...(own.length === 0
      ? []
      : [
          "## Options",
          "",
          ...(subcommands.length === 0
            ? []
            : ["These are the options for `series run`.", ""]),
          optionsTable(own),
          "",
          "It also takes the [common options](/commands#common-options).",
          "",
        ]),
    ...modelsSection(spec, help),
    ...dryRunSection(spec, help, described),
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}

function indexPage(commonFlags: readonly Flag[]): string {
  const sections = GROUPS.flatMap((group) => [
    `## ${group.name}`,
    "",
    '<table class="docs-commands">',
    '  <thead class="docs-sr"><tr><th>Command</th><th>What it does</th><th>Where</th></tr></thead>',
    "  <tbody>",
    ...group.commands.map(
      (spec) =>
        `    <tr><td><a href="/commands/${spec.id}"><code>${spec.id}</code></a></td><td>${spec.summary}</td><td>${spec.inApp ? '<span class="docs-in-app">In the App</span>' : ""}</td></tr>`
    ),
    "  </tbody>",
    "</table>",
    "",
  ]);
  return [
    "---",
    "title: Commands",
    'description: "Every command runs in your terminal. Those marked In the App run there too."',
    "sidebar:",
    "  label: All commands",
    "---",
    "",
    "{/* Generated by scripts/generate-commands.ts. Do not edit. */}",
    "",
    ...sections,
    "## Common options",
    "",
    "Every command takes these, alongside its own.",
    "",
    optionsTable(commonFlags),
    "",
  ].join("\n");
}

const meta = (title: string, pages: readonly string[]): string =>
  [
    'import { defineMeta } from "blume";',
    "",
    "export default defineMeta({",
    `  pages: ${JSON.stringify(pages)},`,
    `  title: ${JSON.stringify(title)},`,
    "});",
    "",
  ].join("\n");

// ─── Run ────────────────────────────────────────────────────────────────

function main(): void {
  if (!existsSync(CLI_BUILD)) {
    throw new Error(
      "The CLI is not built. Run `pnpm --filter @howells/motif-cli build` first; turbo does this before `@motif/docs` builds."
    );
  }
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "motif-docs-home-")));
  try {
    const described = describeAll(scratch, scratch);
    const root = readHelp([], scratch, scratch);
    const rootOwn = root.flags.filter(
      (entry) =>
        !NOT_GENERATE.has(entry.flag) && !NOT_GENERATE.has(flagKey(entry.flag))
    );

    rmSync(OUT, { force: true, recursive: true });
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      join(OUT, "meta.ts"),
      meta("Commands", ["index", ...GROUPS.map((group) => group.folder)])
    );

    // The common options, from a Task verb's own help, so the words are the verbs'.
    const sample = readHelp(["erase"], scratch, scratch);
    writeFileSync(
      join(OUT, "index.mdx"),
      indexPage(sample.flags.filter(isCommon))
    );

    for (const group of GROUPS) {
      const folder = join(OUT, `(${group.folder})`);
      mkdirSync(folder, { recursive: true });
      writeFileSync(
        join(folder, "meta.ts"),
        meta(
          group.name,
          group.commands.map((spec) => spec.id)
        )
      );
      for (const spec of group.commands) {
        let help: Help;
        if (spec.id === "generate") {
          help = {
            flags: rootOwn,
            synopsis: "motif [prompt] [options]",
          };
        } else if (isBare(spec.id)) {
          help = bareHelp(spec.id, root);
        } else if (spec.id === "series") {
          const run = readHelp(["series", "run"], scratch, scratch);
          help = {
            flags: run.flags,
            subcommands: seriesSubcommands(scratch, scratch),
            synopsis: `${run.synopsis}\nmotif series <subcommand> [options]`,
          };
        } else {
          help = readHelp([spec.id], scratch, scratch);
        }
        writeFileSync(
          join(folder, `${spec.id}.mdx`),
          commandPage(spec, group, help, described.get(spec.id))
        );
      }
    }
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }
}

main();
