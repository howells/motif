# Handoff — Motif Bench

**Date:** 2026-08-05 · **Branch:** `main` (pushed) · **Live:** motif.danielhowells.com

## Do this first

**Look at the UI.** `pnpm --filter @motif/bench-web dev` → localhost:4400.

Three rounds of visual fixes landed but **nobody has seen the result** — the
previous session's browser extension disconnected mid-work and the agent making
the fixes never produced a screenshot despite three requests. The code reads
correctly and gates pass; whether it *looks* good is unverified. Assume nothing.

This exact gap — green gates over an unseen screen — caused every UI defect in
this project. Verify by looking, at 1440×900 and 390×844, on the populated
24-model run (not an empty state).

## Production bugs — one fixed, one open

Both surfaced from asking "what happens on Vercel?", not from any check.

### 1. Every image 404s in production — FIXED 2026-08-05

Images now go to a **private** Vercel Blob store (`motif-bench-images`,
`store_AtQrX9D4ZmyUK4CV`, iad1), linked to the project with
`BLOB_READ_WRITE_TOKEN` set for all three environments.

`bench_samples.image_path` holds either an absolute filesystem path (a local run
with no token — unchanged, and still right for a throwaway sweep) or a Blob
pathname `runs/<runId>/<alias>-<idx>.<ext>`. Blob keys are relative and local
paths absolute, so no discriminator column was needed. Private rather than
public, so `/api/image/**` remains the only way in — which is why no stored
`imageUrl` changed and the contact sheet needed no edit.

**Images from runs before this date are still 404 in production.** They live on
a disk Vercel never had; nothing migrates them. Re-run to repopulate.

### 2. Background work is killed in production

`runDetached` (`apps/bench/lib/runs/db-store.ts`) is a bare floating promise with
no `waitUntil` anywhere in the app. Serverless freezes the instance once the
response is sent, so a run started in production will not reliably finish.
`gpt2` alone took 151s, far past any function budget.

**Fix, and it needs a decision:**
- `waitUntil` from `@vercel/functions` — smallest change, still bounded by the
  function's max duration.
- fal's **queue API** (`submitGeneration`/`getJobStatus`/`getJobResult`, already
  in the SDK; only `gpt2` uses it today) so no request is ever long-lived.

**The catch, which matters:** fal does not return inference timing. Every number
in this benchmark is measured client-side with `performance.now()`. Going
queue-based turns `providerMs` into "queue wait + inference + poll granularity",
degrading the headline speed measurement — which is exactly why `gpt2`'s timings
carry a ±3s badge today. Check whether `JobStatus.logs[]` timestamps can yield
real inference time before committing to that route.

## Non-problem: the timeouts. Real problem: concurrency (fixed)

Zero `TIMEOUT` failures across 78 real samples — the only failures on record are
8 `RATE_LIMITED` and 3 `INTERRUPTED`. The preview table prints `timeout floor` in
the P95 column for the 12 of 24 models with no published `p95Seconds`; it means
"no speed data, using the 90s default". It reads like an error and is not one.
**Reword it.**

The question this answers — "shouldn't generation be async?" — is **no**. Nothing
was timing out; the failures were rate limiting, caused by `concurrency` being
collected, persisted, badged and enforced by *nothing*. A 23-sample run whose
per-sample latencies sum to 584s finished in 153s of wall clock. Going
queue-based would not have fixed that (a queue submits all 24 just as fast) and
would have cost the measurement: fal returns no inference timing, so polling
turns `providerMs` into "queue wait + inference + poll granularity" — which is
why `gpt2` already carries a ±3s badge.

Enforcement landed 2026-08-05 in `lib/runs/pool.ts` + `lib/runs/dispatch.ts`.

**Consequence for the data: every latency recorded before that date is
contended and was never badged as such.** Treat those runs as indicative, not
comparable. A clean sweep at `concurrency: 1` is ~10-12 minutes (the serial sum),
against ~2.5 minutes fully parallel.

**How to run reliably: locally, at `concurrency: 1`.** Not on Vercel — serial
runs blow past any function ceiling, and there is no `waitUntil` anyway. Retry
covers whatever still fails.

## Where things stand

Working, on `main`, deployed:

- **24 models** measured end to end with real fal generations. Fastest
  `flux-fast` 1.3s/$0.003; slowest `gpt2` 151s/$0.21 — 113× slower, 70× dearer.
  Best value `flux2-turbo` 2.4s/$0.008.
- Neon Postgres persistence, verified across a dev-server restart and under
  concurrent writes.
- App shell: no document scroll ≥768px, three `ScrollFrame`s (runs rail, contact
  sheet, table pane), verdicts pinned, images dominant.
- Patternmode theme: warm paper `#fbfbf9`, Inter **450**/14px with
  `cv01 cv02 cv11`, forest `#315c4b` as the only accent, dark image plate.
- Published: `@howells/motif-sdk` 1.1.0, `motif-cli` 1.6.0, `motif-mcp` 0.3.0
  (qwen3 added; `workspace:*` correctly resolved in the published specs).
- Total spend to date: ~$2.50.

## Decisions made — do not relitigate

- **The auto-judge is retired.** Built, measured against a real sweep, removed:
  across 20 judgments it produced 5 distinct verdicts with 14 models
  byte-identical, so "best quality" was a coin toss among a 14-way tie. Later
  work (payload normalisation, pairwise Bradley-Terry ranking) improved it but
  not enough. Quality is **manual star ratings**. The machinery remains in the
  codebase, tested but unreachable from the product path. Do not wire it back in
  without new evidence.
- **The environment carries credentials only** — `DATABASE_URL`,
  `DIRECT_DATABASE_URL`, `FAL_KEY`. No behaviour config. Mock vs live is
  *derived* from which credentials are present (`bench-env/runtime`), so it
  cannot be misconfigured independently of the credentials it needs. A flag
  version of this caused synthetic data to be persisted as real.
- **Default aspect is `1:1`** — the only value where all three sizing dialects
  agree. Any other aspect frames models differently and contaminates comparison.
- **Concurrency defaults to 1** so latency numbers stay trustworthy — and as of
  2026-08-05 it is genuinely enforced (`lib/runs/pool.ts`). For eight weeks it
  was not, which is why the runs recorded before that date are contended.
- **Generation stays synchronous.** See the concurrency section above; the
  timing fidelity is the whole product.

## Traps that have already cost hours

1. **Never `oxlint --fix-dangerously`.** It *fabricates code* — it invented
   `case "1:1": throw ...` in two aspect mappers and `case undefined: throw` in a
   studio switch, all breaking intentional fallthroughs. All three passed
   typecheck and lint; only the test suite caught them.
2. **No sub-agents on a shared working tree, and no write-side git from agents.**
   A sub-agent ran a repo-wide format, self-reverted with `git reset`, and
   destroyed two siblings' work. Twice.
3. **A 200 response does not mean the work happened.** `POST /judge` returned
   `started:true` while doing nothing — twice, for two different reasons (an
   unlinked `sharp` import, then an idempotence guard). Verify by telemetry, not
   by status.
4. **Postgres integer columns are narrower than the data.** `performance.now()`
   floats and fal's unsigned 32-bit seeds both broke writes *after* images had
   been generated and paid for.
5. **Verify where the instrument runs.** curl against an API and a browser
   rendering that API's response are different instruments; only the second is
   the product.

## Files worth reading

| | |
|---|---|
| `docs/design/specs/design-bench-shell.md` | app-shell structure (current) |
| `docs/design/specs/design-bench.md` | Patternmode visual system |
| `docs/arc/bench/BRIEF.md` | verified ground truth + working rules |
| `docs/arc/bench/align-params.kernel.ts` | the solved kernel, drift-guarded |
| `docs/arc/plans/2026-08-03-image-model-benchmark.md` | original plan — **stale**: says 18 models and `MotifServer`, both wrong |
