import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Minimal, matching `tsconfig.json`'s single path mapping (`@/*` → `./*`) —
 * `lib/runs/types.ts` (imported transitively by every `lib/runs/*.test.ts`)
 * uses it for `@/lib/aspect`. No `vite-tsconfig-paths` dependency needed for
 * one alias.
 */
export default defineConfig({
  // Next compiles JSX itself (`"jsx": "preserve"`); render tests need it
  // compiled here, with the automatic runtime the App uses. Vite 8 compiles
  // with Oxc, so the setting lives under `oxc`.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "node",
  },
});
