# Motif

Motif is the public SDK, CLI, and MCP server for fal.ai image, video, editing, and utility endpoints. This repo is public.

`apps/cli/AGENTS.md` is the detailed CLI and MCP operating guide - read it before changing CLI behaviour or driving the CLI in anger. `CONTEXT.md` holds the domain language (Series, Series Run, Reference, Theme, Scene Prompt).

## Packages

- `apps/cli` - `@howells/motif-cli`, the `motif` command and terminal Studio.
- `packages/motif-sdk` - `@howells/motif-sdk`, the canonical Node SDK and fal request normalisation.
- `packages/motif-mcp` - `@howells/motif-mcp`, local stdio MCP tools backed by the SDK.

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

- Always `--dry-run` first, always name `--model` explicitly, always `--no-open` in a pipeline, and always `--fields` to keep output small.
- Model names are short aliases (`gpt`, `banana`, `gemini3`), never fal endpoint strings. Read live ids from `--describe`; don't hardcode taxonomy option ids.
- Output paths are sandboxed to CWD. Human output carries ANSI and spinners - parse JSON, never the human format.
- Exit codes are semantic: `2` bad input, `3` auth, `4` not found, `5` upstream fal failure.

## Architecture rules

- Dependencies flow toward `packages/motif-sdk`. Never import CLI, MCP, local history, or filesystem helpers into the SDK.
- Keep fal endpoint normalisation and model metadata in `packages/motif-sdk`.
- Keep local paths, downloads, history, and terminal UX in `apps/cli`.
- Keep MCP handlers thin and backed by SDK methods or read-only local history helpers.

## Public surface

- SDK image layer, the primary image API: `@howells/motif-sdk/image` (ESM-only subpath). `createMotifImage(config?)` returns a client with `generate()` (text to image) and `edit()` (multi-image plus optional mask) over four providers - google, openai, replicate, fal - each returning `Result<MotifImageResult, MotifError>` with per-call cost tracking. This is THE documented way to generate and edit images.
- SDK: `FalClient` for fal-specific extras (upscale, background removal, video, utility tools, queue, upload), plus `buildGenerateBody`, model metadata, and Result-returning methods.
- MCP: stdio server exposing generate, upscale, remove background, vary, history, and read-only registry resources.
- Discovery: `README.md`, `llms.txt`, `docs/security.md`, `docs/surface/`.

## Environment

`FAL_KEY` is the primary public Motif variable, used by `FalClient`, the CLI, and MCP. The CLI can also read `apiKey` from `~/.motif/config.json`; environment values win.

`@howells/motif-sdk/image` reads one key per adapter: `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `REPLICATE_API_TOKEN`, and `FAL_KEY`. Each is optional per call - only the key for the provider in use is required - and each falls back from `MotifImageConfig` overrides to the env var.

## Ask first

- Installing dependencies, publishing packages, changing package names, versions, or public exports.
- Running live fal canaries or anything else that spends credits.
- Changing GitHub repo visibility or deleting remote repositories.

Never print or commit a real API key, and never copy private Studio code, private service dependencies, database details, canvas implementation details, or private web app references into this public repo. Don't reintroduce private web app directories or private Studio topology docs. Preserve the strict package `files` allowlists and run `npm pack --dry-run` before publishing changes.

Always publish with `pnpm publish`, never `npm publish`. `@howells/motif-cli` depends on `@howells/motif-sdk` as `workspace:*`, and only pnpm rewrites that to a real version on publish; `npm publish` ships the literal `workspace:*` and the release is uninstallable. `npm pack --dry-run` does not catch this - it leaves the protocol in place too - so confirm a release with `npm view @howells/motif-cli@<version> dependencies`. This sank 1.8.0, now deprecated on the registry.
