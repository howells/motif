import path from "node:path";

import { loadDotenv } from "@howells/envy/dotenv";

let loaded = false;

/**
 * Load the workspace-root `.env` once per process.
 *
 * Bundled contexts (Next/Turbopack route evaluation) have no
 * `import.meta.dirname`; there the framework already loads `.env.local`, so
 * the manual workspace-dotenv load is redundant — skip instead of crashing.
 */
export const loadWorkspaceDotenv = () => {
  if (loaded) {
    return;
  }

  const dirname = import.meta.dirname as string | undefined;
  if (dirname === undefined) {
    loaded = true;
    return;
  }

  const workspaceRoot = path.resolve(dirname, "../../..");
  loadDotenv([path.resolve(workspaceRoot, ".env")], {
    override: true,
    skipMissing: true,
  });
  loaded = true;
};
