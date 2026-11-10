import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { TASK_IDS, TASKS } from "@howells/motif-sdk";
import { FAL_TOOLS, MODELS } from "@howells/motif-sdk/registry";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

// The docs site's own command groups: the list it generates a page for each
// of. Only this test reads it, to check the homepage's links against the
// pages the docs really generate; the bench app itself never imports it.
// oxlint-disable-next-line howells/no-cross-workspace-app-imports -- test-only read of the docs site's page list, the source of truth for which docs pages exist
import { GROUPS } from "../../../../docs/scripts/commands";
import { HOME } from "./content";
import { placeholderOf } from "./placeholders";
import type { Command, ImageRef } from "./types";

type Node = Readonly<Record<string, unknown>>;

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every object in the content module, wherever it sits: hero, chapters,
 * entries, figures or close. Walking the whole module means a chapter added
 * later is covered without touching this file. */
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => nodes(item));
  }
  if (!isNode(value)) {
    return [];
  }
  return [value, ...Object.values(value).flatMap((item) => nodes(item))];
}

function isCommand(node: Node): node is Node & Command {
  return typeof node.text === "string" && typeof node.docs === "string";
}

function isImage(node: Node): node is Node & ImageRef {
  return (
    typeof node.src === "string" &&
    typeof node.alt === "string" &&
    typeof node.width === "number" &&
    typeof node.height === "number"
  );
}

function isLink(node: Node): node is Node & { readonly href: string } {
  return typeof node.href === "string";
}

const commands = nodes(HOME).filter((node) => isCommand(node));

const links = [
  ...commands.map((command) => command.docs),
  ...nodes(HOME)
    .filter((node) => isLink(node))
    .map((link) => link.href)
    .filter((href) => href.startsWith("/docs")),
];

const images = nodes(HOME).filter((node) => isImage(node));

const PUBLIC = path.resolve(import.meta.dirname, "../../../public");

const DOCS_SOURCE = path.resolve(import.meta.dirname, "../../../../docs/docs");

/** The docs pages written by hand, as the site serves them: `.mdx` files
 * under `docs/`, with route-group folders such as `(getting-started)` left
 * out of the address. */
function writtenPages(): Set<string> {
  return new Set(
    readdirSync(DOCS_SOURCE, { recursive: true, encoding: "utf-8" })
      .filter((file) => file.endsWith(".mdx"))
      .map((file) =>
        file
          .replace(/\.mdx$/, "")
          .split(path.sep)
          .filter((part) => !(part.startsWith("(") && part.endsWith(")")))
          .join("/")
      )
  );
}

/** Every address the docs site serves under `/docs`: its front page, the
 * pages written by hand, and the Commands index and one page per command,
 * which it generates from `GROUPS`. */
function docsPages(): Set<string> {
  const commandPages = GROUPS.flatMap((group) =>
    group.commands.map((spec) => `/docs/commands/${spec.id}`)
  );
  return new Set([
    "/docs",
    "/docs/commands",
    ...commandPages,
    ...[...writtenPages()].map((page) => `/docs/${page}`),
  ]);
}

/** Keys whose values are addresses, not words a reader sees: docs pages
 * and links. Image and film addresses are not among them, because Next
 * serves every file under its own name, so a file name is as public as the
 * copy. */
const ADDRESS_KEYS = new Set(["docs", "href"]);

/** Every word the page sets (copy, captions, alt text, commands, labels) and
 * every file address it serves. */
function words(value: unknown, key = ""): string[] {
  if (typeof value === "string") {
    return ADDRESS_KEYS.has(key) ? [] : [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => words(item));
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([name, item]) => words(item, name));
}

/** Every Model the SDK ranks for any Task, by id, by display name and by
 * the provider that serves it: the first part of its endpoint, or the part
 * after `fal-ai/` for one fal hosts. fal itself is a provider too. */
function modelNames(): string[] {
  const configs = new Map<string, { endpoint: string; name: string }>([
    ...Object.entries(MODELS),
    ...Object.entries(FAL_TOOLS),
  ]);
  const ranked = new Set(
    Object.values(TASKS).flatMap((task) => task.models.map((m) => m.model))
  );
  const names = [...ranked].flatMap((id) => {
    const config = configs.get(id);
    if (config === undefined) {
      throw new Error(`Ranked Model ${id} is in neither registry`);
    }
    const [owner = "", hosted = ""] = config.endpoint.split("/");
    return [id, config.name, owner === "fal-ai" ? hosted : owner];
  });
  return [...new Set(["fal", "fal-ai", ...names])];
}

/** A whole-word, case-insensitive match, so `gpt` does not match inside an
 * ordinary word and `mai-image-2.5` matches only itself. */
function mentions(text: string, name: string): boolean {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "i").test(text);
}

/** The CLI commands the page shows that are not Tasks: the install line, the
 * Series Run, the contact sheet, and the generate Task's own flags. */
const NON_TASK = new Set(["install", "series", "sheet"]);

/** What a command line names, read from its text alone: the second word, or
 * `generate` when the line opens on a quoted prompt or a flag. */
function named(text: string): string {
  if (text.startsWith("npm install -g @howells/motif-cli")) {
    return "install";
  }
  // A flag shown on its own (`--look editorial`) belongs to generate.
  if (text.startsWith("--")) {
    return "generate";
  }
  const [program, word = ""] = text.split(" ");
  if (program !== "motif") {
    return `not a motif command: ${text}`;
  }
  if (word.startsWith('"') || word.startsWith("-")) {
    return "generate";
  }
  return word;
}

/** Flags shown on their own, which have no command page, and the docs page
 * that documents each. `--look` and `--mood` go to the page that lists every
 * Look and Mood. */
const FLAG_PAGES = new Map([
  ["--dry-run", "/docs/quickstart"],
  ["--look editorial", "/docs/looks-and-moods"],
  ["--mood lamplit", "/docs/looks-and-moods"],
]);

describe("the homepage content", () => {
  it("runs the chapters in the order the design sets them", () => {
    // Read as plain data: the module's own types are out of this file's reach.
    const home: unknown = HOME;
    expect(home).toMatchObject({
      chapters: [
        { id: "make" },
        { id: "edit" },
        { id: "read-and-convert" },
        { id: "looks-and-moods" },
        { id: "price" },
      ],
    });
  });

  it("shows at least the install line and the hero's command", () => {
    expect(commands.length).toBeGreaterThanOrEqual(2);
  });

  it("names a real Task, or a known CLI command, in every command", () => {
    const tasks = new Set<string>(TASK_IDS);
    const unknown = commands
      .map((command) => named(command.text))
      .filter((name) => !tasks.has(name) && !NON_TASK.has(name));
    expect(unknown).toStrictEqual([]);
  });

  it("links every command to the docs page of the command it names", () => {
    const wrong = commands.filter((command) => {
      const name = named(command.text);
      const page = FLAG_PAGES.get(command.text) ?? `/docs/commands/${name}`;
      return name !== "install" && command.docs !== page;
    });
    expect(wrong).toStrictEqual([]);
  });

  it("never names a Model or its provider, in words or file names", () => {
    const copy = words(HOME);
    const names = modelNames();
    const found = copy.flatMap((text) =>
      names
        .filter((name) => mentions(text, name))
        .map((name) => `${name} in "${text}"`)
    );
    expect(found).toStrictEqual([]);
  });

  it("uses only images that exist, at the size it declares", async () => {
    expect(images.length).toBeGreaterThanOrEqual(1);
    const wrong: string[] = [];
    for (const image of images) {
      const file = path.join(PUBLIC, image.src);
      if (existsSync(file)) {
        const { height, width } = await sharp(file).metadata();
        if (width !== image.width || height !== image.height) {
          wrong.push(
            `${image.src} is ${width}x${height}, declared ${image.width}x${image.height}`
          );
        }
      } else {
        wrong.push(`${image.src} is missing`);
      }
    }
    expect(wrong).toStrictEqual([]);
  });

  // Decoding every picture to read its alpha takes seconds on a quiet machine
  // and longer beside the other packages' tests, so it gets a longer timeout
  // than vitest's five seconds.
  it(
    "has a placeholder for every opaque image, and none for a cut-out",
    { timeout: 60_000 },
    async () => {
      const found = await Promise.all(
        images.map(async (image) => {
          const { isOpaque } = await sharp(
            path.join(PUBLIC, image.src)
          ).stats();
          const has = placeholderOf(image.src) !== undefined;
          if (isOpaque && !has) {
            return [`${image.src} has no placeholder: run pnpm placeholders`];
          }
          if (!isOpaque && has) {
            return [`${image.src} is a cut-out with a placeholder`];
          }
          return [];
        })
      );
      const wrong = found.flat();
      expect(wrong).toStrictEqual([]);
    }
  );

  it("describes every image in its alt text", () => {
    expect(images.filter((image) => image.alt.trim() === "")).toStrictEqual([]);
  });

  it("links only to pages the docs site serves", () => {
    const pages = docsPages();
    expect(links.filter((href) => !pages.has(href))).toStrictEqual([]);
  });
});
