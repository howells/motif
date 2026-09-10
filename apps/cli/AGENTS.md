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

## Output Format

motif auto-detects the output context:

| Context                    | Default Format              | Override          |
| -------------------------- | --------------------------- | ----------------- |
| Interactive terminal (TTY) | `human` (colored, spinners) | `--format json`   |
| Piped / redirected         | `json` (one JSON object)    | `--format human`  |
| Streaming large results    | n/a                         | `--format ndjson` |

**Always structured errors**: In JSON mode, errors are written to stderr as:

```json
{
  "error": true,
  "code": "UNKNOWN_MODEL",
  "message": "Unknown model: foo",
  "is_retriable": false,
  "details": {
    "available": [
      "gpt2",
      "gpt",
      "banana2",
      "banana",
      "gemini",
      "gemini3",
      "seedream4",
      "seedream45",
      "seedream5",
      "seedream5-lite",
      "flux2-max",
      "flux2-pro",
      "flux2-flex",
      "flux2-dev",
      "flux2-turbo",
      "flux",
      "flux-fast",
      "recraft",
      "recraft4",
      "ideogram",
      "ideogram4",
      "grok-image",
      "qwen",
      "qwen3"
    ]
  }
}
```

Structured errors include an `instance` field (an `urn:fal:request:<id>` URN) when the failure originated at fal, letting agents tie a failure back to fal's dashboard/support.

Error codes are grouped below. Every code the CLI can emit is listed; the live catalog is available from `motif --describe --format json`.

- General: `MISSING_API_KEY`, `ACCOUNT_LOCKED`, `UNKNOWN_MODEL`, `INVALID_MODEL_ID`, `INVALID_OPTION`, `INVALID_OUTPUT_PATH`, `INVALID_EDIT_PATH`, `INVALID_IMAGE_PATH`, `INVALID_STDIN`, `EMPTY_PROMPT`, `RESERVED_PROMPT`, `TOO_MANY_REFERENCES`, `NO_PREVIOUS`, `GENERATION_FAILED`, `TRANSPARENCY_MISSING`, `UPSCALE_FAILED`, `RMBG_FAILED`, `VIDEO_FAILED`, `DESCRIBE_FAILED`.

`RESERVED_PROMPT` (status `400`, exit `2`) fires when the positional prompt is exactly a motif command word (e.g. `motif history` instead of `motif --history`). This protects agents from spending credits on a mistyped command. The error's `details.didYouMean` field carries the corrected invocation. To genuinely generate from such a one-word prompt, pass it via stdin JSON: `echo '{"prompt":"history"}' | motif`.

`-e/--edit` takes one path per flag and repeats: `motif -e a.png -e b.png "a cat"`. The prompt can go anywhere. Stdin `editImages` is still an array.

A model that refuses an option fails with `INVALID_OPTION` (exit `2`) and names the fix: the message reads like "Seedream 4.5 does not support resolution. Models that do: …", and `details` carries `model`, `option`, `supportedOptions` (what this model does take) and `modelsSupporting` (generation models that take the option), all derived from the registry.

`--transparent` on `gpt2` (or a look that resolves to it) runs through OpenAI (`gpt-image-2`) rather than fal, because fal's GPT Image 2 endpoint has no background option. It needs `OPENAI_API_KEY`; without it the run fails with `MISSING_API_KEY` (exit `3`) and `details.envVar`. The dry run shows `route: "openai"`, `endpoint: "openai:gpt-image-2"`, `providerModel` and `requiredEnv`; plain runs show `route: "fal"`. OpenAI prices gpt-image-2 by tokens, so `estimatedCost` and the recorded cost are `null` (unknown), never a guess. Edits (`-e`) go the same way. Options OpenAI can't take (seed, negative prompt, `--quality xhigh`, and so on) fail with `INVALID_OPTION`. `-m gpt --transparent` stays on fal.

Every `--transparent` run reads the saved PNG back. With no alpha channel or no fully transparent pixel it fails with `TRANSPARENCY_MISSING` (status `502`, exit `5`, retriable): nothing is reported as a success or recorded in history, and the file stays on disk (`details.paths`).

- Tools: `UNKNOWN_TOOL`, `INVALID_TOOL_ID`, `TOOL_FAILED`.
- Verbs: `SEGMENT_FAILED`, `ASK_FAILED`, `ERASE_FAILED`, `REFRAME_FAILED`, `ENHANCE_FAILED`, `LAYERS_FAILED`, `VECTORIZE_FAILED`.
- Series: `SERIES_CREATE_FAILED`, `SERIES_NOT_FOUND`, `SERIES_REF_ADD_FAILED`, `SERIES_REF_REMOVE_FAILED`, `SERIES_GENERATE_FAILED`, `SERIES_DELETE_FAILED`.

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

## Input Modes

### 1. CLI Flags (human-friendly)

```bash
motif "a cat" -m gpt --landscape -r 2K -n 2
```

### 2. Stdin JSON (agent-friendly)

```bash
echo '{"prompt":"a cat","model":"gpt","aspect":"16:9","resolution":"2K","numImages":2}' | motif
```

### 3. Combined (stdin base + flag overrides)

```bash
echo '{"prompt":"a cat","model":"gpt"}' | motif --landscape -r 4K
```

Flag values override stdin JSON values for the same field.

### Stdin JSON Schema

```json
{
  "prompt": "string (required for generate)",
  "model": "flare | sunburst | gpt2 | gpt | banana2 | banana | gemini | gemini3 | seedream4 | seedream45 | seedream5 | seedream5-lite | flux2-max | flux2-pro | flux2-flex | flux2-dev | flux2-turbo | flux | flux-fast | recraft | recraft4 | ideogram | ideogram4 | grok-image | qwen | qwen3",
  "aspect": "1:1 | 16:9 | 9:16 | 2:3 | 3:2 | 4:3 | 3:4 | 4:5 | 5:4 | 21:9",
  "resolution": "1K | 2K | 4K",
  "numImages": 1,
  "output": "filename.png",
  "editImages": ["path/to/ref.png"],
  "transparent": false,
  "inputFidelity": "low | high",
  "preset": "cover | square | landscape | portrait | story | reel | feed | og | wallpaper | wide | ultra",
  "noOpen": true,
  "command": "generate | upscale | rmbg | vary | video | last | history | describe | tool | tool-run | tool-list | tool-describe",
  "limit": 10,
  "offset": 0,
  "imagePath": "path/to/image.png",
  "scale": 2,
  "duration": 5,
  "generateAudio": true
}
```

### Stdin JSON for fal tools

The four `tool*` commands reach every entry in the registry, including the 40-odd with no promoted verb:

```json
{
  "command": "tool-run",
  "tool": "sam3-image",
  "input": "path/or/https/url",
  "inputs": ["a.png", "b.png"],
  "options": { "maps": ["basecolor", "normal"] },
  "output": "out/",
  "outputFormat": "png",
  "prompt": "the white ceramic bowl",
  "scale": 2,
  "dryRun": true
}
```

`options` is merged into the fal request body, the same as `--json` on the command line. `tool-list` and `tool-describe` need no input; `tool-describe` takes `tool`.

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

### Prompt warnings

`generate` puts `warnings: [{rule, match, message}]` in dry-run JSON and in successful JSON output (empty when nothing matches), and prints them in yellow in human output. They are advisory: generation still goes ahead. They check the caller's own prompt only, never the look or mood text.

| Rule | Fires on | Why |
| --- | --- | --- |
| `negated-object` | `no <word>` (optionally `no a/an/the <word>`), except text, logos, logo, people, person, faces, watermark, watermarks, words, lettering | Negating an object tends to draw it into the picture; describe what is present instead |
| `text-bearing-object` | `no text` or `no words` together with sign, label, poster, book, menu, newspaper, packaging, card, ticket, magazine or screen | The model is likely to render text on the object anyway |

An unknown id fails before any fal request with a structured `INVALID_OPTION` error (exit `2`) whose details include the field and the available ids for that field. `--describe generate` lists every id with its label, sentence, and for looks the `defaultAspect` and `defaultModel`.

`generate`, `vary`, `series create`, `series gen` and `series run` all accept `--look` and `--mood`. `generate` applies a look's model and aspect per call. Vary keeps the last generation's model and aspect, and runs on the edit-capable model subset (`EDIT_CAPABLE_MODELS`), the generation models whose fal endpoints support image editing. A Series can pin a look and mood when it's created (see Series below). Series' free-text `--style <prompt>` and the model-native `--style` on `generate` are separate from looks.

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

## Agent Invariants

**ALWAYS do these things:**

1. **Always use `--dry-run` first** for any mutating command (generate, upscale, rmbg, vary). Generations cost real money ($0.02–$0.30 per image). Validate before spending.

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

### Fal Tool Invariants

1. **`estimatedCost: null` is not free.** It means metered or per-unit billing - the price depends on output megapixels, compute seconds, map count, layer count or tokens, none of which the CLI can know before the call. `estimatedCostPerMegapixel` / `estimatedCostPerSecond` carry the rate where there is one; the `pricing` string carries the full formula. Summing `estimatedCost ?? 0` across a plan will under-budget.

2. **29 of the 71 tools are `queued`.** They routinely exceed fal's 120-second synchronous window, so the CLI submits to the queue and polls. A Topaz restore taking over two minutes is normal. Set harness timeouts in minutes for these, and never retry one that looks stuck - each retry is another billable submission. Check with `--dry-run --fields queued`, or `motif tool describe <id>`.

3. **The response can lie about geometry; the CLI does not.** Several endpoints return `width` and `height` as `null` on the files they hand back - `seedream-layerize` does it on every layer. Motif measures each file as it downloads, so `--fields files` carries the real dimensions:

   ```json
   {
     "key": "masks",
     "path": "…/masks.png",
     "size": "139.3KB",
     "width": 2752,
     "height": 1536
   }
   ```

   This only works if you let the CLI download. Fetch the URLs yourself and you get the payload's nulls. Reported by a consumer who measured the bytes by hand before finding this.

4. **`-o dir/` writes every artefact; anything else writes only the primary.** Files in directory mode are named by the registry output key (`image.jpg`, `masks.png`), or by declared position labels where the registry has them - `patina -o pbr/` writes `basecolor.jpg`, `normal.jpg`, `roughness.jpg`, `metalness.jpg`, `height.jpg`. A reordered driving option (patina's `maps`) is honoured; a label count that doesn't match the URL count is dropped rather than guessed.

5. **Never hardcode tool ids or prices.** Both move with the registry. Read them from `motif tool list --format json` and `motif tool describe <id> --format json`.

6. **`motif tool run` has no `--no-open`** and never opens a viewer. The seven verbs do open one by default, so they need it in a pipeline.

7. **Some tools take `--inputs`, not a positional path.** Registry entries with `inputKind: "images"` (`got-ocr`, `nsfw`) send an array field. `motif tool describe <id>` reports `inputKind` and `inputField`.

### Tool Arguments

`motif tool describe <id> --format json` carries a `parameters` array listing every argument that endpoint accepts, generated from fal's own schema rather than from the flags Motif happens to expose. Anything in it is passable with `motif tool run <id> --json '{...}'`, whether or not there is a flag for it - `topaz-precision` takes `upscale_factor` and six `model` variants, `birefnet` takes `output_mask`, `iclight-v2` takes `mask_image_url`, none of which has a flag.

Two different defaults live in that output and they mean different things:

- `fallback` is fal's own default, applied when nobody sends the argument. Some are surprising: `sam3-image` defaults `prompt` to `"wheel"`, so an unprompted call looks for wheels and returns nothing.
- `motifDefault` is Motif's deliberate opinion, sent on every call and overriding fal's default.

Everything else is caller-supplied. `motif tool list` and `motif --describe` carry only a `parameterCount` per tool, so read the per-tool describe before deciding what a tool can do. Over MCP the same split holds: `motif://tools` lists counts, `motif://tools/{id}` returns the arguments.

## Recommended Field Masks

Use `--fields` to limit output to what you need. This protects your context window and reduces token usage in multi-step workflows.

| Workflow | Command | Recommended `--fields` |
| --- | --- | --- |
| Generate and confirm | `generate` | `id,images,cost` |
| Batch exploration | `generate` | `id,images` |
| Cost tracking | `generate` | `id,cost,model` |
| Upscale/rmbg result | `upscale`, `rmbg` | `path,size` |
| Video result | `video` | `path,duration,cost` |
| History scan | `history` | `id,prompt,model,cost` |
| Last generation check | `last` | `id,prompt,output` |
| Verb result | `segment`, `erase`, `reframe`, `enhance`, `layers`, `vectorize` | `path,cost` |
| Verb, every artefact | any verb with `-o dir/` | `files` |
| Segment geometry only | `segment` | `boxes,scores` (add `rle` with `--rle`) |
| Ask | `ask` | `answer` (also `reasoning`, `objects`, `points`) |
| Tool result | `tool run` | `saved` |
| Tool, every artefact | `tool run -o dir/` | `files` |
| Tool pricing check | `tool run --dry-run` | `estimatedCost,pricing,queued` |

**The output path is in a different place per family.** Field masks are top-level only, so this matters:

| Family                 | Where the path is | jq                        |
| ---------------------- | ----------------- | ------------------------- |
| `generate`, `vary`     | `images[].path`   | `jq -r '.images[0].path'` |
| The seven verbs        | `path`            | `jq -r .path`             |
| `tool run`             | `saved.path`      | `jq -r '.saved.path'`     |
| Either, with `-o dir/` | `files[].path`    | `jq -r '.files[].path'`   |

A dry run has no `path` at all - it reports `output`, the path the file _would_ take.

### Examples

```bash
# Batch: generate 4 images, only get paths
motif "sunset over mountains" -m flux-fast -n 4 --fields images | jq -r '.images[].path'

# Pipeline: generate → upscale (chain by path)
IMG=$(motif "a cat" -m flux --fields images | jq -r '.images[0].path')
motif --up "$IMG" --fields path,size

# Pipeline: verb → verb (verbs put the path at the top level)
ERASED=$(motif erase "the parked car" street.png -o erased.jpg --no-open --fields path | jq -r .path)
motif reframe --story "$ERASED" -o story.png --no-open --fields path

# Cost audit: check recent spending
motif --history --limit 20 --fields model,cost
```

## Cost Reference

### Image Generation

| Model | Per Image | Notes |
| --- | --- | --- |
| `flux-fast` | $0.003 | Near-instant, great for iterations |
| `flux2-turbo` | $0.008/MP | Fastest FLUX.2, ~6s at 1MP |
| `flux2-dev` | ~$0.012 | Open FLUX.2, billed per compute second ($0.00167/sec) |
| `grok-image` | $0.02 | Fast, cheap generation and edits |
| `qwen` | $0.02/MP | Low-cost open-weight generation |
| `qwen3` | $0.02/MP (assumed) | Qwen Image 3 - successor to qwen |
| `seedream4` | $0.03 | Low-cost, high-ranked generation and edits |
| `flux2-pro` | $0.03/MP | Production FLUX quality per megapixel |
| `ideogram` | $0.03 | Best text rendering in images |
| `ideogram4` | $0.03 | Per-MP tiers: TURBO $0.03 / BALANCED $0.06 / QUALITY $0.10 per MP |
| `seedream5-lite` | $0.035 | Flat per image up to Auto 3K (~9.4MP), generation and edits |
| `gemini` | $0.0398 | Cheap, no resolution control |
| `recraft` | $0.04 | Best for design/brand work, vector art |
| `recraft4` | $0.04 | Recraft V4 design generation |
| `seedream45` | $0.04 | Current Seedream generation and edits |
| `flux2-flex` | $0.05/MP | FLUX with guidance and step controls |
| `flux` | $0.06 | Photorealism benchmark |
| `flux2-max` | $0.07/MP | Highest-quality FLUX |
| `seedream5` | $0.0675 / $0.135 | $0.0675 up to 1536², $0.135 up to 2048² (2K/4K); generation and edits |
| `banana2` | $0.08 | $0.06 / $0.08 / $0.12 / $0.16 at 0.5K / 1K / 2K / 4K (0.75x / 1x / 1.5x / 2x) |
| `gpt` | $0.133 | Supports transparency, 4 reference images |
| `banana` | $0.15 ($0.30 at 4K) | 14 reference images, best editing |
| `gemini3` | $0.15 ($0.30 at 4K) | Full feature support |
| `flare` | Metered | GPT Image 2.5 Flare: fast generation, transparency, 16 references |
| `sunburst` | Metered | GPT Image 2.5 Sunburst: precise edits, transparency, 16 references |
| `gpt2` | $0.211 | Frontier OpenAI generation; transparent PNGs via the OpenAI route (cost unknown) |

### Processing

| Model               | Per Use  | Notes                          |
| ------------------- | -------- | ------------------------------ |
| `clarity` (upscale) | $0.03/MP | Default upscaler               |
| `crystal` (upscale) | $0.02    | Alternative upscaler           |
| `rmbg`              | $0.02    | Background removal             |
| `bria`              | $0.02    | Alternative background removal |

### Video

| Model               | Per Second | Notes           |
| ------------------- | ---------- | --------------- |
| `kling` (audio off) | $0.112/sec | 5s clip = $0.56 |
| `kling` (audio on)  | $0.168/sec | 5s clip = $0.84 |

### Fal Tools

71 registry entries, from $0.001 to $0.96. Read live prices from `motif tool list --format json` or `motif tool describe <id> --format json` - do not hardcode this table, it moves.

Three price shapes, and only one of them gives you a number up front:

| Registry `price.kind` | Dry run reports | Example |
| --- | --- | --- |
| `call` | `estimatedCost: 0.024` | `object-removal`, `sam3-image`, `recraft-vectorize` |
| `megapixel` | `estimatedCost: null` plus `estimatedCostPerMegapixel` | every Topaz endpoint, `iclight-v2`, `ddcolor` |
| `second` | `estimatedCost: null` plus `estimatedCostPerSecond` | `dwpose`, `bria-video-rmbg`, `topaz-video` |
| `metered` | `estimatedCost: null`, nothing else | Moondream, `patina`, `seedream-layerize`, most preprocessors |

The ones most likely to be reached for:

| Tool | Price | Notes |
| --- | --- | --- |
| `nsfw` | metered, listed at $0.001/image | Moderation |
| `sam3-image` | $0.005/request | Text-prompted segmentation. `sam3-image-rle` is the same price |
| `image2svg` | $0.005/image | Traced SVG |
| `bria-rmbg` | $0.018/generation | Commercial-safe background removal |
| `object-removal` | $0.024/image | Prompted erase. Leaves the object's shadow |
| `recraft-vectorize` | $0.04/image | Clean SVG. $0.08 with a vector style |
| `bria-eraser`, `bria-genfill`, `text-removal` | $0.04 | Masked erase, masked generative fill, text removal |
| `qwen-layered` | metered, listed at $0.05/image | Stacked RGBA layers. Queued |
| `ideogram-reframe` | $0.06/image | Aspect-ratio reframe. $0.03 turbo, $0.09 quality |
| `ideogram-layerize-text` | $0.09/image | Type lifted off, plus `text_containers` and `text_html`. Queued |
| `finegrain-eraser` | $0.27/image | Prompted erase including shadows and reflections. $0.18 express, $0.36 premium |
| `topaz-precision` | $0.0033/MP ($0.08 per 24 output MP) | Default `motif enhance` mode. Queued |
| `topaz-restore` | $0.02/MP ($0.48 per 24 output MP) | `motif enhance --restore`. Queued |
| `topaz-creative` | $0.04/MP ($0.96 per 24 output MP) | Most expensive tool in the registry. Queued |
| `patina` | metered | $0.01 base plus $0.01/MP per output map. Queued |

**Tip**: Use `--dry-run` to see the exact estimated cost before committing. **Warning**: Video is 5-10x more expensive than images. Always dry-run first.

## Video Generation

Generate video from an image using Kling v3 Pro:

```bash
# Generate 5s video from an image
motif --video image.png "camera slowly zooms in"

# Without audio (cheaper)
motif --video image.png "smooth pan left" --video-no-audio

# Custom duration (3-15 seconds)
motif --video image.png "cinematic motion" --video-duration 10

# From last generation
motif --video "camera orbits around the subject"

# Dry-run first (video is expensive!)
motif --dry-run --video image.png "slow zoom"

# Via stdin JSON
echo '{"command":"video","imagePath":"image.png","prompt":"zoom in","duration":5}' | motif
```

### Video Invariants

- **Always `--dry-run` first.** A 10s video with audio costs $1.68.
- **Generation takes 30-120 seconds.** The CLI polls automatically.
- **Output is `.mp4`.** Use `--video-no-audio` for silent video (40% cheaper).
- **Duration range is 3-15 seconds.**
- **Aspect ratio is determined by the source image dimensions.**

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

| Verb | fal tool(s) | Notes |
| --- | --- | --- |
| `segment "<prompt>" [image]` | `sam3-image`, `sam3-image-rle` (`--rle`) | Emits `boxes` and `scores` alongside the mask files |
| `ask "<question>" [image]` | `moondream-query`, `-caption`, `-detect`, `-point` | Writes no file and records no history; answer is at `answer`. With a mode flag the first positional is the image |
| `erase "<prompt>" [image]` | `object-removal` |  |
| `reframe [image]` | `ideogram-reframe` | Needs one of `--og --square --cover --portrait --landscape --story --wide` |
| `enhance [image]` | eight Topaz endpoints | `--upscale` (default), `--generative`, `--creative`, `--transparent`, `--restore`, `--denoise`, `--sharpen`, `--adjust`. Two modes is `INVALID_OPTION`. All run through the fal queue |
| `layers [image] -o dir/` | `qwen-layered` | One file per layer, so `-o` must end in `/` |
| `vectorize [image] -o out.svg` | `recraft-vectorize` | `-o` must name a `.svg` or end in `/` |

Metered and per-unit endpoints report `cost: null` rather than a guessed number — `ask` is metered by tokens, so it always does. Read each verb's flags and outputs from `motif --describe <verb> --format json`.

## Contact Sheets

`motif sheet` lays images out on one PNG, JPEG or WebP: each cell is the image fitted into a 512 px square (aspect kept) on a warm off-white ground, with a caption underneath. Captions come from history, matched by output path: model, look and mood when used, and cost (`cost unknown` when it isn't known). With no history match the caption is the filename. `generate`, `series gen` and `series run` record `look` and `mood` on history entries for this.

```bash
motif sheet a.png b.png c.png -o review/sheet.png --no-open --format json
motif sheet --last 6 --cols 3 --no-open --format json --fields path,count
```

Pass files or `--last <n>` (the newest n history images still on disk, oldest first), not both. `--cols` defaults to roughly square. `-o` follows the same output-path rules as `generate` and defaults to `sheet-<timestamp>.png`. JSON output is `{command, path, count, cols, width, height}`. Unreadable images fail with `INVALID_IMAGE_PATH`, and an empty history with `NO_PREVIOUS`.

## Pagination

History supports offset-based pagination:

```bash
# First page
motif --history --limit 10

# Next page
motif --history --limit 10 --offset 10

# Stream all as NDJSON
motif --history --limit 100 --format ndjson
```

JSON response includes `hasMore: true` when more pages exist.

## Series — Consistent Styling Across Related Images

Series let you lock a visual style and generate multiple images that look like they belong together.

### Quick Start

```bash
# One-shot themed run: plan 6 cohesive images before spending credits
motif series run "brutalist architecture" --count 6 --dry-run --format json

# Create a series from a cover image
motif series create "Luna's Adventure" --from cover.png \
  --style "children's book, watercolor, soft pastels" -m banana -a 3:2

# Pin a house look and mood; the look also sets the model and aspect
# (flux2-pro, 3:2) because -m and -a are not given
motif series create "Kitchen Stories" --style "warm family kitchens" \
  --look lived-in --mood overcast

# Add character references
motif series ref-add luna-s-adventure character-luna.png --tag character -d "Luna front view"
motif series ref-add luna-s-adventure forest-clearing.png --tag location -d "Forest clearing"

# Generate with consistent styling (style prompt + refs auto-included)
motif series gen luna-s-adventure "Luna discovers a glowing mushroom in the forest clearing" \
  --refs character,location --dry-run

# After validating, generate for real
motif series gen luna-s-adventure "Luna discovers a glowing mushroom" --refs character,location

# View series state
motif series show luna-s-adventure
motif series history luna-s-adventure
```

### Stdin JSON

```bash
echo '{"command":"series-run","theme":"brutalist architecture","numImages":6,"dryRun":true}' | motif series --format json
echo '{"command":"series-generate","series":"luna-s-adventure","prompt":"Luna meets the fox","refs":"character"}' | motif series
echo '{"command":"series-create","name":"Kitchen Stories","creative":{"look":"lived-in","mood":"overcast"}}' | motif series --format json
```

### How It Works

1. **Series run** turns a theme into one shared style prompt and one scene prompt per requested image
2. **Pinned look and mood** are stored on the series as `look` and `mood`, shown by `series show` and `series list`, and added to every scene prompt in `series gen` and `series run`. A `--look` or `--mood` flag on gen or run replaces the pinned value for that call only (flag, then stdin `creative`, then the pinned value). The `--style` prompt still goes first as the prefix, then the scene, then the look and mood sentences. `series create` validates the pair with the same rules as `generate`, so a mood on a flat look fails with `INVALID_OPTION`. A look fills in the series' model and aspect only where `-m` or `-a` wasn't given; after that, gen and run use the series settings, not the look's. `--no-mood` on gen or run drops the pinned mood for that call. A `series run` without `--series` creates a Series that pins the look and mood the run used.
3. **Reference images** (tagged) are passed as `--edit` images to the model
4. **Outputs** are tracked per-series with full provenance (prompt, refs used, cost)
5. **Live series runs** reuse the first generated image as a style anchor for later images when the model supports references
6. **banana model** is recommended for series (14 reference images, best consistency)

### Series Invariants

- **Always `--dry-run` first.** Series generations cost real money.
- **Build refs before generating.** Style and character refs must exist before chapter illustrations.
- **Use `--refs` to select specific tags.** Don't send all refs if the model has a low limit.
- **banana supports 14 refs**, gpt supports 4, gemini/gemini3 support 4.
- Series data stored in `~/.motif/series/<slug>/`.

### All Series Commands

```bash
motif series create <name> [--from <img>] [--style <prompt>] [--look id] [--mood id] [-m model] [-a aspect] [-r res]
motif series list
motif series show <slug>
motif series ref-add <slug> <image> [-t tag] [-d description]
motif series ref-remove <slug> <filename>
motif series gen <slug> "prompt" [--refs tags] [--look id] [--mood id] [--dry-run] [-m model] [-a aspect] [-o output]
motif series run "theme" [--count n] [--series slug] [--refs tags] [--look id] [--mood id] [--dry-run] [-m model] [-a aspect]
motif series history <slug> [--limit n] [--offset n]
motif series delete <slug>
```

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
