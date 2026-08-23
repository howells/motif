# motif CLI — Agent Integration Guide

> **Security posture**: The agent is not a trusted operator. All inputs are validated. Generate output paths are sandboxed to CWD. Post-processing (`--up`, `--rmbg`) writes alongside the source image by default. Always use `--dry-run` before mutating commands.

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

- General: `MISSING_API_KEY`, `UNKNOWN_MODEL`, `INVALID_MODEL_ID`, `INVALID_OPTION`, `INVALID_OUTPUT_PATH`, `INVALID_EDIT_PATH`, `INVALID_IMAGE_PATH`, `INVALID_STDIN`, `EMPTY_PROMPT`, `RESERVED_PROMPT`, `EDIT_PROMPT_SWALLOWED`, `TOO_MANY_REFERENCES`, `NO_PREVIOUS`, `GENERATION_FAILED`, `UPSCALE_FAILED`, `RMBG_FAILED`, `VIDEO_FAILED`, `DESCRIBE_FAILED`.

`RESERVED_PROMPT` (status `400`, exit `2`) fires when the positional prompt is exactly a motif command word (e.g. `motif history` instead of `motif --history`). This protects agents from spending credits on a mistyped command. The error's `details.didYouMean` field carries the corrected invocation. To genuinely generate from such a one-word prompt, pass it via stdin JSON: `echo '{"prompt":"history"}' | motif`.

`EDIT_PROMPT_SWALLOWED` (status `400`, exit `2`) fires when `-e/--edit` — a variadic flag — has eaten the prompt: `motif -e image.png "a cat"` passes both as reference images and leaves no prompt. Put the prompt first (`motif "a cat" -e image.png`), or send both via stdin JSON. A missing-but-plausible path such as `-e typo.png` is not treated as a swallowed prompt; it still reports `INVALID_EDIT_PATH`.

- Tools: `UNKNOWN_TOOL`, `INVALID_TOOL_ID`, `TOOL_FAILED`.
- Verbs: `SEGMENT_FAILED`, `ASK_FAILED`, `ERASE_FAILED`, `REFRAME_FAILED`, `ENHANCE_FAILED`, `LAYERS_FAILED`, `VECTORIZE_FAILED`.
- Series: `SERIES_CREATE_FAILED`, `SERIES_NOT_FOUND`, `SERIES_REF_ADD_FAILED`, `SERIES_REF_REMOVE_FAILED`, `SERIES_GENERATE_FAILED`, `SERIES_DELETE_FAILED`.

### Exit Codes

Structured failures exit with a semantic process code derived from the error's RFC 7807 `status` field. Agents can branch on the exit code without parsing stderr. The mapping is:

| Exit | Meaning | Status | Example error codes |
| --- | --- | --- | --- |
| `0` | Success | — | — |
| `1` | Unknown / unmapped | — | Unstructured crashes; any status outside the ranges below |
| `2` | Invalid input or usage | `4xx` (except `401`/`403`/`404`) | `UNKNOWN_MODEL`, `UNKNOWN_TOOL`, `INVALID_MODEL_ID`, `INVALID_TOOL_ID`, `INVALID_OPTION`, `INVALID_OUTPUT_PATH`, `INVALID_EDIT_PATH`, `INVALID_IMAGE_PATH`, `INVALID_STDIN`, `EMPTY_PROMPT`, `RESERVED_PROMPT`, `EDIT_PROMPT_SWALLOWED`, `TOO_MANY_REFERENCES` |
| `3` | Authentication / authorization | `401`, `403` | `MISSING_API_KEY` |
| `4` | Resource not found | `404` | `NO_PREVIOUS`, `SERIES_NOT_FOUND` |
| `5` | Upstream (fal) failure | `5xx` | `GENERATION_FAILED`, `UPSCALE_FAILED`, `RMBG_FAILED`, `VIDEO_FAILED`, `TOOL_FAILED`, `DESCRIBE_FAILED`, `SERIES_CREATE_FAILED`, `SERIES_REF_ADD_FAILED`, `SERIES_REF_REMOVE_FAILED`, `SERIES_GENERATE_FAILED`, `SERIES_DELETE_FAILED`, `SEGMENT_FAILED`, `ASK_FAILED`, `ERASE_FAILED`, `REFRAME_FAILED`, `ENHANCE_FAILED`, `LAYERS_FAILED`, `VECTORIZE_FAILED` |

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
  "model": "gpt2 | gpt | banana2 | banana | gemini | gemini3 | seedream4 | seedream45 | seedream5 | seedream5-lite | flux2-max | flux2-pro | flux2-flex | flux2-dev | flux2-turbo | flux | flux-fast | recraft | recraft4 | ideogram | ideogram4 | grok-image | qwen | qwen3",
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

Creative direction enriches the prompt with predefined clauses before the request body is built. There are eight fields, applied in this canonical order:

| Field      | CLI flag          | Purpose                  |
| ---------- | ----------------- | ------------------------ |
| `recipe`   | `--recipe <id>`   | Overall creative recipe  |
| `shot`     | `--shot <id>`     | Shot and framing         |
| `lighting` | `--lighting <id>` | Lighting treatment       |
| `genre`    | `--genre <id>`    | Genre and mood           |
| `camera`   | `--camera <id>`   | Camera and lens language |
| `color`    | `--color <id>`    | Color treatment          |
| `material` | `--material <id>` | Material or texture      |
| `motion`   | `--motion <id>`   | Motion treatment         |

Pass fields as CLI flags or as a `creative` object in stdin JSON:

```bash
# CLI flags
motif "a ceramic desk lamp" -m banana2 --shot close-up --lighting rim

# Stdin JSON
echo '{"prompt":"a ceramic desk lamp","model":"banana2","creative":{"shot":"close-up","lighting":"rim"}}' | motif
```

Per-field flags override the matching key in the stdin `creative` object. Only the fields you set are applied; the rest are left untouched.

An unknown option id fails before any fal request with a structured `INVALID_OPTION` error whose details include the field and the available ids for that field.

Option ids are versioned with the taxonomy. Do not hardcode them; read the live ids from `motif --describe --format json`.

The `generate` and `vary` commands both accept creative direction. Vary operates on the edit-capable model subset (`EDIT_CAPABLE_MODELS`) — the generation models whose fal endpoints support image editing.

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

3. **Always specify `--model`** explicitly. Don't rely on defaults — they're user-configured and may change between sessions.

4. **Always use `--no-open`** in automated pipelines. The default opens images in Preview.app, which will interrupt the agent.

5. **Always validate model names** against `motif --describe` output. Model names are short aliases (`gpt`, `banana`, `gemini`, `gemini3`), not full fal.ai endpoint names.

**NEVER do these things:**

1. **Never pass fal.ai endpoint strings as model names.** Use `gpt`, not `fal-ai/gpt-image-1.5`.

2. **Never use `../` or `%2e` in output paths.** Output is sandboxed to CWD. Traversal attempts are rejected with `INVALID_OUTPUT_PATH`.

3. **Never assume the last generation exists.** Always handle `NO_PREVIOUS` errors when using `--vary`, `--up`, or `--rmbg`.

4. **Never parse human-formatted output.** Always use `--format json` or pipe the command. Human output contains ANSI color codes, spinner animations, and emoji.

5. **Never send prompts with control characters.** They are stripped during sanitization, which may change the intended meaning.

### Fal Tool Invariants

1. **`estimatedCost: null` is not free.** It means metered or per-unit billing - the price depends on output megapixels, compute seconds, map count, layer count or tokens, none of which the CLI can know before the call. `estimatedCostPerMegapixel` / `estimatedCostPerSecond` carry the rate where there is one; the `pricing` string carries the full formula. Summing `estimatedCost ?? 0` across a plan will under-budget.

2. **29 of the 71 tools are `queued`.** They routinely exceed fal's 120-second synchronous window, so the CLI submits to the queue and polls. A Topaz restore taking over two minutes is normal. Set harness timeouts in minutes for these, and never retry one that looks stuck - each retry is another billable submission. Check with `--dry-run --fields queued`, or `motif tool describe <id>`.

3. **`-o dir/` writes every artefact; anything else writes only the primary.** Files in directory mode are named by the registry output key (`image.jpg`, `masks.png`), or by declared position labels where the registry has them - `patina -o pbr/` writes `basecolor.jpg`, `normal.jpg`, `roughness.jpg`, `metalness.jpg`, `height.jpg`. A reordered driving option (patina's `maps`) is honoured; a label count that doesn't match the URL count is dropped rather than guessed.

4. **Never hardcode tool ids or prices.** Both move with the registry. Read them from `motif tool list --format json` and `motif tool describe <id> --format json`.

5. **`motif tool run` has no `--no-open`** and never opens a viewer. The seven verbs do open one by default, so they need it in a pipeline.

6. **Some tools take `--inputs`, not a positional path.** Registry entries with `inputKind: "images"` (`got-ocr`, `nsfw`) send an array field. `motif tool describe <id>` reports `inputKind` and `inputField`.

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
| `gpt2` | $0.211 | Frontier OpenAI generation, transparent PNGs |

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
```

### How It Works

1. **Series run** turns a theme into one shared style prompt and one scene prompt per requested image
2. **Reference images** (tagged) are passed as `--edit` images to the model
3. **Outputs** are tracked per-series with full provenance (prompt, refs used, cost)
4. **Live series runs** reuse the first generated image as a style anchor for later images when the model supports references
5. **banana model** is recommended for series (14 reference images, best consistency)

### Series Invariants

- **Always `--dry-run` first.** Series generations cost real money.
- **Build refs before generating.** Style and character refs must exist before chapter illustrations.
- **Use `--refs` to select specific tags.** Don't send all refs if the model has a low limit.
- **banana supports 14 refs**, gpt supports 4, gemini/gemini3 support 4.
- Series data stored in `~/.motif/series/<slug>/`.

### All Series Commands

```bash
motif series create <name> [--from <img>] [--style <prompt>] [-m model] [-a aspect] [-r res]
motif series list
motif series show <slug>
motif series ref-add <slug> <image> [-t tag] [-d description]
motif series ref-remove <slug> <filename>
motif series gen <slug> "prompt" [--refs tags] [--dry-run] [-m model] [-a aspect] [-o output]
motif series run "theme" [--count n] [--series slug] [--refs tags] [--dry-run] [-m model] [-a aspect]
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
