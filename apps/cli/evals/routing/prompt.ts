/**
 * What the routing eval shows the model: the cases, and the surfaces Motif
 * ships, read from the repo and the built CLI at run time.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import type { RoutingCase } from "./grade.ts";

export const EVAL_DIR = import.meta.dirname;
export const REPO_ROOT = join(import.meta.dirname, "../../../..");
const CLI_ENTRY = join(REPO_ROOT, "apps/cli/dist/index.js");
const CLI_GUIDE = "apps/cli/AGENTS.md";
/** A markdown link to a `.md` target, capturing the path without its anchor. */
const MARKDOWN_LINK = /\]\(([^)\s#]+\.md)(?:#[^)\s]*)?\)/g;
const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i;

/** One document the model is given, labelled by path or command. */
export interface Surface {
  readonly label: string;
  readonly text: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isFlagList(value: unknown): value is (string | string[])[] {
  return (
    Array.isArray(value) &&
    value.every((flag) => typeof flag === "string" || isStringList(flag))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function parseCase(line: string, lineNumber: number): RoutingCase {
  const problem = (text: string) =>
    new Error(`cases.jsonl line ${lineNumber}: ${text}`);
  const value: unknown = JSON.parse(line);
  if (!isRecord(value)) {
    throw problem("not a JSON object");
  }
  const { id, request, command, flags, args, source } = value;
  if (
    !(isNonEmptyString(id) && isNonEmptyString(request)) ||
    !isNonEmptyString(source)
  ) {
    throw problem("id, request and source must be non-empty strings");
  }
  if (
    !isNonEmptyString(command) &&
    !(isStringList(command) && command.length > 0)
  ) {
    throw problem("command must be a string or a non-empty list of strings");
  }
  if (flags !== undefined && !isFlagList(flags)) {
    throw problem("flags must be a list of strings or lists of alternatives");
  }
  if (args !== undefined && !isStringList(args)) {
    throw problem("args must be a list of strings");
  }
  return { id, request, command, flags, args, source };
}

/** Every case in `cases.jsonl`, failing on a malformed line or a repeated id. */
export function loadCases(): RoutingCase[] {
  const lines = readFileSync(join(EVAL_DIR, "cases.jsonl"), "utf-8").split(
    "\n"
  );
  const cases: RoutingCase[] = [];
  const seen = new Set<string>();
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") {
      continue;
    }
    const testCase = parseCase(line, index + 1);
    if (seen.has(testCase.id)) {
      throw new Error(
        `cases.jsonl line ${index + 1}: repeated id ${testCase.id}`
      );
    }
    seen.add(testCase.id);
    cases.push(testCase);
  }
  return cases;
}

function repoFile(path: string): Surface {
  return { label: path, text: readFileSync(join(REPO_ROOT, path), "utf-8") };
}

/** Output of the built CLI, without colour codes. */
export function runCli(args: readonly string[]): Surface {
  if (!existsSync(CLI_ENTRY)) {
    throw new Error(`${CLI_ENTRY} is missing. Run pnpm build first.`);
  }
  const output = execFileSync(process.execPath, [CLI_ENTRY, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  });
  return {
    label: `motif ${args.join(" ")}`,
    text: stripVTControlCharacters(output),
  };
}

/** Command key to usage, from the built CLI's `--describe tasks`. */
export function shippedCommands(): Map<string, string> {
  const tasks: unknown = JSON.parse(
    runCli(["--describe", "tasks", "--format", "json"]).text
  );
  const commands = isRecord(tasks) ? tasks.commands : undefined;
  if (!isRecord(commands)) {
    throw new Error("motif --describe tasks has no commands object");
  }
  const usages = new Map<string, string>();
  for (const [command, row] of Object.entries(commands)) {
    const usage = isRecord(row) ? row.usage : undefined;
    if (typeof usage !== "string") {
      throw new TypeError(`motif --describe tasks: ${command} has no usage`);
    }
    usages.set(command, usage);
  }
  return usages;
}

/**
 * Repo paths of the relative `.md` pages a guide links to, resolved against
 * the guide's directory, in first-linked order.
 */
export function linkedPages(guidePath: string, guide: string): string[] {
  const pages = [...guide.matchAll(MARKDOWN_LINK)]
    .map((match) => match[1] ?? "")
    .filter((target) => !(URL_SCHEME.test(target) || target.startsWith("/")))
    .map((target) => join(dirname(guidePath), target));
  return [...new Set(pages)];
}

/** Everything Motif ships to an agent, in the order an agent would meet it. */
export function loadSurfaces(): Surface[] {
  const guide = readFileSync(join(REPO_ROOT, CLI_GUIDE), "utf-8");
  const paths = new Set([
    "AGENTS.md",
    CLI_GUIDE,
    ...linkedPages(CLI_GUIDE, guide),
    "llms.txt",
  ]);
  return [
    ...[...paths].map(repoFile),
    runCli(["--help"]),
    runCli(["--describe", "tasks", "--format", "json"]),
  ];
}

/** The shared system prompt. Identical for every call, so it caches. */
export function buildSystemPrompt(surfaces: readonly Surface[]): string {
  return [
    "You are a coding agent working in a user's project. The motif command-line tool is installed and FAL_KEY is set. Everything you know about motif is in the documents below, which are exactly what Motif ships.",
    ...surfaces.map(
      (surface) =>
        `<document source="${surface.label}">\n${surface.text.trim()}\n</document>`
    ),
  ].join("\n\n");
}

export function buildUserPrompt(request: string): string {
  return [
    `<request>${request}</request>`,
    "Reply with the single motif command you would run first to do this, in one ```sh code block, and nothing else. Adding --dry-run is fine. Answer from the documents: don't reach for --help or --describe unless the request is itself a question about motif.",
  ].join("\n\n");
}

/**
 * Rough token count at 2.6 characters a token, the ratio claude-sonnet-5
 * measured on this eval's system prompt.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.6);
}
