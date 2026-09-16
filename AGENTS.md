# Motif

Motif is the public SDK and CLI for image and video work on fal.ai, organised by Task: the caller says what to do and Motif chooses the Model. This repo is public.

`apps/cli/AGENTS.md` is the detailed CLI operating guide - read it before changing CLI behaviour or driving the CLI in anger. `CONTEXT.md` holds the domain language (Task, Model, Tier, Source, Reference, Series, Look, Mood), and `docs/adr/0001-tasks-replace-models.md` records why the surface is by Task.

## Packages

- `apps/cli` - `@howells/motif-cli`, the `motif` command and terminal Studio.
- `packages/motif-sdk` - `@howells/motif-sdk`, the canonical Node SDK: Task rankings, Model resolution and fal request normalisation.

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

Generations cost real money ($0.003 to $0.30 an image; video is 5-10x that). Per-Task flags and modes, override Model prices, error codes and the Series workflow are in `apps/cli/AGENTS.md` and `apps/cli/docs/`.

### What do you want to do?

One verb per Task. The last column is the same advice `motif --describe tasks` gives.

| Task | Command | Instead, when |
| --- | --- | --- |
| Make an image from a prompt, or change one passed with -e | `motif "prompt"` | Variations of an image you already have (vary), or a consistent set of images (series run). |
| Give an image a house look and light | `motif "prompt" --look <id> [--mood <id>]` | Keeping one style, with references, across many images (series create --look). |
| Variations of an image | `motif vary [image]` | A specific change to an image described in words (generate with a reference), or a set of different scenes in one style (series run). |
| Remove something and fill the gap | `motif erase "what" [image]` | The whole background (cutout), or extending the canvas (reframe). |
| Remove the background | `motif cutout [image-or-video]` | Taking one object out and filling the gap (erase), or masking a named thing (segment). |
| Extend to a new aspect ratio | `motif reframe [image] --og` | A new image at a given ratio (generate with a ratio). |
| Make it larger | `motif upscale [image-or-video]` | Fixing noise, softness or colour without changing the size (restore). |
| Fix noise, blur, damage or colour | `motif restore [image]` | Making an image larger (upscale). |
| Relight a photo | `motif relight [image] "light"` | Regenerating the scene in a new light (generate with a mood). |
| Redraw in a reference's style | `motif restyle [image] --like <image>` | A house style kept across images (generate with a look). |
| Mask a named thing | `motif segment "what" [image-or-video]` | The background behind the subject (cutout), or boxes without masks (ask detect). |
| Caption, count, find or ask | `motif ask "question" [image]` | Pixel masks of a named thing (segment). |
| Split into transparent layers | `motif layers [image]` | Masking one named thing (segment), or removing the background (cutout). |
| Trace to a clean SVG | `motif vectorize [image]` | Drawing a new image from a prompt (generate). |
| Depth, edge, normal or pose map | `motif map [image]` | Masks of a named thing (segment), or PBR material maps (material). |
| PBR maps from a surface photo | `motif material [image]` | A seamless texture without PBR maps (tile), or depth and normals of a scene (map). |
| A seamlessly tiling texture | `motif tile "prompt" [image]` | PBR maps of a surface (material). |
| A textured 3D mesh | `motif mesh [image] [--rig]` | A flat image of an object (generate), or depth of a scene (map). |
| Dress a person in a garment | `motif try-on [image] --garment <image>` | Changing clothes by description (generate with a reference). |
| Turn an image into a video | `motif animate "prompt" [image]` | A still image (generate), or variations of one (vary). |
| A captioned contact sheet | `motif sheet <images...>` | Making the images (generate or series run), or combining images into one new picture (generate with several -e). |
| A consistent set from a theme | `motif series run "theme"` | One image (generate), several takes of the same prompt (generate with -n), or variations of an image (vary). |
| A reusable style and references | `motif series <subcommand>` | A one-off themed set (series run creates or reuses a series for you), or a house register for one image (generate with --look). |
| The interactive terminal Studio | `motif studio` | Agents and scripts, which call the commands directly with --format json. |

```bash
motif --describe tasks --format json                       # which verb does which job
motif --describe erase --format json                       # one Task: flags, modes, output fields
motif "a cat" --og --dry-run                               # choose the Model and price it, no key needed
motif "a cat" --tier fast --no-open --fields images,cost
motif erase "the parked car" street.jpg --tier quality --dry-run
echo '{"prompt":"a cat","tier":"fast","preset":"og"}' | motif --dry-run   # stdin JSON; flags override it
motif --history --limit 10 --fields id,prompt,model,cost
motif series run "brutalist architecture" --count 6 --dry-run --format json
```

- Always `--dry-run` first, always `--no-open` in a pipeline, and always `--fields` to keep output small.
- Let Motif choose the Model. `--tier fast|balanced|quality` trades cost for quality; `-m <model>` is an override for when a specific Model is needed, and `--param key=value` (Model-only request fields) needs it. Every Task's override Model ids, best-ranked first, are in `models` in `motif --describe tasks --format json` (prices in `apps/cli/docs/costs.md`); don't hardcode Model or taxonomy ids.
- `--rmbg`, `--up`, `--vary`, `--video`, `enhance` and `tool` are gone and exit `2` with `REMOVED_COMMAND` naming the verb.
- Output paths must stay inside the git root of the current directory (or the current directory outside a repo); anything else fails with `INVALID_OUTPUT_PATH`. Human output carries ANSI and spinners - parse JSON, never the human format.
- Exit codes are semantic: `2` bad input, `3` auth, `4` not found, `5` upstream fal failure.

## Architecture rules

- Dependencies flow toward `packages/motif-sdk`. Never import CLI, local history, or filesystem helpers into the SDK.
- Keep fal endpoint normalisation and model metadata in `packages/motif-sdk`.
- Keep local paths, downloads, history, and terminal UX in `apps/cli`.

## Public surface

- SDK Task client, the documented API: `createMotif(config?)` from `@howells/motif-sdk` returns one function per Task (`generate`, `erase`, `upscale` and the rest), plus `plan(task, input)` to resolve the Model, build the request and price it without I/O, and `run(task, input)`. Every call returns a `Result<TaskOutput, MotifError>` with `model`, `tier`, `chosenBy`, `files` and `cost`.
- SDK Task data: `TASKS` (summary, notFor, modes and ranked Models with Tiers per Task), `TASK_IDS`, `TIERS`, and `resolveTask`, the pure function that chooses a Model.
- `FalClient`, `MODELS`, `FAL_TOOLS` and the other model-keyed exports are no longer exported.
- SDK image layer: `@howells/motif-sdk/image` (ESM-only subpath). `createMotifImage(config?)` carries provider requests (`generate()`, `edit()`) over google, openai, replicate and fal with per-call cost tracking; it doesn't choose Models.
- Discovery: `README.md`, `llms.txt`, `apps/cli/docs/`, `docs/security.md`, `docs/surface/`.

## Environment

`FAL_KEY` is the primary public Motif variable, used by `createMotif` and the CLI. The CLI can also read `apiKey` from `~/.motif/config.json`; environment values win.

`@howells/motif-sdk/image` reads one key per adapter: `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `REPLICATE_API_TOKEN`, and `FAL_KEY`. Each is optional per call - only the key for the provider in use is required - and each falls back from `MotifImageConfig` overrides to the env var.

## Ask first

- Installing dependencies, publishing packages, changing package names, versions, or public exports.
- Running live fal canaries or anything else that spends credits.
- Changing GitHub repo visibility or deleting remote repositories.

Never print or commit a real API key, and never copy private Studio code, private service dependencies, database details, canvas implementation details, or private web app references into this public repo. Don't reintroduce private web app directories or private Studio topology docs. Preserve the strict package `files` allowlists and run `npm pack --dry-run` before publishing changes.

## Checks and deploys run locally

There is no GitHub Actions on this repo and nothing runs in CI. Every check, build, release and deploy happens on this machine. Run `pnpm check` before pushing. Deploy the site from the repo root:

```bash
vercel pull --yes --environment=production && vercel build --prod && vercel deploy --prebuilt --prod
```

## Releases

Releases are published from this machine. npm needs a logged-in user (`npm whoami`) or a token in the local environment.

Packaging uses `pnpm pack` and publishing uses `npm publish`, and that split is load-bearing. `@howells/motif-cli` depends on `@howells/motif-sdk` as `workspace:*`; only pnpm rewrites that to a real version, and `npm pack` ships the literal string, making the release uninstallable. It sank 1.8.0, now deprecated on the registry. Check the packed `package.json` for a surviving `workspace:` before publishing, because `npm pack --dry-run` does not catch it.

Publish in dependency order, the SDK first, because the CLI resolves a real published SDK version.

```bash
# bump the version in each package.json, then from the repo root:
pnpm build
pnpm check

pnpm --filter @howells/motif-sdk pack --pack-destination /tmp
tar -xzOf /tmp/howells-motif-sdk-<version>.tgz package/package.json | grep '"workspace:' && echo STOP
npm publish /tmp/howells-motif-sdk-<version>.tgz --access public

pnpm --filter @howells/motif-cli pack --pack-destination /tmp
tar -xzOf /tmp/howells-motif-cli-<version>.tgz package/package.json | grep '"workspace:' && echo STOP
npm publish /tmp/howells-motif-cli-<version>.tgz --access public
```

npm refuses a version already on the registry, so re-running after a partial failure is safe. Afterwards check `npm view @howells/motif-cli@<version> dependencies` shows a real SDK version rather than `workspace:*`.

## Agent skills

### Issue tracker

Issues live in **Linear**, team `MOT` in the `howells` workspace - not GitHub, which has none. Reach it through the GraphQL API, never the Linear MCP (it is connected to a different workspace). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, unchanged: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. All already exist in the workspace. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
