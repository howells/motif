# motif CLI - Agent Integration Guide

> **Security posture**: The agent is not a trusted operator. All inputs are validated. Output paths must stay inside the git root of the current directory (the nearest parent holding `.git`), or the current directory outside a repo. Task verbs write alongside the source image by default. Always use `--dry-run` before mutating commands.

Motif is organised by Task: one verb per job, and Motif chooses the Model that does it. `--tier fast|balanced|quality` trades cost for quality; `-m <model>` overrides the choice.

## Quick Start

```bash
# Which verb does which job, and what to use instead
motif --describe tasks --format json

# One Task's flags, modes and output fields
motif --describe erase --format json

# Dry-run: choose the Model and price the call, no key needed
motif "a sunset over mountains" --og --dry-run --format json

# Generate with JSON output (auto-detected when piped)
motif "a sunset over mountains" --og --no-open | jq .

# A Task verb at a higher Tier
motif erase "the parked car" street.png --tier quality --dry-run --format json

# Raw JSON input via stdin
echo '{"prompt":"a sunset","tier":"fast","preset":"og"}' | motif --dry-run

# History with pagination and field masks
motif --history --limit 5 --fields id,prompt,cost
```

## What do you want to do?

Pick the command by task. The last column is the same advice `motif --describe tasks` gives, and a task word typed as a command (`motif remove "the car" x.png`) fails with `INVALID_OPTION` and `details.didYouMean` naming the right one.

| Task | Command | Instead, when |
| --- | --- | --- |
| Make a new image from a text prompt, or change an image by passing it with -e and describing the result. | `motif "prompt"` | Variations of an image you already have (vary), or a consistent set of images (series run). |
| Give an image a house look and light | `motif "prompt" --look <id> [--mood <id>]` | Keeping one style, with references, across many images (series create --look). |
| Make variations of an image you already have. | `motif vary [image]` | A specific change to an image described in words (generate with a reference), or a set of different scenes in one style (series run). |
| Remove an object, person, text or clutter from an image and fill the gap. | `motif erase "what" [image]` | The whole background (cutout), or extending the canvas (reframe). |
| Remove the background behind the main subject of an image or video. | `motif cutout [image-or-video]` | Taking one object out and filling the gap (erase), or masking a named thing (segment). |
| Extend or recut an image to a new aspect ratio, generating the new edges. | `motif reframe [image] --og` | A new image at a given ratio (generate with a ratio). |
| Make an image or video larger without losing detail. | `motif upscale [image-or-video]` | Fixing noise, softness or colour without changing the size (restore). |
| Fix noise, softness, damage, colour or tone without changing the size. | `motif restore [image]` | Making an image larger (upscale). |
| Change the light in a photo without regenerating it. | `motif relight [image] "light"` | Regenerating the scene in a new light (generate with a mood). |
| Redraw an image in the style of a reference image. | `motif restyle [image] --like <image>` | A house style kept across images (generate with a look). |
| Mask a named thing in an image or video. | `motif segment "what" [image-or-video]` | The background behind the subject (cutout), or boxes without masks (ask detect). |
| Answer a question about an image, caption it, count or find things in it. | `motif ask "question" [image]` | Pixel masks of a named thing (segment). |
| Split an image into transparent layers. | `motif layers [image]` | Masking one named thing (segment), or removing the background (cutout). |
| Trace a raster image to a clean SVG. | `motif vectorize [image]` | Drawing a new image from a prompt (generate). |
| Make a control map of an image: depth, edges, lines, normals or pose. | `motif map [image]` | Masks of a named thing (segment), or PBR material maps (material). |
| Turn a surface photograph into PBR maps: colour, normal, roughness, metalness, height. | `motif material [image]` | A seamless texture without PBR maps (tile), or depth and normals of a scene (map). |
| Make a seamlessly tiling texture. | `motif tile "prompt" [image]` | PBR maps of a surface (material). |
| Make a textured 3D mesh from one image. | `motif mesh [image] [--rig]` | A flat image of an object (generate), or depth of a scene (map). |
| Dress a person in a garment from another image. | `motif try-on [image] --garment <image>` | Changing clothes by description (generate with a reference). |
| Turn a still image into a short video clip. | `motif animate "prompt" [image]` | A still image (generate), or variations of one (vary). |
| Compare several saved images side by side on one captioned grid, from files or the last few generations. | `motif sheet <images...>` | Making the images (generate or series run), or combining images into one new picture (generate with several -e). |
| Make a set of related images that share one style from a single theme, such as six brutalist buildings. | `motif series run "theme"` | One image (generate), several takes of the same prompt (generate with -n), or variations of an image (vary). |
| Keep a named style with reference images, a pinned look and mood, and its own history, so later images match it. | `motif series <subcommand>` | A one-off themed set (series run creates or reuses a series for you), or a house register for one image (generate with --look). |
| Browse, generate and review images interactively in a terminal, as a person rather than a script. | `motif studio` | Agents and scripts, which call the commands directly with --format json. |
| Show the last generation | `motif --last` | Older generations (history). |
| List past generations and spend | `motif --history` | Only the most recent generation (last), or one series' images (motif series history <slug>). |
| Print the CLI schema as JSON | `motif --describe [command]` | The task routing alone (motif --describe tasks). |
| List error codes and how to recover | `motif --describe errors` | The error from a failed call, which already carries its code, details and suggestions on stderr. |

## Agent Invariants

**ALWAYS do these things:**

1. **Always use `--dry-run` first** for any command that calls a Model: `generate`, `vary`, every Task verb, `series gen` and `series run`. Generations cost real money ($0.003 to $0.30 an image; video and 3D cost more). The dry run needs no key and reports `model`, `cost` and `costBasis`.

2. **Always use `--fields`** when you only need specific output fields. Full output includes paths, dimensions, costs, timestamps - most calls only need `path` (or `images`) and `cost`.

3. **Let Motif choose the Model.** Use `--tier` to trade cost for quality. Name a Model with `-m` only when a job needs that one, taking the id from that Task's `models` in `motif --describe tasks --format json` (best-ranked first); prices are in the [cost reference](docs/costs.md). Model-only request fields go through `--param key=value`, which needs `-m`.

4. **Always use `--no-open`** in automated pipelines. The default opens results in a viewer, which will interrupt the agent.

5. **Treat `cost: null` as unknown, not free.** `costBasis: "unknown"` means the price depends on what the call returns (tokens, megapixels, seconds, layers).

**NEVER do these things:**

1. **Never pass fal endpoint strings as model names.** Use `gpt`, not `fal-ai/gpt-image-1.5`.

2. **Keep output paths inside the repo.** Any path under the git root of the current directory is allowed (the current directory itself outside a repo). Anything else, and any `%2e` encoding, is rejected with `INVALID_OUTPUT_PATH`, whose message names the allowed root.

3. **Never rely on the last generation in a pipeline.** Verbs fall back to it when the image is omitted and fail with `NO_PREVIOUS` when there is none; pass the path explicitly.

4. **Never parse human-formatted output.** Always use `--format json` or pipe the command. Human output contains ANSI colour codes, spinner animations, and emoji.

5. **Never send prompts with control characters.** They are stripped during sanitization, which may change the intended meaning.

6. **Never retry a slow queued call.** Topaz, material, layers, mesh and try-on run through fal's queue and can take minutes; every retry is billed.

## Reference

Read these when a task reaches them:

- [Tasks](docs/verbs.md) - every verb's usage, modes and flags, what to use instead, and the removed commands with their replacements.
- [Generate and vary](docs/generate.md) - before building stdin JSON for `generate`, choosing a Tier, overriding the Model, passing several `-e` references, using `--transparent`, or acting on a prompt `warnings` entry.
- [Series](docs/series.md) - before `motif series create`, `gen` or `run`: references, pinned looks and moods, and every Series command.
- [Cost reference](docs/costs.md) - per-Model prices by Task, when overriding with `-m` or budgeting a plan of several calls. Video (`animate`) and 3D (`mesh`) cost far more than an image.
- [Field masks, chaining and pagination](docs/output.md) - when picking `--fields` for a workflow, chaining commands by path, or paging through `--history`.
- [Error catalogue](docs/errors.md) - when you need every error code grouped by source.

## Output Format

motif auto-detects the output context:

| Context                    | Default Format              | Override          |
| -------------------------- | --------------------------- | ----------------- |
| Interactive terminal (TTY) | `human` (colored, spinners) | `--format json`   |
| Piped / redirected         | `json` (one JSON object)    | `--format human`  |
| Streaming large results    | n/a                         | `--format ndjson` |

**The output path is in a different place per family.** Field masks are top-level only, so this matters:

| Family                 | Where the path is | jq                        |
| ---------------------- | ----------------- | ------------------------- |
| `generate`, `vary`     | `images[].path`   | `jq -r '.images[0].path'` |
| Every other Task verb  | `path`            | `jq -r .path`             |
| A Task verb, `-o dir/` | `files[].path`    | `jq -r '.files[].path'`   |

A dry run has no `path` at all - it reports `output`, the path the file _would_ take. Every run also reports `task`, `model`, `tier`, `chosenBy` (`ranking`, `model`, `look` or `pin`), `cost` and `costBasis`.

## Errors

**Always structured errors**: In JSON mode, errors are written to stderr as one object. This is `motif history --dry-run --format json`:

```json
{
  "type": "urn:motif:error:reserved-prompt",
  "title": "Reserved Prompt",
  "status": 400,
  "doc_uri": "motif://describe/errors#reserved-prompt",
  "error": true,
  "code": "RESERVED_PROMPT",
  "message": "Prompt \"history\" matches a motif command word; refusing to generate. Did you mean 'motif --history'?",
  "details": { "didYouMean": "motif --history", "prompt": "history" },
  "is_retriable": false,
  "suggestions": [
    "Use the flag form of the command (e.g. 'motif --history')",
    "To really generate an image from a one-word prompt that matches a command word, pass it via stdin JSON: echo '{\"prompt\":\"history\"}' | motif"
  ]
}
```

Structured errors include an `instance` field (an `urn:fal:request:<id>` URN) when the failure originated at fal, letting agents tie a failure back to fal's dashboard/support.

`RESERVED_PROMPT` (status `400`, exit `2`) fires when the positional prompt is exactly a motif command word (e.g. `motif history` instead of `motif --history`). This protects agents from spending credits on a mistyped command. The error's `details.didYouMean` field carries the corrected invocation. To genuinely generate from such a one-word prompt, pass it via stdin JSON: `echo '{"prompt":"history"}' | motif`.

A request no Model can honour fails with `NO_MODEL_AVAILABLE` (exit `2`): `-m seedream45 -r 4K` reads "seedream45 (model) cannot do resolution.", with `details.blockedBy` naming what stopped it and `details.unblockedBy` what would fix it.

What a code means, whether a retry can help and how to recover: `motif --describe errors --format json`.

### Exit Codes

Structured failures exit with a semantic process code derived from the error's RFC 7807 `status` field. Agents can branch on the exit code without parsing stderr. The mapping is:

| Exit | Meaning | Status | Example error codes |
| --- | --- | --- | --- |
| `0` | Success | - | - |
| `1` | Unknown / unmapped | - | Unstructured crashes; any status outside the ranges below |
| `2` | Invalid input or usage | `4xx` (except `401`/`403`/`404`) | `UNKNOWN_MODEL`, `INVALID_OPTION`, `INVALID_OUTPUT_PATH`, `INVALID_EDIT_PATH`, `INVALID_IMAGE_PATH`, `INVALID_STDIN`, `EMPTY_PROMPT`, `RESERVED_PROMPT`, `REMOVED_COMMAND`, `NO_MODEL_AVAILABLE` |
| `3` | Authentication / authorization | `401`, `403` | `MISSING_API_KEY`, `ACCOUNT_LOCKED` |
| `4` | Resource not found | `404` | `NO_PREVIOUS`, `SERIES_NOT_FOUND` |
| `5` | Upstream (fal) failure | `5xx` | `TASK_FAILED`, `DESCRIBE_FAILED`, `SERIES_CREATE_FAILED`, `SERIES_REF_ADD_FAILED`, `SERIES_REF_REMOVE_FAILED`, `SERIES_GENERATE_FAILED`, `SERIES_DELETE_FAILED`, `TRANSPARENCY_MISSING` |

`NO_MODEL_AVAILABLE` (exit `2`) means no Model can do what the request asks. Its `details` carry `blockedBy` (the capability, `key` or input that stopped it), `unblockedBy` and, when a key would help, `missingKey`. To recover, name a Model with `-m`, set the key, drop the option, or supply the input. A missing `FAL_KEY` is still reported as `MISSING_API_KEY`.

`REMOVED_COMMAND` (exit `2`) means the flag or command was removed; `details.removed` names it and `details.use` names what replaced it. `TASK_FAILED` (exit `5`) is an upstream failure in a Task verb, with `details.task` and `details.model`.

Every structured error still carries the machine-readable `status` field, so the exit code and the JSON envelope always agree. Unstructured crashes (unexpected exceptions the CLI did not classify) still exit `1`.

## Stdin JSON

Flag values override stdin JSON values for the same field. The schema is in [generate and vary](docs/generate.md#stdin-json).

**Task verbs are argv-only.** They route on `argv[0]`, so there is no `"command": "segment"`. An unrecognised `command` value is not rejected - it falls through to `generate`, so `{"command":"segment","prompt":"the bowl"}` silently generates an image of a bowl and bills you for it. Invoke a verb as `motif segment ...`.

## Creative Direction

Creative direction adds house presets to the prompt before the request body is built. There are two fields, applied in this order:

| Field  | CLI flag      | Purpose                                            |
| ------ | ------------- | -------------------------------------------------- |
| `look` | `--look <id>` | The kind of image, plus a default aspect and model |
| `mood` | `--mood <id>` | The light, added after the look                    |

Each option is one or more full sentences. The final prompt is your prompt, then the look, then the mood, joined as sentences: any trailing period is stripped from each part, the parts are joined with `". "`, and the result ends with a period. With no look or mood the prompt is sent unchanged.

### Looks

In `generate`, a look sets the Model and aspect when you gave none. Explicit `-m`/`--model`, `-a`/`--aspect`, a preset flag such as `--og`, or stdin `model`, `aspect` or `preset` always win. A look's Model comes before a pinned Model and the Tier ranking, so `--tier` has no effect with `--look`. Resolution is never changed.

Five looks are flat and take no mood: `plate`, `engraved`, `ephemera`, `canvas` and `object` (`acceptsMood: false` in `--describe`). A mood with one of them fails with `INVALID_OPTION` (exit `2`) on field `mood`, and `details.availableIds` lists the looks that do accept a mood. A mood with no look is valid. `--no-mood` on `generate`, `series gen` and `series run` (or `"mood": null` in stdin `creative`) drops any mood, including a Series' pinned one, so `series gen <slug> "x" --look plate --no-mood` works on a Series pinned to a mood.

The `drawing` look is experimental (`experimental: true` in `--describe`): it works, but its text and defaults may change. Look defaults outrank `tasks.generate.model` and `defaultAspect` in `~/.motif/config.json`; explicit flags and stdin outrank both.

| Look | What it's for | Aspect | Model |
| --- | --- | --- | --- |
| `editorial` | Quiet, materially rich editorial photography | 1:1 | `flux2-pro` |
| `still-life` | Objects and material samples on a plaster ground | 1:1 | `flux2-pro` |
| `lived-in` | Bright, collected rooms that feel lived in | 3:2 | `flux2-pro` |
| `architectural` | Whole rooms with one product installed, to show it at scale | 4:5 | `banana` |
| `homeowner` | Unstyled phone snapshots of real homes | 4:3 | `seedream45` |
| `drawing` | Line and gouache room drawings of a colour scheme (experimental) | 1:1 | `gpt2` |
| `plate` | Flat, edge-to-edge surface photographs for textures and swatches | 1:1 | `flux2-pro` |
| `engraved` | Grey-ink botanical engravings for patterns and backgrounds | 1:1 | `gpt2` |
| `ephemera` | Aged 1940s printed matter where the lettering matters | 2:3 | `ideogram4` |
| `canvas` | Loose abstract paintings on linen | 3:4 | `banana` |
| `portrait` | Natural, unposed documentary portraits; pair with a mood for the light | 1:1 | `seedream45` |
| `object` | One object in one colour on a clean ground | 1:1 | `flux2-pro` |

### Moods

| Mood       | Light                                  |
| ---------- | -------------------------------------- |
| `window`   | Soft, even daylight from a window      |
| `dawn`     | Cool, clear early morning light        |
| `raking`   | Low side light that brings out texture |
| `overcast` | Soft grey light on a rainy afternoon   |
| `lamplit`  | Warm evening lamps, candles and a fire |
| `nocturne` | Night, one warm low light, deep shadow |

### Usage

```bash
# CLI flags - the look sets the Model and a 3:2 aspect
motif "a green kitchen" --look lived-in --mood overcast --dry-run --format json

# Explicit flags beat the look's defaults
motif "a lamp" --look object -m flux2-pro -a 16:9 --dry-run --format json

# Stdin JSON
echo '{"prompt":"a green kitchen","creative":{"look":"lived-in","mood":"overcast"},"dryRun":true}' | motif --format json
```

Each flag overrides the matching key in the stdin `creative` object. Only the fields you set are applied. Dry-run JSON reports `basePrompt`, `creative.clauses`, `creative.selected`, `warnings`, and the final `prompt`, `model` and `aspect`.

An unknown id fails before any fal request with a structured `INVALID_OPTION` error (exit `2`) whose details include the field and the available ids for that field. `--describe generate` lists every id with its label, sentence, and for looks the `defaultAspect` and `defaultModel`.

`generate`, `vary`, `series create`, `series gen` and `series run` all accept `--look` and `--mood`. `generate` applies a look's model and aspect per call. vary reuses the Model that made its image while Motif still offers it; otherwise it chooses from the generate ranking's Models that can edit. A Series can pin a look and mood when it's created (see [Series](docs/series.md)). A Series' free-text `--style <prompt>` is separate from looks. A Model's own style setting is an override like any other: `-m ideogram --param style=DESIGN`.

## Task Verbs

Every Task has a verb. Each takes an optional trailing image path and falls back to the last generation, and each supports `--tier`, `-m`, `--param`, `--seed`, `--dry-run`, `-o/--output`, `--format`, `--fields` and `--no-open`. A mode is a flag such as `--text` or `--pose`, one per call. `-o` ending in `/` writes every file the Model returned into that directory; anything else writes the primary file only.

```bash
motif segment "the chair" room.png --dry-run --format json   # --rle for compact JSON masks, --auto for every region
motif ask "what colour is the chair?" room.png               # prose answer, writes no file
motif ask --caption room.png                                 # also --detect <thing>, --point <thing>, --read, --safe
motif erase "the parked car" street.png --dry-run            # --tier quality also removes the shadow
motif cutout product.png --dry-run                           # remove the background
motif reframe cover.png --og --dry-run                       # convert an existing image to a new ratio
motif upscale photo.png --scale 2 --dry-run                  # --transparent, --generative, --creative
motif restore photo.png --noise --dry-run                    # one mode at a time
motif relight kitchen.png --mood dawn --dry-run              # or a described light, --even, --flat
motif layers poster.png -o layers/ --dry-run                 # several files, so -o is a directory
motif vectorize logo.png -o logo.svg --dry-run               # raster to SVG
motif map room.png --pose --dry-run                          # depth by default
motif animate "the camera pushes in" still.png --dry-run     # video costs 5-10x an image
```

`--rmbg`, `--up`, `--vary`, `--video`, `enhance` and `tool` were removed and exit `2` with `REMOVED_COMMAND`, naming the verb in `details.use`. Read each verb's flags and outputs from `motif --describe <verb> --format json`, and see [tasks](docs/verbs.md) for all of them.

## Contact Sheets

`motif sheet` lays images out on one PNG, JPEG or WebP: each cell is the image fitted into a 512 px square (aspect kept) on a warm off-white ground, with a caption underneath. Captions come from history, matched by output path: model, look and mood when used, and cost (`cost unknown` when it isn't known). With no history match the caption is the filename. `generate`, `series gen` and `series run` record `look` and `mood` on history entries for this.

```bash
motif sheet a.png b.png c.png -o sheet.png --no-open --format json
motif sheet --last 6 --cols 3 --no-open --format json --fields path,count
```

Pass files or `--last <n>` (the newest n history images still on disk, oldest first), not both. `--cols` defaults to roughly square. `-o` follows the same output-path rules as `generate` and defaults to `sheet-<timestamp>.png`. JSON output is `{command, path, count, cols, width, height}`. Unreadable images fail with `INVALID_IMAGE_PATH`, and an empty history with `NO_PREVIOUS`.

## Schema Introspection

```bash
# Full schema: commands, enums, global flags, errors
motif --describe --format json

# Task routing: which verb does which job
motif --describe tasks --format json

# One command or Task
motif --describe generate --format json
motif --describe upscale --format json
```

The schema includes:

- Every command's input and output as JSON Schema, with `whenToUse` and `notFor`
- Each Task's `tiers`, `modes` and `models` (override ids, best-ranked first) in `--describe tasks`
- All enum values (aspect ratios, resolutions, presets, looks, moods)
- Global flag documentation and the error catalogue

## Response Sanitization

All API response data is sanitized before output to defend against prompt injection embedded in image metadata or API responses. Patterns matching known injection formats (SYSTEM, INSTRUCTION, etc.) are replaced with `[FILTERED]`.

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `FAL_KEY` | Yes, except for dry runs | fal.ai API key. Also configurable in `~/.motif/config.json` |
| `OPENAI_API_KEY` | Only for `--transparent` at the quality Tier | The transparency route for `gpt2` runs through OpenAI |

## Auth

- **Headless**: Set `FAL_KEY` environment variable. No browser redirect needed.
- **Config file**: Add `"apiKey": "..."` to `~/.motif/config.json`.
- **Local override**: Create `.motifrc` in CWD with project-specific config.
- **Pinning a Model**: `"tasks": { "upscale": { "model": "topaz-precision" } }` in config holds a Task's Model steady across releases. Older `defaultModel`, `upscaler` and `backgroundRemover` keys migrate to `tasks.generate`, `tasks.upscale` and `tasks.cutout`.
