import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const here = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

const CLI = here("../../cli/bin/motif");

/** A clean environment: no key, and a throwaway home, so a developer's own
 * config and pins cannot change what the page says. */
function cliEnv(home: string): NodeJS.ProcessEnv {
  return { HOME: home, NO_COLOR: "1", PATH: "/usr/bin:/bin" };
}

export interface CliResult {
  readonly code: number;
  readonly err: string;
  readonly out: string;
}

/** Run the built Motif CLI and collect what it printed. */
export function motif(
  args: readonly string[],
  cwd: string,
  home: string
): CliResult {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf-8",
    env: cliEnv(home),
  });
  return { code: result.status ?? 1, err: result.stderr, out: result.stdout };
}
