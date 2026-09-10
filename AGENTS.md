# Motif

Motif is the public SDK and CLI for fal.ai image, video, editing, and utility endpoints. This repo is public.

`apps/cli/AGENTS.md` is the detailed CLI operating guide - read it before changing CLI behaviour or driving the CLI in anger. `CONTEXT.md` holds the domain language (Series, Series Run, Reference, Theme, Scene Prompt).

## Packages

- `apps/cli` - `@howells/motif-cli`, the `motif` command and terminal Studio.
- `packages/motif-sdk` - `@howells/motif-sdk`, the canonical Node SDK and fal request normalisation.

## Commands

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test    # or: pnpm check
pnpm --filter @howells/motif-sdk test                     # focused
```

Run the narrow package test first, then `pnpm check` before declaring a code change done. For docs-only changes, run `git diff --check` and inspect package `files` allowlists if published files changed.

Fal canaries spend credits and are opt-in:

```bash
RUN_FAL_CANARY=1 pnpm --filter @howells/motif-sdk test -- tests/fal-canary.test.ts
```

## Using the CLI

Generations cost real money ($0.003 to $0.30 an image; video is 5-10x that). Full flags, models, costs, error codes, and Series workflow are in `apps/cli/AGENTS.md`.

```bash
motif --describe --format json          # live schema: models, presets, enums, error catalogue
motif --dry-run "a cat" -m gpt --og     # validate and price before spending
motif "a cat" -m flux-fast --no-open --fields id,path,cost
echo '{"prompt":"a cat","model":"gpt","preset":"og"}' | motif   # stdin JSON; flags override it
motif --history --limit 10 --fields id,prompt,model,cost
motif series run "brutalist architecture" --count 6 --dry-run --format json
```

- Always `--dry-run` first, name `--model` explicitly (except with `--look`, which picks its own model, so leave `-m` out unless you mean to override it), always `--no-open` in a pipeline, and always `--fields` to keep output small.
- Model names are short aliases (`gpt`, `banana`, `gemini3`), never fal endpoint strings. Read live ids from `--describe`; don't hardcode taxonomy option ids.
- Output paths must stay inside the git root of the current directory (or the current directory outside a repo); anything else fails with `INVALID_OUTPUT_PATH`. Human output carries ANSI and spinners - parse JSON, never the human format.
- Exit codes are semantic: `2` bad input, `3` auth, `4` not found, `5` upstream fal failure.

## Architecture rules

- Dependencies flow toward `packages/motif-sdk`. Never import CLI, local history, or filesystem helpers into the SDK.
- Keep fal endpoint normalisation and model metadata in `packages/motif-sdk`.
- Keep local paths, downloads, history, and terminal UX in `apps/cli`.

## Public surface

- SDK image layer, the primary image API: `@howells/motif-sdk/image` (ESM-only subpath). `createMotifImage(config?)` returns a client with `generate()` (text to image) and `edit()` (multi-image plus optional mask) over four providers - google, openai, replicate, fal - each returning `Result<MotifImageResult, MotifError>` with per-call cost tracking. This is THE documented way to generate and edit images.
- SDK: `FalClient` for fal-specific extras (upscale, background removal, video, utility tools, queue, upload), plus `buildGenerateBody`, model metadata, and Result-returning methods.
- Discovery: `README.md`, `llms.txt`, `docs/security.md`, `docs/surface/`.

## Environment

`FAL_KEY` is the primary public Motif variable, used by `FalClient` and the CLI. The CLI can also read `apiKey` from `~/.motif/config.json`; environment values win.

`@howells/motif-sdk/image` reads one key per adapter: `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `REPLICATE_API_TOKEN`, and `FAL_KEY`. Each is optional per call - only the key for the provider in use is required - and each falls back from `MotifImageConfig` overrides to the env var.

## Ask first

- Installing dependencies, publishing packages, changing package names, versions, or public exports.
- Running live fal canaries or anything else that spends credits.
- Changing GitHub repo visibility or deleting remote repositories.

Never print or commit a real API key, and never copy private Studio code, private service dependencies, database details, canvas implementation details, or private web app references into this public repo. Don't reintroduce private web app directories or private Studio topology docs. Preserve the strict package `files` allowlists and run `npm pack --dry-run` before publishing changes.

Releases go through `.github/workflows/release.yml`, never from a laptop. It uses npm Trusted Publishing: GitHub Actions proves the repo's identity over OIDC and npm mints a short-lived token for that one publish, so no npm token exists in the repo, in Actions secrets, or on anyone's machine, and there is no 2FA prompt.

To release: bump the version in `package.json`, merge to `main`, then run the workflow (`gh workflow run release.yml`, or the Actions tab). It publishes only versions the registry does not already have, so re-running after a partial failure is safe.

The workflow packs with pnpm and publishes with npm, and that split is load-bearing. `@howells/motif-cli` depends on `@howells/motif-sdk` as `workspace:*`; only pnpm rewrites that to a real version, and `npm pack` ships the literal string, making the release uninstallable. pnpm in turn has no OIDC support, so it cannot authenticate. The workflow greps the packed `package.json` for a surviving `workspace:` before publishing and reads the published dependencies back afterwards, because `npm pack --dry-run` does not catch this. It sank 1.8.0, now deprecated on the registry.

## Agent skills

### Issue tracker

Issues live in **Linear**, team `MOT` in the `howells` workspace - not GitHub, which has none. Reach it through the GraphQL API, never the Linear MCP (it is connected to a different workspace). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, unchanged: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. All already exist in the workspace. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
