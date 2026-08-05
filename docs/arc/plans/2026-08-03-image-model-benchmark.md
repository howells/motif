# Motif Image Model Benchmark — Mastra-orchestrated app

**Status:** planned, not started · **Date:** 2026-08-03

## Context

Which of motif's 18 image models gives the **fastest** image at the **best** quality for the **cheapest** cost, for a room-generation prompt? Nothing measures this today: the SDK has no timing telemetry, costs are estimates, and quality metadata is third-party and missing for 6 of 18 models. This builds a real harness — a web app with a UI, Mastra orchestrating the runs, and observability around them.

**Decisions taken:** lives at `apps/bench` (+ supporting packages) inside this repo; motif's toolchain gets bumped to the current house lane first; Neon Postgres via Drizzle; blind vision judge for quality with manual override; samples per model configurable, default 1; default set = all 18 `GENERATION_MODELS`; **`.foreach` concurrency defaults to 1** so latency numbers are honest, configurable per run with contended runs badged in the UI.

## Prior art this follows

`~/Sites/materialdesk` is the closest precedent and its conventions win over anything invented here:

- **`packages/vision/src/benchmark/`** — an existing manifest-driven harness: per-route `BenchmarkPricing` carrying `estimateBasis`/`observedAt`/`sourceUrl`, a hard `maxEstimatedCostUsd` cap checked *before* any provider work, two-phase reserve/finish cost ledger with atomic checkpoint writes, mock-by-default with `--live --confirm-live <campaign-id>` triple confirmation, nearest-rank percentiles, and report models that physically cannot leak prompts or URLs (errors are `{ code }` from a closed vocabulary).
- **`packages/mastra/src/wrapper-purity.test.ts`** — `fetch(`, `node:fs`, `readFileSync`, `writeFileSync`, `process.env.` are banned in `tools/`, `workflows/`, `agents/`. So Mastra orchestrates; a domain package does the I/O.
- **`packages/mastra/src/observability.ts`** — Langfuse via `createLangfuseObservability`, `guardedFlush` in `finally` (never `shutdown()`), and the documented 26-second regression from letting Langfuse see a base64 data URI. **No base64 or data URI ever enters a span.**
- **`packages/telemetry/src/safe-attributes.ts`** — a closed zod enum of allowed span attribute keys with per-key value schemas; unknown keys dropped, URL-like and sensitive-word values rejected.
- **`packages/vision/src/judge-render.ts`** — ordinal quality levels (`editorial | competent | stock | slop`), loose-parse-then-normalize, geometric mean with a slop gate, failure is `inconclusive` not fatal.
- **`packages/mastra/src/model-policy.ts`** — one `MODELS` record, zero model strings elsewhere, every choice commented with the measurement that justified it.

## Key SDK constraints (verified in `packages/motif-sdk/src/`)

- `buildGenerateBody`/`validateGenerateOptions` (`generate.ts`) **throw** on unsupported options and `validateGenerateOptions` is not exported — so alignment must filter per model from `MODELS[alias]` capability flags, wrap the `buildGenerateBody` call in try/catch, and a test must assert the two agree (drift guard).
- Seed unsupported by `gpt2`, `gpt`, `recraft`, `grok-image`. Same aspect yields different pixel counts per `sizeMode` — record actual W×H.
- `MotifServer` defaults `retries: 3` (silently inflates latency — use `0`) and `timeout: 120s` (kills slow models). 6 of 18 models have no `benchmark.speed.p95Seconds` (`banana2`, `gemini`, `flux`, `flux-fast`, `recraft`, `ideogram`) — missing data falls back to an explicit floor, recorded in the run spec.
- Only `gpt2` uses queue polling (3s granularity) — badge its timings.
- `cost_basis` derives from `MODELS[alias].falPricing.unit` (`megapixels` / `processed megapixels` / `compute seconds` / `units`), never a hardcoded alias list.
- Everything needed is already exported from `packages/motif-sdk/src/index.ts` — **no SDK changes**.

## Phase 0 — toolchain bump

Bring motif onto the current lane so the new app matches house style rather than the repo's 2025 lane:

- `.node-version` 22 → 24; `engines: { node: ">=24.15.0 <25" }` on every package.
- `packageManager` → `pnpm@11.5.2`; add `pnpm-workspace.yaml` `catalog:` entries for every shared dep, plus `minimumReleaseAge: 1440` with `minimumReleaseAgeExclude: ["@howells/*"]`.
- `@howells/lint` 0.1.6 → 1.1.2: replace biome/ultracite with oxlint+oxfmt (`oxlint.config.ts` extending `@howells/lint/oxlint/next`, `oxfmt.config.ts`), swap `lint-staged` to `howells-fix` / `howells-oxfmt`, delete `biome.json`. Expect a large mechanical diff across `apps/cli` and `packages/*` — gate on `pnpm check` staying green.
- `@howells/typescript-config` presets per package; `turbo.json` gains `tags` for `@howells/boundaries`.

Risk is concentrated here and it is mechanical; if oxlint surfaces non-trivial findings in existing packages, fix or `// oxlint-disable-next-line ... -- reason` inline (never weaken config), and keep it a separate commit from the bench work.

## Package layout

```
apps/bench/               @motif/bench-web    Next 16 app: UI + route handlers
apps/bench-studio/        passthrough shell so Mastra Studio appears in turbo
packages/bench-env/       @motif/bench-env    envy + zod schema (import parses nothing)
packages/bench-db/        @motif/bench-db     drizzle schema + @howells/neon client
packages/bench-core/      @motif/bench-core   domain: align, execute, cost, judge, aggregate
packages/bench-mastra/    @motif/bench-mastra Mastra instance, workflows, steps (orchestration only)
```

All private, `type: module`, exports pointing straight at `src/*.ts` (no build step), deps as `catalog:` / `workspace:*`, colocated `*.test.ts`.

**The split that matters:** `bench-core` owns every `fetch`, every file write, every fal call. `bench-mastra` steps are thin wrappers that call injected executors — enforced by porting `wrapper-purity.test.ts`.

## Domain core (`packages/bench-core`)

- `align-params.ts` — canonical spec → per model `{ options, endpoint, body, droppedParams[], coercedParams{}, alignmentError? }`, driven entirely by capability flags. Seed `spec.seed + sampleIndex` where supported; `outputFormat: "jpeg"` where supported; resolution only to `supportsResolution` models; aspect coercion recorded per `sizeMode`; auto-set `quality: "high"` recorded. Model-specific tuners (guidance, steps, style) deliberately left at fal defaults — forcing them would misalign quality, and the report says so.
- `routes.ts` — the manifest, one descriptor per model carrying `BenchmarkPricing`-shaped `{ estimatedCostUsd, estimateBasis, observedAt, sourceUrl }` derived from `falPricing`. The only file that knows about fal.
- `execute.ts` — `MotifServer({ retries: 0, timeout })`; `performance.now()` around the fal call (provider latency) and separately around download+disk write; dimension sniff; per-MP cost refinement; error classification into a **closed code vocabulary** (`TIMEOUT | RATE_LIMITED | HTTP_4XX | HTTP_5XX | SAFETY | NO_IMAGE | DOWNLOAD_FAILED | INTERRUPTED`) so reports cannot leak provider text.
- `cost-ledger.ts` — `estimateWorstCase(spec)` before any provider work; hard `maxEstimatedCostUsd` cap that throws; two-phase reserve/finish per attempt.
- `judge.ts` — blind absolute scoring per image (no model names, neutral labels). Ordinal levels `editorial | competent | stock | slop` per criterion, loose-parse-then-normalise into the strict schema, weighted geometric mean with a slop gate. Room rubric: promptAdherence, photorealism, artifacts, lightingCoherence, spatialPlausibility, materialFidelity. Failure is `{ status: "inconclusive", errorCode }`, never fatal. Images passed as AI SDK `FilePart` by **URL/path, not base64**, per the Langfuse lesson.
- `aggregate.ts` — nearest-rank percentiles (`ceil(p × n)`, one-based), p50/p95 per phase, cost distinguishing `null` (unknown) from zero.

Not a Mastra `createScorer`: scorer judge steps build a text prompt via `createPrompt` and multimodal input isn't documented for them — and materialdesk reached the same conclusion (zero `createScorer` usage; judging lives in `@desk/vision`).

## Mastra orchestration (`packages/bench-mastra`)

```ts
// src/index.ts — via @howells/mastra, matching @desk/mastra
export const mastra = new Mastra(defineMastraConfig({
  logger, observability, serviceName: "motif-bench",
  storage: new PostgresStore({ connectionString, schemaName: "mastra" }),
  workflows: { "benchmark-run": benchmarkRunWorkflow, "judge-run": judgeRunWorkflow },
}))
```

Unlike `@desk/mastra` (deliberately storage-less, in-process) this **does** take `PostgresStore` with `schemaName: "mastra"`, so Mastra's `mastra_workflow_snapshot` / `mastra_ai_spans` tables sit beside the app's own tables in one Neon database. That buys durable run state, `listActiveWorkflowRuns()` / `restart()` after a dev-server restart, and Studio observability — worth it for runs that take 15–25 minutes and cost real money.

Workflow shape:

```
benchmark-run:  planRun  →  .foreach(runOneModel, { concurrency })  →  finalizeRun
runOneModel (nested):  generate  →  persist
judge-run:  loadSamples  →  .foreach(judgeOne, { concurrency: 4 })  →  finalizeJudging
```

- `.foreach` concurrency comes from the run spec, **default 1**. Nested workflow per model is the documented shape for multi-step-per-item fan-out.
- Steps use `workflowThen` (the `@howells/mastra` wrapper that dodges the `no-then` lint rule).
- **Error-as-data at the step boundary**: `generate` returns a discriminated result, never throws, so one dead model cannot fail the other 17. `retryConfig: { attempts: 0 }` — generations are expensive and non-idempotent; a silent replay would corrupt both cost and latency.
- Per-step timeout races the *remainder* of a run-level deadline (materialdesk's `withDeadline` pattern) rather than a fresh cap per step, derived from selected models' `p95Seconds × 1.5` with an explicit floor for the 6 models lacking speed data.
- Started with `startAsync()` → returns `runId` immediately; the HTTP request does not hold the run open.

## Observability

- `observability.ts`: `createLangfuseObservability({ serviceName: "motif-bench", failFastInProd: false })` — Langfuse when keys resolve, `MastraStorageExporter` (→ Postgres → Studio) otherwise. `guardedFlush` in `finally`; never `shutdown()`.
- `safe-attributes.ts`: closed zod enum of bench keys — `bench.model`, `bench.sample_index`, `bench.concurrency`, `bench.provider_ms`, `bench.download_ms`, `bench.cost_micros`, `bench.cost_basis`, `bench.width`, `bench.height`, `bench.quality_score`, `bench.quality_level`, `bench.error.code`, `bench.dropped_params`, `bench.queue_polled`. Unknown keys dropped; URL-like and prompt-like values rejected. **No image data, no prompts, no fal URLs in spans.**
- Child spans inside steps via `context?.tracingContext.currentSpan?.createChildSpan({ type: "generic", name: "bench.generate" })` → `span.end({ metadata })`, so each model's provider call is its own timed span with cost and quality attributes attached.
- Studio: `apps/bench-studio` passthrough → `mastra build --dir src --root . --studio` + serve on a fixed port, pointed at the same Postgres.
- Traces are the *diagnostic* record; the app's own Drizzle tables are the *source of truth* the UI reads.

## Data (`packages/bench-db`, Drizzle + Neon)

Schema-first with `drizzle-kit push`, `assertSchemaPushTarget()` guarding the direct (non-pooler) endpoint. Client via `@howells/neon` `createHttpDb` (never `drizzle-orm/neon-serverless`); Mastra's `PostgresStore` uses its own `pg` pool against the pooled endpoint.

- **`bench_runs`** — status, prompt, aspect, resolution, seed, samplesPerModel, concurrency, models[], full spec jsonb, `cohortHash`, `isMock`, `sdkVersion`, `mastraRunId`, estimated + reserved + actual cost micros, timestamps.
- **`bench_samples`** — run FK, model alias/name, sampleIndex, executionOrdinal, status, provenance (endpoint, exact request body jsonb, droppedParams, coercedParams, seedSent/Returned, queuePolled, falRequestId), timing (`providerMs`, `downloadMs`, `totalMs`), image (relative path, W×H, bytes, contentType — fal CDN URLs expire so the file is downloaded immediately, temp-write-then-rename *before* the row lands), cost (estimated, refined, basis), `errorCode` from the closed vocabulary.
- **`bench_judgments`** — sample FK, judge model, rubric id + version, per-criterion levels jsonb, overall numeric, critique, status (`scored | inconclusive | not-run`), judge cost micros. Unique on (sample, judge, rubric, version) → re-judge upserts.
- **`bench_manual_ratings`** — sample PK, stars 1–5, note.

Costs stored as **integer** micros (values are single-digit dollars — sidesteps the bigint-returns-as-string trap entirely). Every jsonb column Zod-parsed on read, not just on write. Percentile queries filter to `completed | partial` runs. `cohortHash` covers prompt + aspect + resolution + sorted models + alignment schema version; changing alignment behaviour requires a version bump (rule stated at the constant).

## UI (`apps/bench`)

Server Components own the routes; interactive leaves are client components; React Query for all client fetching (no raw `fetch` in components, mutations invalidate keys). `force-dynamic` on DB-backed pages and routes so `next build` passes with no env — which matters because turbo's `test` task depends on `build`, so a failing build blocks the unit tests too. `serverExternalPackages: ["@mastra/*"]`.

**No SSE.** The run is started with `startAsync()`, and the results page polls the app's own tables via React Query while `status === 'running'` — samples appear as they persist, it survives a refresh or a dev-server restart, and it removes an entire class of complexity (EventSource can't POST, reconnect handling, heartbeats). Mastra's `workflow-step-progress` stream stays available if finer-grained progress is ever wanted.

- `/` — composer + history. Prompt, model chips (all 18 default, grouped by price tier), samples, concurrency, aspect/resolution/seed, judge-after toggle. Flow: **Preview** (dry-run — per-model endpoint/dropped/coerced table + worst-case cost, zero fal calls, per-model failures isolated so one bad alignment doesn't kill the preview) → **"Run — spend ~$1.17"** confirm against the hard cap → navigate to the run page. History flags stale `running` runs and offers Mastra's `restart()`.
- `/runs/[id]` — **verdict strip** (Fastest by `providerMs`, Best quality, Cheapest, Best value = quality per dollar, each with a pre-judge empty state); **image grid** per model with `next/image` + `sizes` for thumbnails and `unoptimized` full-res in the lightbox (the optimizer re-encodes, which is wrong when comparing image quality), latency badged "contended" when concurrency > 1 and "queue ±3s" for gpt2, cost, W×H, judge level + critique, star override labelled "manual", dropped-param footnotes, error cards by code; **comparison table** metric rows × model columns, best-in-row highlighted; **cost/quality scatter** (SVG) showing the Pareto frontier; a **trace link** per sample into Studio/Langfuse.
- Judging is triggered server-side off run completion when the toggle is set (survives a refresh), or by button; per-card "Judging…" as each judgment lands.
- Mock mode (`BENCH_MOCK=1`) injected at the composition root, never an env check inside `lib` — and every mock run is flagged `isMock` so fake data can't pollute the real longitudinal stats.

## Verification

1. Unit tests (colocated, vitest): all 18 aliases through `align-params`; **drift guard** — for every model × every unsupported capability, assert `buildGenerateBody` throws *and* align-params reports it dropped; closed-vocabulary error classification; cost-basis derivation from `falPricing.unit`; percentile math; safe-attribute rejection of URLs and prompt-shaped values; ported `wrapper-purity.test.ts` over `bench-mastra`; a `registry.test.ts` pinning the workflow list; budget **inequality** tests (per-step timeouts must sum inside the run deadline).
2. Dry-run all 18 over HTTP — inspect aligned bodies. Zero spend.
3. `BENCH_MOCK=1` full pipeline: workflow executes, spans land, DB writes, images, judge stub, UI. Zero fal spend.
4. `pnpm check` green (build → typecheck → lint → test), plus `pnpm boundaries`.
5. First paid run, explicit approval: `flux-fast` + `grok-image`, 1 sample ≈ **$0.023**, then judge them ≈ $0.07 — verifies fal auth, provider timing, download, per-MP refinement, spans in Studio, Langfuse. Then the full sweep: 18 models × 1 sample ≈ **$1.17** + ~$0.60 judging, against a `maxEstimatedCostUsd` cap.

## Phases

0. **Toolchain bump** — Node 24, pnpm 11 + catalogs, oxlint/oxfmt, tsconfig presets, turbo tags. Separate commit; `pnpm check` green.
1. **Scaffold** — `bench-env`, `bench-db` (schema + push), Next app boots, `pnpm check` green.
2. **Domain core** — align-params, routes manifest, cost ledger, error taxonomy, aggregate + tests. Pure, no I/O beyond fal/disk in `execute.ts`.
3. **Mastra** — instance, observability, safe-attributes, `benchmark-run` workflow, purity + registry tests. Mock executor only.
4. **App** — composer, dry-run preview, run page, grid/table/scatter, history.
5. **Judge** — vision judge, `judge-run` workflow, manual ratings, value views.
6. **Polish** — Studio app, cohort history percentiles, README recording measured results, first paid runs.

## Decision log

**2026-08-03 — expert review** (lee-nextjs-engineer, daniel-product-engineer, senior-engineer, architecture-engineer, data-engineer), then re-planned for Mastra orchestration.

Applied: SSE dropped entirely in favour of `startAsync()` + React Query polling (EventSource cannot POST; polling is refresh- and restart-safe); explicit `force-dynamic` since turbo's `test` depends on `build`; timeout fallback for the 6 models lacking `p95Seconds`; try/catch around `buildGenerateBody` plus the drift-guard test (`validateGenerateOptions` is not exported); `cost_basis` from `falPricing.unit`; integer micros instead of bigint; Zod parse of jsonb on read; single-writer run finalisation with a guarded status transition; stale-run reconciliation (now via Mastra `listActiveWorkflowRuns()`/`restart()`); percentile queries filtered to `completed | partial`; `isMock` flag; mock injected at the composition root; judge states (`not-run`/`inconclusive`/manual) as first-class UI states; server-side auto-judge so it survives a refresh; `next/image` `sizes` for thumbnails and `unoptimized` full-res; Drizzle `push` replacing the hand-rolled SQL migration + tracker.

Decided: concurrency defaults to **1** — "Fastest" is a headline answer, so the default must be the trustworthy one; contended runs are badged. Judge is a plain domain module, **not** a Mastra `createScorer` — scorer judge steps are text-prompt shaped and multimodal input is undocumented, and materialdesk independently reached the same conclusion. Mastra **does** take `PostgresStore` here (unlike `@desk/mastra`, which is deliberately storage-less) because runs are long and expensive and must survive a restart.

Open: whether oxlint produces a manageable diff across the existing CLI/SDK packages in Phase 0 — unknowable until run.
