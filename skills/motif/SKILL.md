---
name: motif
description: Generate, edit and inspect images, animate stills, and make consistent image series with the Motif CLI on fal.ai. Use when the user asks to use Motif or needs its image and video tasks in a command-line workflow.
---

# Motif

Motif chooses a Model for the Task you request. Use the installed CLI's schema for current commands, flags, models and prices.

## Discover the installed CLI

The CLI is supplied by `@howells/motif-cli`. If `motif` is missing, install it with `npm install -g @howells/motif-cli` when installation is authorised. Installing this skill does not install the CLI.

```bash
motif --describe tasks --format json
motif --describe generate --format json
```

Read `motif --describe <task> --format json` before constructing that task's command. Use `motif <verb> --help` for flag syntax. Agents should call commands directly; `motif studio` is interactive.

Live calls need `FAL_KEY`; some transparency routes need `OPENAI_API_KEY`. Dry runs need neither. Never print keys or include them in generated files.

## Choose the task

- New image or a described edit: `motif "prompt"`, with `-e <reference>` for an existing image.
- Variations: `motif vary <image>`.
- Remove an object and fill its place: `erase`; remove the background: `cutout`; isolate a named object: `segment`.
- Extend the canvas: `reframe`; enlarge: `upscale`; repair noise, blur or colour: `restore`.
- Change lighting: `relight`; copy a reference's style: `restyle`.
- Caption, read text, detect or answer a question: `ask`.
- Transparent layers: `layers`; SVG: `vectorize`; scene control maps: `map`.
- Surface PBR maps: `material`; seamless texture: `tile`; 3D mesh: `mesh`.
- Garment on a person: `try-on`; still image to video: `animate`.
- Related images from one theme: `series run`; a reusable style with references: `series`.
- Local contact sheet from existing images: `sheet`.

Let Motif choose the Model. Use `--tier fast|balanced|quality` for the cost/quality trade-off. If the user names a Model or the task requires one, use `-m <model>` with an ID from the installed schema. Never pass a fal endpoint as the Model ID. Model-specific options use `--param key=value` and require `-m`.

## Plan before spending

Run the exact intended command with `--dry-run` first. Inspect the chosen Model, request and price before making a paid call. Obtain approval for the paid run unless the user has already authorised its scope and spend. A dry run does not authorise a generation.

```bash
motif "a ceramic desk lamp on an oak desk" --tier balanced --dry-run --no-open --format json --fields model,cost,costBasis
motif erase "the cable" lamp.png --dry-run --no-open --format json --fields model,cost,costBasis
motif series run "brutalist architecture" --count 6 --dry-run --no-open --format json
```

Remove `--dry-run` only for an authorised run. `cost: null` means unknown, not free; video and 3D can cost substantially more than still images. Don't retry a slow queued request: a second submission may incur another charge.

## Run and inspect

- Use `--no-open --format json` in automated calls. Select relevant top-level fields with `--fields`; never parse human output.
- Supply source image paths explicitly. Omitting one can silently use the last generation from another workflow.
- Keep outputs within the current repository's Git root, or the current directory outside a repository. Use a new output path to preserve the source. An output ending in `/` saves every returned file; another output path saves the primary file.
- Generation and variation results contain `images[].path`. Other task results use `path` for the primary file and `files[].path` for all files. Dry runs describe planned outputs, not files that exist. Check the task's output schema for series and inspection results.
- Open the returned image or play the returned video before reporting visual success. Include its path and reported cost; distinguish a plan from a completed generation.

Errors are JSON on stderr. Exit codes are `2` for bad input, `3` for authentication, `4` for not found and `5` for provider failure. Read the structured error before deciding whether another call is appropriate. Discover replacements for removed commands through `motif --describe tasks --format json`.

## Consistent sets and creative direction

Use a Series for related scenes sharing a style and references. Inspect `motif series --help` and the relevant subcommand's help before planning a run. A Look is Motif's house visual register; a Mood supplies lighting. Discover current IDs and compatibility through the installed schema. A Look can choose its own Model, overriding the Tier's choice; a user's reusable visual identity belongs in a Series.

For detailed workflows, read the public [CLI guide](https://github.com/howells/motif/blob/main/apps/cli/AGENTS.md) and [Series guide](https://github.com/howells/motif/blob/main/apps/cli/docs/series.md). For programmatic Node integration, use the [SDK README](https://github.com/howells/motif/blob/main/packages/motif-sdk/README.md).
