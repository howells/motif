# Native TypeScript 7 toolchain

The SDK uses tsdown 0.23 for JavaScript and native TS7 declaration generation. The existing ESM, CommonJS and image export paths are preserved. All workspace packages use TypeScript 7.0.2; the TS6 bridge and compiler alias are removed.

The workspace consumes @howells/lint 3.0.0, which removes GitHub and SonarJS plugins and their legacy compiler dependency. Native type-aware checks remain on. React Doctor exceptions for Ink already existed before this migration.

New anti-slop, test-style and React Compiler diagnostics are migration warnings in oxlint.config.ts. They remain visible; this release does not claim zero lint warnings. Promote them after the existing runtime-boundary parsing, Result-based test assertions and React optimization findings have been addressed. Existing native correctness checks remain errors. Vitest valid-expect permits its supported second diagnostic-message argument.
