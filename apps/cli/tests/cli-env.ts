import { spawn } from "node:child_process";

/**
 * Environment for a spawned CLI run.
 *
 * Tests that parse the CLI's output need a clean stderr, and they ask for that
 * with NO_COLOR. Node prints "The 'NO_COLOR' env is ignored due to the
 * 'FORCE_COLOR' env being set" when both are present, which is enough to break
 * a JSON.parse of stderr. Interactive terminals and CI runners both export
 * FORCE_COLOR, so drop it here rather than let the suite depend on the shell it
 * was started from.
 */
export const spawnEnv = (
  overrides: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv => ({
  ...process.env,
  FORCE_COLOR: undefined,
  NO_COLOR: "1",
  ...overrides,
});

export interface SpawnedCliResult {
  code: number;
  stderr: string;
  stdout: string;
}

/**
 * Run the CLI from source under `home`, with no FAL_KEY and CI set, and
 * collect its output. `env` adds or overrides variables.
 */
export async function runMotifIn(
  home: string,
  args: string[],
  env: NodeJS.ProcessEnv = {}
): Promise<SpawnedCliResult> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts", ...args],
    {
      cwd: process.cwd(),
      env: spawnEnv({ CI: "1", FAL_KEY: "", HOME: home, ...env }),
      stdio: ["pipe", "pipe", "pipe"],
    }
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf-8");
  child.stderr.setEncoding("utf-8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.stdin.end("");

  return await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stderr, stdout });
    });
  });
}
