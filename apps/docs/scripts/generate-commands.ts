/**
 * Writes the command pages from the tool itself.
 *
 * Reads, in this order of authority:
 *  - the built CLI (`apps/cli/bin/motif`): `motif --describe` for each
 *    command's description, synopsis, options and subcommands, the options
 *    every Task verb shares, and whether it has a dry run; and a real
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

import { DEFAULT_TIER, formatCost, TASKS, TIERS } from "@howells/motif-sdk";
import type { RankedModel, TaskDefinition, TaskId } from "@howells/motif-sdk";
import { FAL_TOOLS, MODELS } from "@howells/motif-sdk/registry";
import type { FalToolConfig, ModelConfig } from "@howells/motif-sdk/registry";
import { z } from "zod";

import { here, motif } from "./cli";
import { GROUPS } from "./commands";
import type { CommandSpec, Picture } from "./commands";
import { dryRun } from "./dry-run";

const CLI_BUILD = here("../../cli/dist/index.js");
const OUT = here("../docs/commands");
const IMAGES = here("../public/images/commands");

// ─── The CLI ────────────────────────────────────────────────────────────

const OPTION = z.object({
  description: z.string(),
  flags: z.string(),
  long: z.string(),
});

const COMMAND_LINE = z.object({
  options: z.array(OPTION),
  synopsis: z.string(),
});

const DESCRIBE = z.object({
  commands: z.record(
    z.string(),
    z.object({
      cli: COMMAND_LINE.extend({
        subcommands: z
          .array(
            COMMAND_LINE.extend({ description: z.string(), name: z.string() })
          )
          .optional(),
      }).optional(),
      description: z.string(),
      supports_dry_run: z.boolean().optional(),
    })
  ),
  common_options: z.array(OPTION),
});

type Option = z.infer<typeof OPTION>;
type Described = z.infer<typeof DESCRIBE>;

/** What a command page says about the command line: read from `--describe`. */
interface Facts {
  readonly description: string;
  /** Every option the command takes, common ones included. */
  readonly options: readonly Option[];
  readonly subcommands: readonly { description: string; usage: string }[];
  readonly supportsDryRun: boolean;
  /** One line each: the command, and the subcommands it has. */
  readonly synopsis: readonly string[];
}

function readDescribe(cwd: string, home: string): Described {
  const { code, out } = motif(["--describe", "--format", "json"], cwd, home);
  if (code !== 0) {
    throw new Error(`motif --describe exited ${code}`);
  }
  return DESCRIBE.parse(JSON.parse(out));
}

/** `motif x [options] [y]` as `motif x [y] [options]`, so every synopsis ends
 * the same way. A synopsis with no `[options]` is left as it is. */
function optionsLast(usage: string): string {
  const tokens = usage.split(" ");
  return tokens.includes("[options]")
    ? `${tokens.filter((token) => token !== "[options]").join(" ")} [options]`
    : usage;
}

const withoutOptions = (usage: string): string =>
  usage
    .split(" ")
    .filter((token) => token !== "[options]")
    .join(" ");

/** The facts of one command's page. A command with subcommands leads with
 * the one its spec names. */
function factsFor(spec: CommandSpec, described: Described): Facts {
  const entry = described.commands[spec.id];
  if (entry === undefined) {
    if (spec.undescribed === true) {
      return {
        description: spec.summary ?? "",
        options: [],
        subcommands: [],
        supportsDryRun: false,
        synopsis: [spec.example.args],
      };
    }
    throw new Error(`motif --describe has no command "${spec.id}"`);
  }
  const { cli } = entry;
  if (cli === undefined) {
    throw new Error(`motif --describe gave "${spec.id}" no command line`);
  }
  const subcommands = cli.subcommands ?? [];
  const lead = subcommands.find((sub) => sub.name === spec.leads);
  if (subcommands.length > 0 && lead === undefined) {
    throw new Error(
      `${spec.id} has subcommands, so its spec must name the one that leads (leads: ...)`
    );
  }
  return {
    description: entry.description,
    options: [...(lead?.options ?? []), ...cli.options],
    subcommands: subcommands.map((sub) => ({
      description: sub.description,
      usage: withoutOptions(sub.synopsis),
    })),
    supportsDryRun: entry.supports_dry_run === true,
    synopsis: [
      ...(lead === undefined ? [] : [optionsLast(lead.synopsis)]),
      optionsLast(cli.synopsis),
    ],
  };
}

/** The options a page lists as its own. A command that takes every common
 * option leaves them to the All commands page; any other lists what it takes. */
function ownOptions(
  options: readonly Option[],
  common: readonly Option[]
): readonly Option[] {
  const longs = new Set(options.map((option) => option.long));
  if (!common.every((option) => longs.has(option.long))) {
    return options;
  }
  const shared = new Set(common.map((option) => option.long));
  return options.filter((option) => !shared.has(option.long));
}

// ─── Models and price ───────────────────────────────────────────────────

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
      ? { name: tool.name, perImage: true, price: formatCost(price.usd) }
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
      : { name: model.name, perImage: true, price: formatCost(each) };
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
function whenChosen(entry: RankedModel, flags: readonly Option[]): string {
  const parts = [sentenceCase(entry.tier)];
  if (entry.mode !== undefined) {
    const flag = `--${entry.mode}`;
    const known = flags.some((candidate) => candidate.long === flag);
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
function modelTable(task: TaskId, flags: readonly Option[]): string[] {
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

// ─── Pages ──────────────────────────────────────────────────────────────

const isTask = (id: string): id is TaskId => id in TASKS;

const optionsTable = (options: readonly Option[]): string =>
  [
    "| Flag | What it does |",
    "| --- | --- |",
    ...options.map(
      (entry) =>
        `| ${inline(entry.flags)} | ${escapeText(withStop(entry.description))} |`
    ),
  ].join("\n");

function modelsSection(spec: CommandSpec, facts: Facts): string[] {
  if (isTask(spec.id)) {
    return [
      "## Models and price",
      "",
      ...modelTable(spec.id, facts.options),
      "",
    ];
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

function dryRunSection(spec: CommandSpec, facts: Facts): string[] {
  if (spec.dryRunNote !== undefined) {
    return ["## Dry run", "", spec.dryRunNote, ""];
  }
  if (!facts.supportsDryRun) {
    return [
      "## Dry run",
      "",
      "This command spends nothing, so it has no dry run.",
      "",
    ];
  }
  const hasFields = facts.options.some((entry) => entry.long === "--fields");
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

/** The Options section: the options this command takes beyond the common ones,
 * and a pointer to those. */
function optionsSection(
  spec: CommandSpec,
  facts: Facts,
  own: readonly Option[],
  takesCommon: boolean
): string[] {
  const common = "[common options](/commands#common-options)";
  if (own.length === 0) {
    return takesCommon
      ? ["## Options", "", `It takes only the ${common}.`, ""]
      : [];
  }
  return [
    "## Options",
    "",
    ...(facts.subcommands.length === 0
      ? []
      : [`These are the options for \`${spec.id} ${spec.leads}\`.`, ""]),
    optionsTable(own),
    "",
    ...(takesCommon ? [`It also takes the ${common}.`, ""] : []),
  ];
}

function commandPage(
  spec: CommandSpec,
  facts: Facts,
  common: readonly Option[]
): string {
  const own = ownOptions(facts.options, common);
  const takesCommon = own.length < facts.options.length;
  const lines: string[] = [
    "---",
    `title: ${JSON.stringify(spec.headline)}`,
    `description: ${JSON.stringify(withStop(spec.lede ?? spec.summary ?? facts.description))}`,
    "sidebar:",
    `  label: ${spec.id}`,
    "---",
    "",
    "{/* Generated by scripts/generate-commands.ts. Do not edit. */}",
    "",
    "## Synopsis",
    "",
    fence(facts.synopsis.join("\n")),
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
    ...(facts.subcommands.length === 0
      ? []
      : [
          "## Subcommands",
          "",
          "`series run` makes a themed set in one go. The other subcommands keep a named style, with reference images and its own history, so later images match it.",
          "",
          [
            "| Subcommand | What it does |",
            "| --- | --- |",
            ...facts.subcommands.map(
              (row) =>
                `| ${inline(row.usage)} | ${escapeText(withStop(row.description))} |`
            ),
          ].join("\n"),
          "",
        ]),
    ...optionsSection(spec, facts, own, takesCommon),
    ...modelsSection(spec, facts),
    ...dryRunSection(spec, facts),
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}

function indexPage(described: Described): string {
  const sections = GROUPS.flatMap((group) => [
    `## ${group.name}`,
    "",
    '<table class="docs-commands">',
    '  <thead class="docs-sr"><tr><th>Command</th><th>What it does</th></tr></thead>',
    "  <tbody>",
    ...group.commands.map(
      (spec) =>
        `    <tr><td><a href="/commands/${spec.id}"><code>${spec.id}</code></a></td><td>${spec.summary ?? factsFor(spec, described).description}</td></tr>`
    ),
    "  </tbody>",
    "</table>",
    "",
  ]);
  return [
    "---",
    "title: Commands",
    'description: "Every command, grouped by what it does, and the options they share."',
    "sidebar:",
    "  label: All commands",
    "---",
    "",
    "{/* Generated by scripts/generate-commands.ts. Do not edit. */}",
    "",
    ...sections,
    "## Common options",
    "",
    "The commands that make or change an image take these, alongside their own. Any other command lists the options it takes.",
    "",
    optionsTable(described.common_options),
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
    const described = readDescribe(scratch, scratch);

    rmSync(OUT, { force: true, recursive: true });
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      join(OUT, "meta.ts"),
      meta("Commands", ["index", ...GROUPS.map((group) => group.folder)])
    );
    writeFileSync(join(OUT, "index.mdx"), indexPage(described));

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
        writeFileSync(
          join(folder, `${spec.id}.mdx`),
          commandPage(spec, factsFor(spec, described), described.common_options)
        );
      }
    }
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }
}

main();
