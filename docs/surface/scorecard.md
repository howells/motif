# Surface Scorecard: Motif

Last audited: 2026-09-10 (full report: `audit-2026-09-10.md`, plan: `plan.md`)

```text
==============================================================================
                           SURFACE SCORECARD
                           Motif
                           2026-09-10
==============================================================================

  1. API Surface          [---]  N/A   No HTTP API surface
  2. CLI Design           [##.]  2/3   Solid JSON/exit-code contract; help hides 10 of 11 commands; no guide ships in the package
  3. MCP Server           [---]  N/A   Retired 2026-08-24
  4. Discovery & AEO      [##.]  2/3   Surfaces list commands and flags, not tasks; the npm package ships no agent guide
  5. Authentication       [##.]  2/3   Carried forward, not re-scored
  6. Error Handling       [##.]  2/3   RFC 7807 envelope intact; the two most-hit errors carry no usable recovery hint
  7. Tool Design          [##.]  2/3   Typed schemas and task fields; no when-to-use, no tool-to-verb link, 71 tools in one list
  8. Context Files        [##.]  2/3   Curated and layered, but the CLI guide is 633 lines with no task index
  9. Multi-Agent          [---]  N/A   Not an agent orchestration system
  10. Testing             [##.]  2/3   Contract fixtures and drift guards; no routing eval, no pass^k
  11. Data Retrievability [---]  N/A   No retrievable knowledge surface

==============================================================================
  TOTAL: 14/21 (scaled: 20/30)
  RATING: Agent-ready

  Human-only        Agent-tolerant      Agent-ready        Agent-first
  0          7      8           14      15        22       23        30
==============================================================================
```

## Changes since 2026-08-24

| Dimension | Before | After | Delta | Why |
| --- | --- | --- | --- | --- |
| CLI Design | 3/3 | 2/3 | -1 | `--help` lists only `studio` under Commands; `AGENTS.md` isn't in the npm `files`, which the 3/3 detection requires |
| Discovery & AEO | 3/3 | 2/3 | -1 | Fails the semantic "capability" layer: surfaces name commands, not tasks, and the verbs had 0 uses in 18 days |
| Authentication | 2/3 | 2/3 | 0 | Not re-scored |
| Error Handling | 3/3 | 2/3 | -1 | `INVALID_OPTION` (206 hits) has a generic suggestion and no capable-model list; `INVALID_OUTPUT_PATH` (64 hits) has none |
| Tool Design | 3/3 | 2/3 | -1 | No when-to-use or disambiguation; no tool-to-verb link; `ask` wrongly marked `mutating` |
| Context Files | 3/3 | 2/3 | -1 | `apps/cli/AGENTS.md` is 633 lines against a 370 tolerance; no task index anywhere |
| Testing | 2/3 | 2/3 | 0 | Still no pass^k; no routing eval |

**Total 19/21 → 14/21, scaled 27/30 → 20/30, Agent-first → Agent-ready.**

The code didn't regress. The August audit scored by reading the implementation. This one scored against usage from 604 agent-run commands: the seven verbs and `series` had 0 uses, 37 calls reached the same tools through `tool run`, about 418 grids were built by hand with ImageMagick, and agents hit 206 `INVALID_OPTION` and 64 output-path errors. The task wording exists in verb descriptions and in the registry's `task` field, but nothing an agent sees first maps a task to a command. The one task-labelled index agents did find, `tool list`, has no pointer back to the verbs.

---

## History

### 2026-08-24

```text
  1. API Surface          [---]  N/A
  2. CLI Design           [###]  3/3   Seven verbs on one kernel; every argument discoverable; exit codes hold on every path
  3. MCP Server           [###]  3/3   (retired the same day; then N/A)
  4. Discovery & AEO      [###]  3/3   README, AGENTS.md, llms.txt, docs/tools with worked examples, doc-sync test
  5. Authentication       [##.]  2/3   FAL_KEY/envy plus documented boundaries
  6. Error Handling       [###]  3/3   RFC 7807 with doc_uri, suggestions and fal request-id, including commander failures
  7. Tool Design          [###]  3/3   71 entries, 386 generated arguments, measured output shape, drift-guarded
  8. Context Files        [###]  3/3   Root AGENTS.md, CLAUDE.md overlay, package AGENTS.md and READMEs
  10. Testing             [##.]  2/3   435 tests plus live-schema drift guards; no statistical eval suite
  TOTAL: 19/21 after MCP retirement (scaled: 27/30) - Agent-first
```

- No score movement from 2026-07-11. Error Handling's July 3/3 was corrected after `motif tool run` with no argument was found exiting 1 with plain text (fixed in MOT-39).
- MCP retired: `@howells/motif-mcp` removed and deprecated on npm. Scope decision; raw total 22/24 → 19/21, scaled unchanged.
- Method note carried into 2026-09-10: exercise failure paths, and ask who is on the other end of each surface.

### 2026-07-11

- Error Handling 2→3: fal's `x-fal-request-id` surfaces as RFC 7807 `instance` (CLI) and `trace_id` (MCP).
- Full type-aware lint enabled across the workspace.

### 2026-05-21

- CLI Design 2→3: error-catalogue statuses map to exit codes 2/3/4/5.
- Discovery & AEO 2→3: creative direction documented; model, error and cost tables pinned by `docs-sync.test.ts`.
- Tool Design 2→3: vary enums derived from `EDIT_CAPABLE_MODELS`; MCP args runtime-validated.
- Testing stays 2/3: agent regression fixtures landed (SURF-7).

### 2026-05-20

- First audit. Agent-ready. Plan SURF-1 to SURF-8, all since completed.
