# motif

Image generation and editing on fal.ai: a CLI organised by Task (`apps/cli`, `@howells/motif-cli`), the SDK (`packages/motif-sdk`), the docs site (`apps/docs`) and the bench app (`apps/bench` plus `packages/bench-*`). Specs and outstanding work live in Linear (howells, MOT): [project documentation](https://linear.app/howells/document/motif-project-documentation-8f35c5aa5226).

```sh
pnpm build && pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @howells/motif-sdk test   # focused SDK tests
pnpm dev                                # CLI; bench runs on 4400, docs on 4500
```

- Real model calls spend fal credits. Use `--dry-run` first; `scripts/run-demos.mjs` only spends with `--confirm`.
- `apps/cli/AGENTS.md` is the CLI's guide for agents that use it; keep it accurate when behavior changes.
- Releases publish from `.github/workflows/release.yml`.
- Don't overwrite other people's uncommitted work.
