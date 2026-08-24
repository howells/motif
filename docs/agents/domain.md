# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring
the codebase.

Motif is **single-context**: one glossary at the root covers the SDK and the CLI, which
share a vocabulary.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root - the domain glossary (Series, Series Run, Reference,
  Theme, Scene Prompt).
- **`docs/adr/`** - read ADRs that touch the area you're about to work in.

If any of these don't exist, **proceed silently**. Don't flag their absence; don't suggest
creating them upfront. `/domain-modeling` creates them lazily when terms or decisions
actually get resolved.

## File structure

```
/
├── CONTEXT.md
├── docs/adr/
└── packages/, apps/
```

`apps/bench` carries a separate vocabulary of its own (run, attempt, judgment, engine,
preset). It is deliberately not in `CONTEXT.md`: bench is an internal benchmarking
harness, not part of Motif's published domain. If that ever needs a glossary, that is the
moment to reconsider multi-context - not before.

## Use the glossary's vocabulary

When your output names a domain concept - an issue title, a refactor proposal, a
hypothesis, a test name - use the term as defined in `CONTEXT.md`, and respect its
_Avoid_ list. "Batch" instead of **Series Run**, or "prompt" where **Scene Prompt** is
meant, is the drift the glossary exists to stop.

If the concept you need isn't in the glossary yet, that's a signal - either you're
inventing language the project doesn't use (reconsider) or there's a real gap (note it
for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently
overriding:

> _Contradicts ADR-0007 (event-sourced orders) - but worth reopening because…_

## Related repo docs

Not domain docs, but the same "read before you theorise" rule applies:

- `AGENTS.md` - architecture rules, public surface, release process. `CLAUDE.md` is a
  symlink to it.
- `apps/cli/AGENTS.md` - the detailed CLI operating guide.
- `docs/surface/` - agent-readiness audits and the running scorecard.
