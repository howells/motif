import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Minimal, matching `tsconfig.json`'s single path mapping (`@/*` → `./*`) —
 * `lib/runs/types.ts` (imported transitively by every `lib/runs/*.test.ts`)
 * uses it for `@/lib/aspect`. No `vite-tsconfig-paths` dependency needed for
 * one alias.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "node",
  },
});
