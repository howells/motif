import { defineConfig } from "tsdown";

/**
 * Three independent build entries:
 *
 *  1. The core `.` entry (`src/index.ts`) keeps its existing dual CJS+ESM build
 *     with declaration files. It must emit the same outputs as before this file
 *     existed: dist/index.js (ESM), dist/index.cjs (CJS), dist/index.d.ts, and
 *     dist/index.d.cts.
 *
 *  2. The provider-agnostic image layer (`src/image/index.ts`) ships ESM-only
 *     (the Vercel AI SDK `ai@7` is ESM-only), as the `./image` subpath export:
 *     dist/image.js + dist/image.d.ts. No CJS/`require` condition.
 *
 *  3. The Model and tool tables (`src/registry.ts`), ESM-only, as the
 *     `./registry` subpath export: dist/registry.js + dist/registry.d.ts.
 *
 * The `entry` object form fixes the output basenames (`index` / `image` /
 * `registry`) so the entries never collide on `dist/index.*`.
 *
 * Every entry sets `clean: false`: tsdown runs the entries in parallel over a
 * shared `dist/`, so letting one `clean` could race and wipe another's
 * artifacts. `dist/` is instead cleaned deterministically BEFORE tsdown by the
 * `build`/`dev` scripts in package.json (a dependency-free `node -e rmSync`).
 */
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["cjs", "esm"],
    dts: true,
    clean: false,
    sourcemap: false,
    outExtensions: ({ format }) => ({
      js: format === "cjs" ? ".cjs" : ".js",
      dts: format === "cjs" ? ".d.cts" : ".d.ts",
    }),
  },
  {
    entry: { registry: "src/registry.ts" },
    format: ["esm"],
    dts: true,
    clean: false,
    sourcemap: false,
    outExtensions: ({ format }) => ({
      js: format === "cjs" ? ".cjs" : ".js",
      dts: format === "cjs" ? ".d.cts" : ".d.ts",
    }),
  },
  {
    entry: { image: "src/image/index.ts" },
    format: ["esm"],
    dts: true,
    clean: false,
    sourcemap: false,
    outExtensions: ({ format }) => ({
      js: format === "cjs" ? ".cjs" : ".js",
      dts: format === "cjs" ? ".d.cts" : ".d.ts",
    }),
  },
]);
