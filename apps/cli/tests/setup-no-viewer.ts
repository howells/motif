import { execFileSync } from "node:child_process";
import { delimiter, join } from "node:path";

/**
 * No test may open a viewer. The CLI opens files by running `open` (macOS) or
 * `xdg-open` (Linux) from PATH, so the suite puts stand-ins that do nothing
 * ahead of the real ones. In-process code reads PATH when it loads, after this
 * file runs, and spawned CLI runs inherit it through `spawnEnv`.
 */
const stubs = join(import.meta.dirname, "no-viewer");
process.env.PATH = [stubs, process.env.PATH ?? ""].join(delimiter);

for (const opener of ["open", "xdg-open"]) {
  const found = execFileSync("/bin/sh", ["-c", `command -v ${opener}`], {
    encoding: "utf-8",
  }).trim();
  if (found !== join(stubs, opener)) {
    throw new Error(
      `Tests would run the real ${opener} at ${found}; refusing to start.`
    );
  }
}
