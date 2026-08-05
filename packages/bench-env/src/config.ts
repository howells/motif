/**
 * Non-secret bench configuration.
 *
 * Credentials and other consumed secrets belong in the environment (see
 * `./server`); stable, non-secret settings belong here. This module never
 * imports `./schema` and never triggers env validation — it is safe to import
 * from anywhere, including build-time evaluation with no environment
 * configured (e.g. `next build` with zero env vars set).
 */
// oxlint-disable-next-line no-restricted-properties -- this module IS the parse-free env-config boundary; a single raw NODE_ENV read, never a secret
const isProduction = process.env.NODE_ENV === "production";

export const benchConfig = {
  isProduction,
} as const;
