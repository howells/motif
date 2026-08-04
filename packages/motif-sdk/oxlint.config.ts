import core from "@howells/lint/oxlint/core";

export default {
  extends: [core],
  overrides: [
    {
      // This file IS the SDK's env boundary (wraps @howells/envy's
      // defineEnv) — reading process.env directly is its job, matching the
      // same override materialdesk applies to its own dedicated env package
      // (see packages/env/oxlint.config.ts there). Scoped to this one file;
      // the rest of the SDK still goes through parseMotifEnv/getFalKeyFromEnv.
      files: ["src/env.ts"],
      rules: {
        "no-restricted-properties": "off",
      },
    },
  ],
};
