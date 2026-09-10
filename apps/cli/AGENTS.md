# motif CLI — Agent Integration Guide

> **Security posture**: The agent is not a trusted operator. All inputs are validated. Output paths must stay inside the git root of the current directory (the nearest parent holding `.git`), or the current directory outside a repo. Post-processing (`--up`, `--rmbg`) writes alongside the source image by default. Always use `--dry-run` before mutating commands.

## Quick Start

```bash
# Introspect the full CLI schema (models, commands, enums, flags)
motif --describe

# Introspect a specific command
motif --describe generate

# Dry-run to validate without spending money
motif --dry-run "a sunset over mountains" -m gpt --og

# Generate with JSON output (auto-detected when piped)
motif "a sunset over mountains" -m gpt --og | jq .

# Raw JSON input via stdin
echo '{"prompt":"a sunset","model":"gpt","preset":"og"}' | motif

# History with pagination and field masks
motif --history --limit 5 --fields id,prompt,cost
```

## What do you want to do?

Pick the command by task. The last column is the same advice `motif --describe tasks` gives, and a task word typed as a command (`motif remove "the car" x.png`) fails with `INVALID_OPTION` and `details.didYouMean` naming the right one.

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
| Upscale the last image with Clarity | `motif --up [image]` | Restoring, denoising or sharpening, or a faithful Topaz upscale (enhance). |
| Remove the background from the last image | `motif --rmbg` | Taking one object out (erase), masking a named thing (segment), or generating with transparency from the start (generate with --transparent). |
| Make variations of the last image | `motif --vary` | A planned set of different scenes in one style (series run), or a specific change to an image (generate with -e). |
| Animate an image into a short video | `motif --video [image]` | Removing a video's background (tool bria-video-rmbg), or upscaling a video (tool topaz-video). |
| Show the last generation | `motif --last` | Older generations (history). |
| List past generations and spend | `motif --history` | Only the most recent generation (last), or one series' images (motif series history <slug>). |
| Print the CLI schema as JSON | `motif --describe [command]` | The arguments of one fal utility (motif tool describe <id>), or the task routing alone (motif --describe tasks). |
| List error codes and how to recover | `motif --describe errors` | The error from a failed call, which already carries its code, details and suggestions on stderr. |

`motif tool list` and `motif tool describe` mark each tool a command wraps with `verb`, and `motif tool run` on one adds a `hint` naming that command.

## Agent Invariants

**ALWAYS do these things:**

1. **Always use `--dry-run` first** for any mutating command (generate, upscale, rmbg, vary, video, the seven verbs `segment`, `ask`, `erase`, `reframe`, `enhance`, `layers` and `vectorize`, `tool run`, `series gen` and `series run`). Generations cost real money ($0.02–$0.30 per image). Validate before spending.

2. **Always use `--fields`** when you only need specific output fields. Full output includes paths, dimensions, costs, timestamps — most calls only need `id` and `path`.

3. **Always specify `--model` explicitly, except with `--look`.** Config defaults are user-set and may change between sessions. A look carries its own default model, so with `--look` leave `-m` out unless you mean to override it.

4. **Always use `--no-open`** in automated pipelines. The default opens images in Preview.app, which will interrupt the agent.

5. **Always validate model names** against `motif --describe` output. Model names are short aliases (`gpt`, `banana`, `gemini`, `gemini3`), not full fal.ai endpoint names.

**NEVER do these things:**

1. **Never pass fal.ai endpoint strings as model names.** Use `gpt`, not `fal-ai/gpt-image-1.5`.

2. **Keep output paths inside the repo.** Any path under the git root of the current directory is allowed (the current directory itself outside a repo). Anything else, and any `%2e` encoding, is rejected with `INVALID_OUTPUT_PATH`, whose message names the allowed root.

3. **Never assume the last generation exists.** Always handle `NO_PREVIOUS` errors when using `--vary`, `--up`, or `--rmbg`.

4. **Never parse human-formatted output.** Always use `--format json` or pipe the command. Human output contains ANSI color codes, spinner animations, and emoji.

5. **Never send prompts with control characters.** They are stripped during sanitization, which may change the intended meaning.

## Reference

Read these when a task reaches them:

- [Generate input](docs/generate.md) - before building stdin JSON for `generate`, passing several `-e` references, using `--transparent`, or acting on a prompt `warnings` entry.
- [Promoted verbs](docs/verbs.md) - when you need the fal tool behind a verb, or a flag only one verb takes, such as `enhance --restore` or `segment --rle`.
- [Fal tools](docs/tools.md) - before `motif tool run`: why `estimatedCost: null` is not free, why a queued tool that looks stuck must not be retried, and how to pass arguments that have no flag.
- [Series](docs/series.md) - before `motif series create`, `gen` or `run`: references, pinned looks and moods, and every Series command.
- [Video generation](docs/video.md) - before `motif --video`, which costs 5-10x an image.
- [Cost reference](docs/costs.md) - when choosing a model on price or budgeting a plan of several calls.
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
| The seven verbs        | `path`            | `jq -r .path`             |
| `tool run`             | `saved.path`      | `jq -r '.saved.path'`     |
| Either, with `-o dir/` | `files[].path`    | `jq -r '.files[].path'`   |

A dry run has no `path` at all - it reports `output`, the path the file _would_ take.

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

A model that refuses an option fails with `INVALID_OPTION` (exit `2`) and names the fix: the message reads like "Seedream 4.5 does not support resolution. Models that do: …", and `details` carries `model`, `option`, `supportedOptions` (what this model does take) and `modelsSupporting` (generation models that take the option), all derived from the registry.

What a code means, whether a retry can help and how to recover: `motif --describe errors --format json`.

### Exit Codes

Structured failures exit with a semantic process code derived from the error's RFC 7807 `status` field. Agents can branch on the exit code without parsing stderr. The mapping is:

| Exit | Meaning | Status | Example error codes |
| --- | --- | --- | --- |
| `0` | Success | — | — |
| `1` | Unknown / unmapped | — | Unstructured crashes; any status outside the ranges below |
| `2` | Invalid input or usage | `4xx` (except `401`/`403`/`404`) | `UNKNOWN_MODEL`, `UNKNOWN_TOOL`, `INVALID_MODEL_ID`, `INVALID_TOOL_ID`, `INVALID_OPTION`, `INVALID_OUTPUT_PATH`, `INVALID_EDIT_PATH`, `INVALID_IMAGE_PATH`, `INVALID_STDIN`, `EMPTY_PROMPT`, `RESERVED_PROMPT`, `TOO_MANY_REFERENCES` |
| `3` | Authentication / authorization | `401`, `403` | `MISSING_API_KEY`, `ACCOUNT_LOCKED` |
| `4` | Resource not found | `404` | `NO_PREVIOUS`, `SERIES_NOT_FOUND` |
| `5` | Upstream (fal) failure | `5xx` | `GENERATION_FAILED`, `UPSCALE_FAILED`, `RMBG_FAILED`, `VIDEO_FAILED`, `TOOL_FAILED`, `DESCRIBE_FAILED`, `SERIES_CREATE_FAILED`, `SERIES_REF_ADD_FAILED`, `SERIES_REF_REMOVE_FAILED`, `SERIES_GENERATE_FAILED`, `SERIES_DELETE_FAILED`, `SEGMENT_FAILED`, `ASK_FAILED`, `ERASE_FAILED`, `REFRAME_FAILED`, `ENHANCE_FAILED`, `LAYERS_FAILED`, `VECTORIZE_FAILED`, `TRANSPARENCY_MISSING` |

Every structured error still carries the machine-readable `status` field, so the exit code and the JSON envelope always agree. Unstructured crashes (unexpected exceptions the CLI did not classify) still exit `1`.

## Stdin JSON

Flag values override stdin JSON values for the same field. The three input modes and the full schema are in [generate input](docs/generate.md).

**The seven promoted verbs are argv-only.** They route on `argv[0]`, so there is no `"command": "segment"`. An unrecognised `command` value is not rejected - it falls through to `generate`, so `{"command":"segment","prompt":"the bowl"}` silently generates an image of a bowl and bills you for it. Invoke a verb as `motif segment ...`, or reach the same endpoint through `tool-run`.

## Creative Direction

Creative direction adds house presets to the prompt before the request body is built. There are two fields, applied in this order:

| Field  | CLI flag      | Purpose                                            |
| ------ | ------------- | -------------------------------------------------- |
| `look` | `--look <id>` | The kind of image, plus a default aspect and model |
| `mood` | `--mood <id>` | The light, added after the look                    |

Each option is one or more full sentences. The final prompt is your prompt, then the look, then the mood, joined as sentences: any trailing period is stripped from each part, the parts are joined with `". "`, and the result ends with a period. With no look or mood the prompt is sent unchanged.

### Looks

In `generate`, a look sets the model and aspect when you gave none. Explicit `-m`/`--model`, `-a`/`--aspect`, a preset flag such as `--og`, or stdin `model`, `aspect` or `preset` always win. Resolution is never changed.

Five looks are flat and take no mood: `plate`, `engraved`, `ephemera`, `canvas` and `object` (`acceptsMood: false` in `--describe`). A mood with one of them fails with `INVALID_OPTION` (exit `2`) on field `mood`, and `details.availableIds` lists the looks that do accept a mood. A mood with no look is valid. `--no-mood` on `generate`, `series gen` and `series run` (or `"mood": null` in stdin `creative`) drops any mood, including a Series' pinned one, so `series gen <slug> "x" --look plate --no-mood` works on a Series pinned to a mood.

The `drawing` look is experimental (`experimental: true` in `--describe`): it works, but its text and defaults may change. Look defaults outrank `defaultModel` and `defaultAspect` in `~/.motif/config.json`; explicit flags and stdin outrank both.

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
# CLI flags - the look picks flux2-pro at 3:2
motif "a green kitchen" --look lived-in --mood overcast --dry-run --format json

# Explicit flags beat the look's defaults
motif "a lamp" --look object -m flux2-pro -a 16:9 --dry-run --format json

# Stdin JSON
echo '{"prompt":"a green kitchen","creative":{"look":"lived-in","mood":"overcast"},"dryRun":true}' | motif --format json
```

Each flag overrides the matching key in the stdin `creative` object. Only the fields you set are applied. Dry-run JSON reports `basePrompt`, `creative.clauses`, `creative.selected`, `warnings`, and the final `prompt`, `model` and `aspect`.

An unknown id fails before any fal request with a structured `INVALID_OPTION` error (exit `2`) whose details include the field and the available ids for that field. `--describe generate` lists every id with its label, sentence, and for looks the `defaultAspect` and `defaultModel`.

`generate`, `vary`, `series create`, `series gen` and `series run` all accept `--look` and `--mood`. `generate` applies a look's model and aspect per call. Vary keeps the last generation's model and aspect, and runs on the edit-capable model subset (`EDIT_CAPABLE_MODELS`), the generation models whose fal endpoints support image editing. A Series can pin a look and mood when it's created (see [Series](docs/series.md)). Series' free-text `--style <prompt>` and the model-native `--style` on `generate` are separate from looks.

## Promoted Verbs

Seven fal capabilities have a verb of their own rather than living behind `motif tool run`. Each takes an optional trailing image path and falls back to the last generation, and each supports `--dry-run`, `-o/--output`, `--format`, `--fields` and `--no-open`. `-o` ending in `/` writes every artefact into that directory, named by registry output key; anything else writes the primary output only.

```bash
motif segment "the chair" room.png --dry-run --format json   # SAM 3; --rle for compact JSON masks
motif ask "what colour is the chair?" room.png               # prose answer, writes no file
motif ask --caption room.png                                 # also --detect <thing>, --point <thing>
motif erase "the parked car" street.png                      # remove and fill
motif reframe --og cover.png                                 # convert an existing image to a new ratio
motif enhance --denoise photo.png                            # Topaz, one mode at a time
motif layers poster.png -o layers/                           # several files, so -o must be a directory
motif vectorize logo.png -o logo.svg                         # raster to SVG
```

Read each verb's flags and outputs from `motif --describe <verb> --format json`.

## Contact Sheets

`motif sheet` lays images out on one PNG, JPEG or WebP: each cell is the image fitted into a 512 px square (aspect kept) on a warm off-white ground, with a caption underneath. Captions come from history, matched by output path: model, look and mood when used, and cost (`cost unknown` when it isn't known). With no history match the caption is the filename. `generate`, `series gen` and `series run` record `look` and `mood` on history entries for this.

```bash
motif sheet a.png b.png c.png -o review/sheet.png --no-open --format json
motif sheet --last 6 --cols 3 --no-open --format json --fields path,count
```

Pass files or `--last <n>` (the newest n history images still on disk, oldest first), not both. `--cols` defaults to roughly square. `-o` follows the same output-path rules as `generate` and defaults to `sheet-<timestamp>.png`. JSON output is `{command, path, count, cols, width, height}`. Unreadable images fail with `INVALID_IMAGE_PATH`, and an empty history with `NO_PREVIOUS`.

## Schema Introspection

```bash
# Full schema (all commands, models, enums, flags)
motif --describe

# Single command schema
motif --describe generate
motif --describe upscale

# Via stdin
echo '{"command":"describe"}' | motif
```

The schema includes:

- All command input/output types with JSON Schema
- All model capabilities (aspect, resolution, edit support, pricing)
- All enum values (aspect ratios, resolutions, model names)
- Preset definitions
- Global flag documentation

## Response Sanitization

All API response data is sanitized before output to defend against prompt injection embedded in image metadata or API responses. Patterns matching known injection formats (SYSTEM, INSTRUCTION, etc.) are replaced with `[FILTERED]`.

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `FAL_KEY` | Yes | fal.ai API key. Also configurable in `~/.motif/config.json` |

## Auth

- **Headless**: Set `FAL_KEY` environment variable. No browser redirect needed.
- **Config file**: Add `"apiKey": "..."` to `~/.motif/config.json`.
- **Local override**: Create `.motifrc` in CWD with project-specific config.
