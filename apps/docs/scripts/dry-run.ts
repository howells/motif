import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { here, motif } from "./cli";
import type { CommandSpec, Example } from "./commands";

const IMAGES = here("../public/images/commands");

const OUTPUT = z.record(z.string(), z.json());

/** Split a command line into arguments, honouring double quotes. */
function tokenise(line: string): string[] {
  const tokens: string[] = [];
  for (const match of line.matchAll(/"([^"]*)"|(\S+)/gu)) {
    tokens.push(match[1] ?? match[2] ?? "");
  }
  return tokens;
}

/** Run the example for real, as a dry run, in a throwaway repo holding the
 * example's input files. Returns the command to show and what it printed. */
export function dryRun(
  spec: CommandSpec,
  example: Example,
  hasFields: boolean
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "motif-docs-")));
  const home = join(root, "home");
  const work = join(root, "work");
  mkdirSync(home);
  mkdirSync(work);
  spawnSync("git", ["init", "--quiet"], { cwd: work });
  try {
    for (const [name, source] of Object.entries(example.inputs ?? {})) {
      cpSync(join(IMAGES, source), join(work, name));
    }
    const base = example.args.replace(/^motif /u, "");
    const fields = hasFields ? " --fields cost,costBasis,output" : "";
    const pick = example.pick;
    const command =
      pick === undefined
        ? `motif ${base} --dry-run${fields}`
        : `motif ${base} --dry-run --format json | jq '{${pick.join(", ")}}'`;
    const args = tokenise(`${base} --dry-run${fields} --format json`);
    const { code, err, out } = motif(args, work, home);
    if (code !== 0) {
      throw new Error(
        `The dry run for ${spec.id} failed (exit ${code}): ${err || out}`
      );
    }
    // Output paths come back absolute; the page shows them as you would type them.
    const printed = OUTPUT.parse(JSON.parse(out.replaceAll(`${work}/`, "")));
    const shown =
      pick === undefined
        ? printed
        : Object.fromEntries(pick.map((key) => [key, printed[key]]));
    return { command, output: JSON.stringify(shown, null, 2) };
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}
