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

### What do you want to do?

Pick the command by task. The last column is the same advice `motif --describe tasks` gives.

| Task | Command | Instead, when |
| --- | --- | --- |
| Make an image from a prompt, or edit with -e | `motif "prompt"` | Taking one object out (erase), changing an existing image's ratio (reframe), or a consistent set of images (series run). |
| Give an image a house look and light | `motif "prompt" --look <id> [--mood <id>]` | Keeping one style, with references, across many images (series create --look). |
| Remove an object and fill the gap | `motif erase "what" [image]` | An object with a visible shadow (tool finegrain-eraser), putting something else in the gap (tool bria-genfill), text (tool text-removal), or the whole background (--rmbg). |
| Extend the canvas to a new aspect ratio | `motif reframe --og [image]` | Outpainting by a set margin (tool bria-expand or flux-outpaint), several sizes at once (tool smart-resize), or a new image at a given ratio (generate with -a or a preset). |
| Cut out or mask a named thing | `motif segment "what" [image]` | The background behind the main subject (--rmbg), every region without a prompt (tool sam2-auto), video (tool sam3-video), or boxes without masks (ask --detect). |
| Caption, count, detect or ask about an image | `motif ask "question" [image]` | Transcribing a page of text (tool got-ocr), content moderation (tool nsfw), or pixel masks (segment). |
| Upscale, restore, denoise or sharpen | `motif enhance [image]` | A quick Clarity upscale of the last generation (--up), colourising a black-and-white photo (tool ddcolor), or video (tool topaz-video). |
| Split an image into transparent layers | `motif layers [image]` | Named, z-ordered object layers (tool seedream-layerize), separating text from artwork (tool ideogram-layerize-text), or one masked object (segment). |
| Trace a raster image to a clean SVG | `motif vectorize [image]` | Pixel-faithful tracing with many paths (tool image2svg), or drawing a new image from a prompt (generate). |
| Lay images out on a captioned contact sheet | `motif sheet <images...>` | Making the images (generate or series run), or combining images into one new picture (generate with several -e). |
| Make a consistent set of images from a theme | `motif series run "theme"` | One image (generate), several takes of the same prompt (generate with -n), or variations of the last image (--vary). |
| Keep a reusable style, references and history | `motif series <subcommand>` | A one-off themed set (series run creates or reuses a series for you), or a house register for one image (generate with --look). |
| Other fal utilities: depth, 3D, relight, OCR | `motif tool list` | Anything a command covers. erase, reframe, segment, ask, enhance, layers and vectorize make the same calls and put the saved path at the top level. |
| Open the interactive terminal Studio | `motif studio` | Agents and scripts, which call the commands directly with --format json. |
| Remove the background from the last image | `motif --rmbg` | Taking one object out (erase), masking a named thing (segment), or generating with transparency from the start (generate with --transparent). |
| Make variations of the last image | `motif --vary` | A planned set of different scenes in one style (series run), or a specific change to an image (generate with -e). |

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
