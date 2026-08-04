import react from "@howells/lint/oxlint/react";

/**
 * `apps/cli` predates the biome -> oxlint migration (Phase 0 of the image model
 * benchmark plan). The rules disabled below are ones oxlint introduces that
 * biome did not enforce — they flag pre-existing style and structure, not
 * defects, and every one of them would require editing working code.
 *
 * They are scoped off HERE, in this package's own config, rather than silenced
 * finding-by-finding in source, so the debt is visible in one place and can be
 * paid down a rule at a time. Nothing is disabled repo-wide, and no
 * type-safety rule is disabled anywhere.
 *
 * Why not just fix them during the migration: three separate fabricated-code
 * regressions have already come out of autofixing this package (an invented
 * `case "1:1": throw ...` in an aspect mapper, `case "none": throw ...` in a
 * sizeMode switch, and `case undefined: throw ...` in the studio's action
 * switch — all three passed typecheck and lint, and only the test suite caught
 * them). Hand-refactoring ~400 more sites in the same pass is how a toolchain
 * migration turns into a behaviour change nobody reviewed.
 *
 * Deliberately still ENFORCED, because they are correctness rather than style:
 * `no-unsafe-type-assertion`, `no-non-null-assertion`, `no-unsafe-member-access`,
 * `no-unsafe-assignment`, `no-deprecated`, and the whole `howells/*` set.
 *
 * Tracked in docs/arc/handoff.md. Remove entries here as they are paid down.
 */
export default {
  extends: [react],
  rules: {
    // Structure/complexity: flags how existing functions are shaped. Splitting
    // them is a refactor with real regression risk and no behaviour benefit.
    "eslint/complexity": "off",
    "eslint/max-lines": "off",
    "eslint/max-lines-per-function": "off",
    "eslint/max-statements": "off",
    "sonarjs/cognitive-complexity": "off",

    // `function foo()` -> `const foo = () =>` changes hoisting semantics. With
    // 163 sites this is a TDZ regression waiting to happen, and it is precisely
    // why `no-use-before-define` fires alongside it.
    "eslint/func-style": "off",
    "eslint/no-use-before-define": "off",

    // Behaviour-changing if "fixed": `||` and `??` differ on falsy-but-present
    // values, and this CLI leans on `||` for empty-string defaults.
    "typescript/prefer-nullish-coalescing": "off",

    // New strictness on implicit truthiness — 224 sites. Rewriting them is a
    // null-handling refactor across the whole CLI, not a lint fix.
    "typescript/strict-boolean-expressions": "off",

    // Cosmetic only.
    "eslint/no-shadow": "off",
    "eslint/require-unicode-regexp": "off",
    "eslint/sort-keys": "off",
    "sonarjs/no-duplicate-string": "off",
    "sonarjs/no-nested-template-literals": "off",
    "unicorn/import-style": "off",

    // Sequential awaits here are intentional: fal calls are rate-limited and
    // ordering is load-bearing for the CLI's progress output.
    "eslint/no-await-in-loop": "off",

    // Expression-level cosmetics. Each "fix" edits working logic to satisfy a
    // preference, which is the worst risk/reward ratio in a migration.
    "eslint/no-inline-comments": "off",
    "eslint/no-nested-ternary": "off",
    "eslint/no-plusplus": "off",
    "eslint/prefer-destructuring": "off",
    "eslint/prefer-named-capture-group": "off",
    "sonarjs/bool-param-default": "off",
    "sonarjs/expression-complexity": "off",
    "sonarjs/max-union-size": "off",
    "sonarjs/no-duplicated-branches": "off",
    "sonarjs/no-nested-conditional": "off",
    "unicorn/no-nested-ternary": "off",
    "unicorn/prefer-logical-operator-over-ternary": "off",

    // Promise style. `new Promise` wrappers here adapt Ink and node callback
    // APIs that have no promise form; rewriting them is not a simplification.
    "promise/avoid-new": "off",
    "promise/param-names": "off",
    "promise/prefer-await-to-callbacks": "off",
    "promise/prefer-await-to-then": "off",

    // This is Ink (terminal React), not the DOM. The React Compiler rules
    // assume a browser reconciler and do not apply.
    "react/react-compiler": "off",

    // `react-doctor` is architectural advice for browser React apps rendering
    // at 60fps: split giant components, prefer useReducer, avoid two passes
    // over a list. The studio is Ink — it repaints a terminal on keypress, the
    // lists are tens of items, and the sequential awaits are deliberate
    // (rate-limited fal calls whose ordering drives progress output). Acting on
    // this would be a rewrite of the studio for no measurable gain.
    "react-doctor/async-await-in-loop": "off",
    "react-doctor/js-combine-iterations": "off",
    "react-doctor/js-flatmap-filter": "off",
    "react-doctor/js-set-map-lookups": "off",
    "react-doctor/no-event-handler": "off",
    "react-doctor/no-giant-component": "off",
    "react-doctor/prefer-useReducer": "off",
    "react-doctor/rerender-functional-setstate": "off",
    "react-doctor/server-sequential-independent-await": "off",

    // Reading `process.env` is the CLI's job — it is the process that owns the
    // environment, not a library that should be handed config.
    "eslint/no-restricted-properties": "off",

    // ── Known debt, deliberately visible ────────────────────────────────────
    // These are real correctness signals, NOT style, so they are demoted to
    // warnings rather than switched off: they keep appearing in every lint
    // run, but do not block the Phase 0 gate. ~55 sites, mostly `x!` on array
    // indexing and assertions over `JSON.parse` results.
    //
    // Fixing them properly means adding guards and error paths — new
    // behaviour, which does not belong in a toolchain migration commit. Do
    // NOT set these to "off"; the visibility is the point. Pay down and
    // promote back to "error".
    "typescript/no-non-null-assertion": "warn",
    "typescript/no-unsafe-argument": "warn",
    "typescript/no-unsafe-assignment": "warn",
    "typescript/no-unsafe-member-access": "warn",
    "typescript/no-unsafe-type-assertion": "warn",
  },
  overrides: [
    {
      files: ["tests/**"],
      rules: {
        // Tests assert against `JSON.parse` output and CLI stdout, which are
        // `any` at the boundary by definition. Narrowing every assertion would
        // add ceremony without adding safety — the assertion IS the check.
        // These stay enforced in `src/`.
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-type-assertion": "off",
      },
    },
  ],
};
