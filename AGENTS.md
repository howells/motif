# Motif

The public SDK and CLI for image and video work on fal.ai, organised by Task: the caller says what to do and Motif chooses the Model. This repo is public.

- `apps/cli` is `@howells/motif-cli`, the `motif` command and terminal Studio. `packages/motif-sdk` is `@howells/motif-sdk`, the canonical Node SDK: Task rankings, Model resolution and fal request normalisation.
- `apps/cli/AGENTS.md` is the CLI operating guide: which verb does which job, per-Task flags and modes, error codes, the Series workflow. Read it before changing CLI behaviour or driving the CLI in anger.
- `CONTEXT.md` holds the domain language (Task, Model, Tier, Source, Reference, Series, Look, Mood), and `docs/adr/0001-tasks-replace-models.md` records why the surface is by Task.

## Because it is public

Never copy private Studio code, private service dependencies, database details, canvas implementation details or private web app references in here, and don't reintroduce private web app directories or Studio topology docs. Never print or commit a real API key. Preserve the strict package `files` allowlists and run `npm pack --dry-run` before publishing changes.

Ask first before installing dependencies, publishing, changing package names, versions or public exports, running live fal canaries or anything else that spends credits, and changing repo visibility.

## Commands

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @howells/motif-sdk test         # focused, run this first
RUN_FAL_CANARY=1 pnpm --filter @howells/motif-sdk test -- tests/fal-canary.test.ts
```

The canary spends credits and is opt-in. For a docs-only change, run `git diff --check` and inspect package `files` allowlists if published files changed. Deploy the site from the root: `vercel pull --yes --environment=production && vercel build --prod && vercel deploy --prebuilt --prod`.

## Driving the CLI

Generations cost real money, roughly $0.003 to $0.30 an image and five to ten times that for video. `motif --describe tasks --format json` is the live command surface and `motif --describe <task> --format json` covers one Task. Always `--dry-run` first, `--no-open` in a pipeline, `--fields` to keep output small, and let Motif choose the Model rather than hardcoding one. Exit codes are semantic (`2` bad input, `3` auth, `4` not found, `5` upstream fal failure) and removed verbs exit `2` with `REMOVED_COMMAND`. Parse JSON, never the human format.

## More

- [docs/sdk-surface.md](docs/sdk-surface.md) - the SDK's documented API, the CLI-to-SDK dependency direction, and which key each adapter reads.
- [docs/releasing.md](docs/releasing.md) - tag spelling, why the SDK is tagged first, and the `workspace:` specifier check.
- Linear: team MOT (howells).
