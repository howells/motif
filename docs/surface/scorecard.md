# Surface Scorecard: Motif

Last audited: 2026-08-24

```text
==============================================================================
                           SURFACE SCORECARD
                           Motif
                           2026-08-24
==============================================================================

  1. API Surface          [---]  N/A   No HTTP API surface
  2. CLI Design           [###]  3/3   Seven verbs on one kernel; every argument discoverable; exit codes hold on every path
  3. MCP Server           [###]  3/3   8 tools, motif://tools/{id} template, shared envelope, arg validation
  4. Discovery & AEO      [###]  3/3   README, AGENTS.md, llms.txt, docs/tools with worked examples, doc-sync test
  5. Authentication       [##.]  2/3   FAL_KEY/envy plus documented boundaries; no rotation or richer config validation
  6. Error Handling       [###]  3/3   RFC 7807 with doc_uri, suggestions and fal request-id - now including commander failures
  7. Tool Design          [###]  3/3   71 entries, 386 generated arguments, measured output shape, drift-guarded
  8. Context Files        [###]  3/3   Root AGENTS.md, CLAUDE.md overlay, package AGENTS.md and READMEs
  9. Multi-Agent          [---]  N/A   Not an agent orchestration system
  10. Testing             [##.]  2/3   435 tests plus live-schema drift guards; no statistical eval suite
  11. Data Retrievability [---]  N/A   No retrievable knowledge/RAG surface

==============================================================================
  TOTAL: 19/21 (scaled: 27/30)
  RATING: Agent-first

  Human-only        Agent-tolerant      Agent-ready        Agent-first
  0          7      8           14      15        22       23        30
==============================================================================
```

## Changes since 2026-05-21

- CLI Design 2→3: SURF-5 shipped — error-catalog statuses map to exit codes 2/3/4/5, documented in apps/cli/AGENTS.md.
- Discovery & AEO 2→3: creative direction documented across all discovery surfaces; model/error/cost tables regenerated from SDK exports and pinned by docs-sync.test.ts.
- Tool Design 2→3: vary enums derive from EDIT_CAPABLE_MODELS in CLI and MCP; MCP args are runtime-validated (numImages guardrail, enum checks, spec-legal zero-arg calls).
- Testing stays 2/3: agent regression fixtures landed (SURF-7), suite grew 99→159 CLI tests; a scored eval dataset remains the gap to 3.
## Changes since 2026-07-11

- Error Handling 2→3: SURF-5 completed — fal's `x-fal-request-id` now surfaces as RFC 7807 `instance` (CLI) and `trace_id` (MCP) on fal-originated failures.
- Full type-aware lint enabled across the workspace (667 findings cleared); Studio settings save failures now surface.

## MCP retired, 2026-08-24

`@howells/motif-mcp` was removed from the repo and deprecated on npm. It scored 3/3 the
same day, so this is a scope decision rather than a quality one: the package's only real
audience was clients with no shell, and every capability it exposed is reachable through
the CLI, which is agent-first by design. Raw total drops 22/24 → 19/21 as a dimension
becomes N/A; the scaled score and rating are unchanged.

## Remaining (deliberate, not gaps in scope)

The two open points require product direction, not gold-plating:
- **Authentication 2→3**: auth is documented; a 3/3 would mean richer config validation, more credential sources, or key-rotation guidance — undefined without a concrete goal.
- **Testing 2→3**: a scored agent-eval dataset is a separate ongoing initiative, not a finishing touch.

## Changes since 2026-07-11

**No score movement, and that is the correct result.** The registry tripled, seven CLI verbs shipped, MCP grew from five tools to eight, and every argument and output shape became discoverable - all in dimensions already at 3/3. See `audit-2026-08-24.md`.

**One correction to the previous audit.** Error Handling was scored 3/3 in July and should not have been: `motif tool run` with no argument exited **1** with plain text even under `--format json`, bypassing the RFC 7807 envelope entirely. The path was never tested and never scored, because scoring read the implementation and Commander's failure path sat upstream of it. Fixed (MOT-39); the 3/3 is now real.

**Method note for the next audit:** exercise each dimension's failure path, not only its happy path. One command per error class with the exit code checked would have caught this in July.
