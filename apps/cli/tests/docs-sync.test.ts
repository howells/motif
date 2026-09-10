import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CREATIVE_FIELDS,
  CREATIVE_TAXONOMY,
  GENERATION_MODELS,
} from "@howells/motif-sdk";
import { describe, expect, it } from "vitest";

import { COMMAND_TASKS } from "../src/commands/verbs/tasks";
import { ERROR_CATALOG } from "../src/utils/error-catalog";

const testDir = import.meta.dirname;
const repoRoot = resolve(testDir, "../../..");

const cliAgentsPath = resolve(testDir, "../AGENTS.md");
const rootAgentsPath = resolve(repoRoot, "AGENTS.md");
const readmePath = resolve(repoRoot, "README.md");
const cliCostsPath = resolve(repoRoot, "apps/cli/docs/costs.md");
const cliGeneratePath = resolve(repoRoot, "apps/cli/docs/generate.md");
const cliErrorsPath = resolve(repoRoot, "apps/cli/docs/errors.md");

function read(path: string): string {
  return readFileSync(path, "utf-8");
}

/** The first markdown table under the "What do you want to do?" heading. */
function taskTable(doc: string): string {
  const heading = doc.search(/^#+ What do you want to do\?$/m);
  const lines = doc.slice(heading).split("\n");
  const start = lines.findIndex((line) => line.startsWith("|"));
  if (heading === -1 || start === -1) {
    throw new Error("missing the What do you want to do? table");
  }
  const rows = lines.slice(start);
  const end = rows.findIndex((line) => !line.startsWith("|"));
  return rows.slice(0, end === -1 ? undefined : end).join("\n");
}

describe("docs sync", () => {
  it("documents every generation model id in the CLI cost reference and stdin schema", () => {
    for (const path of [cliCostsPath, cliGeneratePath]) {
      const doc = read(path);
      for (const model of GENERATION_MODELS) {
        expect(doc, `${path}: missing model id: ${model}`).toContain(model);
      }
    }
  });

  it("documents every error code in the CLI agent guide and error catalogue", () => {
    for (const path of [cliAgentsPath, cliErrorsPath]) {
      const doc = read(path);
      for (const code of Object.keys(ERROR_CATALOG)) {
        expect(doc, `${path}: missing error code: ${code}`).toContain(code);
      }
    }
  });

  it("documents every look and mood id in the CLI agent guide and README", () => {
    for (const path of [cliAgentsPath, readmePath]) {
      const doc = read(path);
      for (const field of CREATIVE_FIELDS) {
        for (const option of CREATIVE_TAXONOMY[field]) {
          expect(doc, `missing ${field} id: ${option.id}`).toContain(
            `\`${option.id}\``
          );
        }
      }
    }
  });

  it("routes every help command in the task table of both agent guides", () => {
    for (const path of [rootAgentsPath, cliAgentsPath]) {
      const table = taskTable(read(path));
      for (const row of COMMAND_TASKS.filter((task) => task.inHelp)) {
        expect(table, `${path}: ${row.command}`).toContain(`\`${row.usage}\``);
        expect(table, `${path}: ${row.command}`).toContain(row.notFor);
      }
      expect(table, `${path}: --look`).toContain("--look <id>");
    }
  });

  it("mentions creative direction in the user-facing docs", () => {
    const docs: [string, string][] = [
      ["README.md", readmePath],
      ["apps/cli/AGENTS.md", cliAgentsPath],
    ];
    for (const [label, path] of docs) {
      expect(
        read(path).toLowerCase(),
        `missing creative in ${label}`
      ).toContain("creative");
    }
  });
});
