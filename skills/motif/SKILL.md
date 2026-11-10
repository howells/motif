---
name: motif
description: Generate and edit images, cut out backgrounds, upscale, animate stills into video and make consistent image series on fal.ai with the Motif CLI. Use for AI image or video work from the command line, or Motif by name. Not for screenshots, charts or diagrams.
---

# Motif

Motif picks a Model for the Task you ask for. The installed CLI's schema is the source of truth for commands, flags, models and prices.

- **Dry-run before spending.** Run the exact command with `--dry-run` first and check the Model and price. Get approval for the paid run unless the user has already authorised its scope and spend. `cost: null` means unknown, not free; video and 3D cost far more than stills.
- **Resolution names are tiers, not pixels.** What `-r 2K` means depends on the Model; `--dry-run` shows `size` when Motif asks for an exact one (null when the Model decides), and `--describe <task>` lists each Model's `sizing`. Check before an exact need.
- **Images are PNG unless you ask otherwise** (`--output-format jpeg|webp`, or `-o` ending `.jpg`/`.webp`). Convert afterwards for anything else.
- **Don't resubmit a slow request.** A second submission can charge again.
- **Pass source images explicitly.** Omitting one can silently use the last generation from another workflow.
- **Look at the result** (open the image, play the video) before reporting success. Give its path and cost, and keep a plan distinct from a finished generation.
- **Never print `FAL_KEY`** or write it into files.

## Setup

The CLI is `@howells/motif-cli`; this skill doesn't install it. If `motif` is missing and installing is authorised, run `npm install -g @howells/motif-cli`. Live calls need `FAL_KEY`; dry runs don't. `motif studio` is interactive; call commands directly instead.

Before building a task's command, read its schema:

```bash
motif --describe tasks --format json
motif --describe <task> --format json
```

## Tasks

- New image, or a described edit with `-e <reference>`: `motif "prompt"`
- Variations: `vary`
- Remove an object: `erase`; the background: `cutout`; isolate a named thing: `segment`
- Extend the canvas: `reframe`; enlarge: `upscale`; fix noise, blur or colour: `restore`
- Lighting: `relight`; a reference's style: `restyle`
- Caption, read, count or ask about an image: `ask`
- Transparent layers: `layers`; SVG: `vectorize`; depth, edge, normal or pose: `map`
- PBR maps: `material`; seamless texture: `tile`; 3D mesh: `mesh`
- Garment on a person: `try-on`; still to video: `animate`
- A consistent set from a theme: `series run`; a reusable style with references: `series`
- Contact sheet of existing images: `sheet`

Let Motif choose the Model and set the trade-off with `--tier fast|balanced|quality`. When the user names a Model, pass `-m` with an ID from the schema, never a fal endpoint. Model-specific options go in `--param key=value` and need `-m`.

## Run

```bash
motif "a ceramic desk lamp on an oak desk" --tier balanced --dry-run --format json --fields model,cost,costBasis
motif erase "the cable" lamp.png --dry-run --format json --fields model,cost,costBasis
motif series run "brutalist architecture" --count 6 --dry-run --format json
```

- Use `--format json` and pick fields with `--fields`; don't parse human output.
- Save outputs inside the repository's Git root (or the current directory outside one), at a new path so the source survives. For a Task verb (not `generate`, `vary` or `series`), an output ending in `/` saves every returned file and any other path saves the primary file. `generate` and `vary` write files, not directories: with several images `-o a.png` names them `a-1.png`, `a-2.png`. Nothing opens in a viewer unless you pass `--open`.
- Generation and variation return `images[].path`. Other tasks return `path` for the primary file and `files[].path` for every file written; `ask` returns data and no file. A dry run reports `output`, where the file would go, not a file that exists.

Errors are JSON on stderr. Exit codes: `2` bad input, `3` authentication, `4` not found, `5` provider failure.

## Series, Looks and Moods

A Series holds related scenes that share a style and references; read `motif series --help` and the subcommand's help before planning one. A Look (`--look`) is Motif's house register and a Mood (`--mood`) sets its light; list IDs in the schema. A Look can choose its own Model, overriding the Tier. A user's own reusable visual identity belongs in a Series, not a Look.

For longer Series workflows, read the [Series guide](https://github.com/howells/motif/blob/main/apps/cli/docs/series.md). For Node integration, use the [SDK README](https://github.com/howells/motif/blob/main/packages/motif-sdk/README.md).
