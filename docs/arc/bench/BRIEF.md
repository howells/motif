# Bench harness — shared brief

Authoritative context for every agent working on the motif image-model benchmark.
Re-read this at each milestone. If an instruction you were given contradicts this
file, this file wins — say so rather than guessing.

- **Repo:** `/Users/danielhowells/Sites/motif`
- **Plan:** `docs/arc/plans/2026-08-03-image-model-benchmark.md` (read it once)
- **Precedent (read-only, never edit):** `/Users/danielhowells/Sites/materialdesk`.
  Its conventions beat anything invented here. Read its real files.

## Verified ground truth — do not re-derive, do not contradict

Re-verified against **SDK 1.0.0** on 2026-08-04. If your code disagrees with any
of this, your code is wrong.

The SDK renamed `MotifServer` to `FalClient` and retired `packages/motif-server`.
Any doc or plan text naming `MotifServer` is stale — including the plan at
`docs/arc/plans/2026-08-03-image-model-benchmark.md`, which was written against
SDK 0.3.0 and still says `MotifServer` and "18 models" throughout. Trust this
file over the plan wherever they disagree.

- **23 aliases** in `GENERATION_MODELS` (was 18). All 23 align and build a body
  cleanly; the drift guard is clean. New since the plan was written:
  `seedream5`, `seedream5-lite`, `flux2-turbo`, `recraft4`, `ideogram4`.
- **No seed support (5):** `gpt2`, `gpt`, `recraft`, `recraft4`, `grok-image`.
  Their samples are irreducibly variable.
- **No `benchmark.speed.p95Seconds` (12 of 23 — over half):** `banana2`,
  `gemini`, `gemini3`, `seedream5`, `seedream5-lite`, `flux2-turbo`, `flux`,
  `flux-fast`, `recraft`, `recraft4`, `ideogram`, `ideogram4`. This is much
  worse than the plan's "6 of 18". The explicit timeout floor is now the
  common path, not the exception — derive it deliberately and record it in the
  run spec, because a majority of models depend on it.
- **Queue polling:** `gpt2` only (`useQueue: true`). Its queue loop polls every
  3000ms, max 160 attempts (8 min ceiling), so `providerMs` carries ±3s
  granularity — badge it in any UI and exclude it from tight comparisons.
- **`FalClient` defaults are wrong for benchmarking:** `retries: 3` silently
  inflates latency, `timeout: 120_000` kills slow models. Always construct with
  explicit `{ retries: 0, timeout }`. `timeout` is per-HTTP-request, NOT a
  ceiling on the queue poll loop — a run-level deadline is required.
- **`falPricing.unit` has FIVE values**, not the four the plan lists:
  `images` (9 models), `megapixels` (3), `processed megapixels` (2),
  `compute seconds` (1), `units` (2). Derive `cost_basis` from this field.
  Never hardcode an alias list.
- Full-sweep cost, 23 models x 1 sample = **$1.349** (verified by summing
  `estimatedCostPerImageUsd`). Cheapest pair for a smoke test:
  `flux-fast` ($0.003) + `grok-image` ($0.02) ≈ $0.023.
- `buildGenerateBody` throws on unsupported options; `validateGenerateOptions`
  is NOT exported. `align-params.ts` reimplements its rules and the drift guard
  test is what keeps them in sync.

## Aspect coercion is lossy and NOT uniform — this matters

One requested aspect becomes three different real aspects:

| requested | `aspect_ratio` models | `image_size_enum` models | `gpt` (`gpt_size`) |
|---|---|---|---|
| `1:1`  | `1:1` (1.000)  | `square_hd` (1.000)     | `1024x1024` (1.000) |
| `3:2`  | `3:2` (1.500)  | `landscape_4_3` (1.333) | `1536x1024` (1.500) |
| `16:9` | `16:9` (1.778) | `landscape_16_9` (1.778)| `1536x1024` (1.500) |

**Default the spec to `1:1`** — the only value where all three dialects agree, so
models are framed identically and a quality comparison is honest. Any other
aspect must surface a visible warning that framing differs across models.
Always record actual returned W×H from the image; never infer it.

## Non-negotiable rules

1. **Never let base64 or a data URI reach a span, a log, or Langfuse.** A
   documented 26-second regression came from exactly this. Images go to the
   judge by URL/path as an AI SDK `FilePart`. `syncMode` is never set.
2. **Closed error vocabulary.** Provider text never reaches a report or a span.
   Classify into: `TIMEOUT | RATE_LIMITED | HTTP_4XX | HTTP_5XX | SAFETY |
   NO_IMAGE | DOWNLOAD_FAILED | INTERRUPTED`.
3. **No prompts, no URLs, no image data in span attributes.** Closed zod enum of
   allowed keys; unknown keys dropped; URL-like values rejected.
4. **Purity split.** `bench-core` owns every `fetch`, file write and fal call.
   `bench-mastra` tools/workflows/agents contain none — no `fetch(`, `node:fs`,
   `readFileSync`, `writeFileSync`, `process.env.`. Enforced by a ported
   `wrapper-purity.test.ts`.
5. **Cost cap before spend.** `estimateWorstCase(spec)` runs and a hard
   `maxEstimatedCostUsd` throws BEFORE any provider work. Two-phase
   reserve/finish ledger per attempt.
6. **Mock by default.** No test, no default code path, and no dev-server boot
   may hit fal. Live runs require explicit opt-in. Every mock run is flagged
   `isMock` so fake data cannot pollute longitudinal stats.
7. **Concurrency defaults to 1, and is enforced.** "Fastest model" is the
   headline answer, so the default must be the trustworthy one. Contended runs
   (`concurrency > 1`) are badged everywhere they appear.
   *Enforcement arrived late (2026-08-05, `lib/runs/pool.ts`).* Before it, the
   field was collected, persisted and badged but acted on by nothing: a
   23-sample run whose per-sample latencies sum to 584s completed in 153s of
   wall clock, i.e. fully parallel, with 8 of its 11 failures `RATE_LIMITED`.
   Every latency recorded before that date is contended and unbadged — treat
   those runs as indicative, not comparable.
8. **Costs are integer micros.** Never floats, never bigint.
9. **`null` cost ≠ zero cost.** Unknown must stay distinguishable from free.
10. **No SDK changes.** Everything needed is already exported from
    `packages/motif-sdk/src/index.ts`.

## Precedent files — read these directly, do not invent

All in `/Users/danielhowells/Sites/materialdesk` (read-only).

| Need | File |
|---|---|
| envy schema shape | `packages/env/src/schema.ts` |
| parse-free entrypoint | `packages/env/src/config.ts` |
| per-call parse accessor | `packages/env/src/runtime.ts` |
| eager-parse entrypoint + `requireServerEnv` | `packages/env/src/server.ts` |
| drizzle schema conventions | `packages/db/src/schema.ts` |
| push-target guard | `packages/db/src/schema-push-target.ts` |
| drizzle-kit config | `packages/db/drizzle.config.ts` |
| private no-build package shape | `packages/telemetry/{package.json,tsconfig.json,turbo.json}` |
| multi-entry export map | `packages/vision/package.json` |
| Next config | `apps/web/next.config.ts` |
| React Query setup | `apps/web/lib/{query-client.ts,query-provider.tsx}` |
| vitest config sharing | `packages/vitest-config/` + `packages/vision/vitest.config.ts` |
| Mastra purity test (port this) | `packages/mastra/src/wrapper-purity.test.ts` |
| observability + guardedFlush | `packages/mastra/src/observability.ts` |
| safe span attributes | `packages/telemetry/src/safe-attributes.ts` |
| judge levels + geometric mean | `packages/vision/src/judge-render.ts` |
| cost cap / reserve-finish ledger / percentiles | `packages/vision/src/benchmark/` |
| model policy record | `packages/mastra/src/model-policy.ts` |

Established facts from these (do not re-derive):

- tsconfig preset: `@howells/typescript-config/bundler-no-dom-library-monorepo`,
  with `noEmit: true`, `types: ["node"]`, `include: ["src/**/*.ts"]`.
- Sibling `turbo.json` per package is always three tags:
  `{ "extends": ["//"], "tags": ["type:package", "scope:<name>", "visibility:internal"] }`
- No-build packages have NO `build` script, NO `main`, NO `types` — export map
  points at `./src/*.ts`. Next must list them in `transpilePackages`.
- Drizzle: camelCase TS key → snake_case SQL name, keys alphabetical, `text`
  ids (never uuid/serial), shared `timestamptz` helper, constraints as an array
  in the third `pgTable` arg, `src/index.ts` re-exports each table by name
  (never `export *`).
- Next 16.2.12 / React 19.2.7. `serverExternalPackages: ["@mastra/*"]`.
- `packages/vitest-config` ships BOTH `src/index.mjs` (the one in the export
  map) and a diverging unexported `src/index.ts`. Port only the `.mjs` shape.

**UNVERIFIED APIs — confirm before building on them.** These are asserted by the
plan but have ZERO occurrences in materialdesk, so they carry no precedent:

- `.foreach(step, { concurrency })` on a Mastra workflow, and nested-workflow-
  per-item fan-out.
- `context.tracingContext.currentSpan?.createChildSpan({ type, name })` and
  `span.end({ metadata })`.
- `listActiveWorkflowRuns()` / `restart()` for stale-run reconciliation.

Before writing code against any of these, verify the real signature against the
installed `@mastra/core` type definitions in `node_modules` (and the `mastra`
skill if it is available). If an API does not exist in the installed version,
STOP and report it — do not invent a shim, and do not silently substitute a
different mechanism. `.foreach` in particular determines the whole fan-out
shape; getting it wrong invalidates every latency number the harness produces.

Also confirmed absent and therefore not to be copied: `@howells/neon/kit` /
`neonKitConfig` (materialdesk deliberately uses `drizzle-kit`'s `defineConfig`
directly), multi-file drizzle schemas, and any migrations directory (`db:push`
only).

Deviations from materialdesk we are taking deliberately:

- **`createHttpDb` has no call site in materialdesk** (it uses `createNeonPool`
  + `drizzle-orm/node-postgres`). We still use `createHttpDb` from
  `@howells/neon/http` for the app's own reads per the plan, and a separate
  `createMastraPool` from `@howells/neon/mastra` for `PostgresStore`.
  `createMastraPool` clamps `max` to >= 2 — a single-client pool deadlocks
  `@mastra/pg` batch writes. Never hand-roll this pool.
- **Money:** materialdesk keeps USD as a rounded float and never persists it.
  We persist integer micros in Postgres instead — better for storage, and
  values are single-digit dollars so there is no bigint risk.

## House style

- Private packages, `type: module`, exports pointing straight at `src/*.ts`, no
  build step. Deps as `catalog:` / `workspace:*`. Tests colocated as `*.test.ts`.
- Server Components own routes; interactive leaves are client components; React
  Query for all client fetching; no raw `fetch` in a component.
- `force-dynamic` on every DB-backed page and route — turbo's `test` depends on
  `build`, so a build that needs env at compile time blocks the unit tests.

## Working rules — learned the expensive way, non-negotiable

Phase 0 lost its working tree twice. Root cause: a sub-agent ran a repo-wide
format that swept outside its assigned directory, noticed, and self-reverted
with a `git reset` — destroying two sibling agents' concurrent work. These rules
exist because of that, not as boilerplate.

1. **Do not spawn sub-agents.** Work sequentially in your own session, one
   package at a time. If the job feels large enough to want parallelism, say so
   and I will split it into separate dispatches with disjoint file footprints.
2. **No write-side git commands. Ever.** No `reset`, `checkout`, `stash`,
   `clean`, `restore`, `rebase`, `cherry-pick`. Reads (`status`, `diff`, `log`,
   `show`) are fine. If you believe you need to undo something, stop and ask.
3. **Commit early and often** on the working branch. `--no-verify` WIP commits
   are fine and expected — ten scrappy commits beat one lost tree. Label a
   knowingly-broken checkpoint as broken in the message.
4. **Never run a formatter, codemod, or `--fix` pass wider than your assigned
   scope.** Target explicit paths. A repo-wide sweep is how this went wrong.
5. **Never run `oxlint --fix-dangerously` (or any "unsafe" autofix).** Observed
   fabricating code, not reformatting it: its switch-exhaustiveness fixer
   inserted `case "1:1": throw new Error(...)` into both aspect mappers in
   `motif-sdk/src/aspects.ts` and `case "none": throw ...` into `generate.ts`'s
   sizeMode switch. Both were intentional fallthroughs. It broke
   `buildGenerateBody` for GPT Image 2 and silently regressed two tests. Plain
   `--fix` plus by-hand edits only. Always run the full suite before committing
   any autofix, and compare pass counts against pre-change HEAD.
6. **Autofixes that rewrite imports are dangerous.** `no-duplicate-imports` was
   observed replacing `import { basename, resolve } from "node:path"` with a
   default `import path`, breaking eight call sites — and a local variable named
   `path` made the rewrite silently wrong rather than merely incomplete. After
   any import-touching autofix, typecheck before moving on.
6. **A red gate is not done.** Do not go idle on a failing verification command.
   If you cannot get it green, report what fails and why, and stop.

## Reporting

Keep reports short: what landed (file list), gates pass/fail, anything that
contradicts this file. No preamble, no restating the spec. Depth on request.
