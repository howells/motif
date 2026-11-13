# motif

Image generation and editing on fal.ai: a CLI organised by Task (`apps/cli`, `@howells/motif-cli`), the SDK (`packages/motif-sdk`), the docs site (`apps/docs`) and the homepage (`apps/bench`, the Next app that serves `/` and mounts the docs under `/docs`).

```sh
pnpm build && pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @howells/motif-sdk test   # focused SDK tests
pnpm dev                                # CLI; homepage runs on 4400, docs on 4500
```

- Real model calls spend fal credits. Use `--dry-run` first; `scripts/run-demos.mjs` only spends with `--confirm`.
- `apps/cli/AGENTS.md` is the CLI's guide for agents that use it; keep it accurate when behavior changes.
- Releases publish from `.github/workflows/release.yml`.
- Don't overwrite other people's uncommitted work.

## Agent skills

### Issue tracker

Linear, workspace `howells`, team `MOT`. See `~/Sites/home/docs/agents/issue-tracker.md`.

### Triage labels

Default triage labels. See `~/Sites/home/docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `~/Sites/home/docs/agents/domain.md`.
