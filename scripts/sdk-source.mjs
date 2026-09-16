/**
 * Load a module from the SDK's TypeScript source.
 *
 * The generator scripts read the per-model and per-tool registries, which are
 * not part of `@howells/motif-sdk`'s public index, so they import the defining
 * files directly rather than the built package. tsx is a devDependency of the
 * CLI; the repo root has none.
 */

import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dirname, "..");
const require = createRequire(join(ROOT, "apps/cli/package.json"));
const { tsImport } = await import(
  pathToFileURL(require.resolve("tsx/esm/api")).href
);

/** @param {string} file path under packages/motif-sdk/src, e.g. "tools.ts" */
export function importSdkSource(file) {
  return tsImport(join(ROOT, "packages/motif-sdk/src", file), import.meta.url);
}
