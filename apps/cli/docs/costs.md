# Cost reference

What each Model costs, by Task, for when you override the choice with `-m`. Part of the [CLI agent guide](../AGENTS.md). For the price of one call, run it with `--dry-run` and read `cost` and `costBasis`. Prices move with fal, so dry-run the call with `-m` before relying on this page.

## Reading a cost

| `costBasis` | Means |
| --- | --- |
| `projected` | A price worked out before the call from a flat or per-megapixel rate |
| `measured` | Worked out after the call from what came back (output size, provider metadata) |
| `unknown` | `cost` is `null`: tokens, compute seconds, layer or map count, or a rate fal doesn't define. Not free |

An agent that sums `cost ?? 0` across a plan will under-budget. Video costs 5 to 10 times an image.

## generate and vary

vary offers the Models marked edit.

| Model | Tier | Price | Notes |
| --- | --- | --- | --- |
| `gpt2` | quality | $0.211 | Edit. Very slow. Transparency runs through OpenAI, cost unknown |
| `banana2` | quality | $0.08 | Edit. $0.06 / $0.08 / $0.12 / $0.16 at 0.5K / 1K / 2K / 4K |
| `gpt` | quality | $0.133 | Edit. Transparency on fal |
| `sunburst` | quality | Metered | Edit. GPT Image 2.5 Sunburst, token-billed, 16 references |
| `gemini3` | quality | $0.15 | Edit. $0.30 at 4K |
| `mai-image-2.5-pro` | quality | ~$0.17 | Edit. One reference; edits ~$0.18-$0.27 |
| `seedream5` | quality | $0.0675 / $0.135 | Edit. $0.135 above 1536² |
| `flux2-max` | quality | $0.07/MP | Edit |
| `banana` | balanced | $0.15 | Edit. The default. 14 references, $0.30 at 4K |
| `ideogram3-transparent` | balanced | $0.06 | Always transparent, chosen only for `--transparent` |
| `flare` | balanced | Metered | Edit. GPT Image 2.5 Flare, token-billed, 16 references |
| `banana2-lite` | balanced | Metered | Token-billed, fixed 1K output (~$0.048), no edits |
| `qwen3` | balanced | $0.04 | $0.075 at 2K |
| `seedream4` | balanced | $0.03 | Edit |
| `flux2-flex` | balanced | $0.05/MP | Edit. Guidance and step controls through `--param` |
| `ideogram4` | balanced | $0.03 | Per-MP by rendering speed: $0.03 / $0.06 / $0.10 |
| `grok-image` | balanced | $0.02 | Edit |
| `recraft4` | balanced | $0.04 | Design generation |
| `flux2-pro` | balanced | $0.03/MP | Edit |
| `seedream45` | balanced | $0.04 | Edit |
| `grok-image-2` | balanced | $0.06 | Edit. $0.08 at 2K; edits add $0.01 per input image |
| `recraft41` | balanced | $0.035 | Design generation |
| `flux2-turbo` | fast | $0.008/MP |  |
| `flux2-dev` | fast | $0.00167/sec | Edit. ~$0.012 an image |
| `flux-fast` | fast | $0.003 | Cheapest draft |
| `seedream5-lite` | fast | $0.035 | Edit |
| `gemini` | fast | $0.04 | Edit |
| `qwen` | fast | $0.02/MP |  |
| `ideogram` | fast | $0.03 | Strong text rendering |
| `recraft` | fast | $0.04 | Design and vector-friendly styles |
| `flux` | fast | $0.06 | Edit. FLUX Pro Ultra |

## animate

| Model | Tier | Price |
| --- | --- | --- |
| `kling` | balanced | $0.112/sec without audio, $0.168/sec with. A 5s clip with audio is $0.84 |
| `kling-turbo` | fast | $0.14/sec |

## erase

| Model | Tier or mode | Price |
| --- | --- | --- |
| `finegrain-eraser` | quality | $0.27. Removes shadows and reflections too; $0.18 express, $0.36 premium |
| `object-removal` | balanced | $0.024. Leaves cast shadows |
| `bria-eraser` | quality, with `--mask` | $0.04 |
| `object-removal-mask` | balanced, with `--mask` | $0.024 |
| `object-removal-bbox` | `--boxes` | $0.024 |
| `text-removal` | `--text` | $0.04 |
| `bria-genfill` | `--with` | $0.04 |

## cutout

| Model                | Tier     | Price             |
| -------------------- | -------- | ----------------- |
| `bria-rmbg`          | quality  | $0.018            |
| `birefnet`           | balanced | Metered           |
| `ben-v2`             | balanced | $0.025/MP         |
| `rembg`              | fast     | Metered           |
| `bria-video-rmbg-v3` | video    | $0.05/sec, queued |
| `bria-video-rmbg`    | video    | $0.14/sec, queued |

## reframe

| Model | Tier or mode | Price |
| --- | --- | --- |
| `ideogram-reframe` | balanced | $0.06; $0.03 turbo, $0.09 quality through `--param` |
| `bria-expand` | fast | $0.04 |
| `flux-outpaint` | `--margin` | Metered: $0.03 for the first output MP, then $0.015 per extra MP |
| `smart-resize` | `--sizes` | Metered: $0.15 per output image, doubled at 4K, plus $0.05 a request. Queued |

## upscale

Topaz bills per 24 output megapixels, so a 4x upscale of a 2MP source (32MP out) costs more than the headline.

| Model | Tier or mode | Price |
| --- | --- | --- |
| `topaz-precision` | quality | $0.08 per 24 output MP. Queued |
| `topaz-image` | quality | $0.08 to 24MP, $0.16 to 48MP, up to $1.36. Queued |
| `clarity` | balanced | $0.03/MP |
| `seedvr-upscale` | balanced | $0.001/MP. Queued |
| `crystal` | fast | $0.02 |
| `topaz-transparent` | `--transparent` | $0.08 per 24 output MP. Queued |
| `topaz-video` | video | $0.01/sec to 720p, $0.02 to 1080p, $0.08 above. Queued |
| `topaz-generative` | `--generative` | $0.24 per 24 output MP. Queued |
| `topaz-creative` | `--creative` | $0.96 per 24 output MP. Queued |

## restore

| Model | Mode | Price |
| --- | --- | --- |
| `topaz-restore` | (none), `--scratches` | $0.48 per 24 output MP; $0.08 with Dust-Scratch V2. Queued |
| `topaz-denoise` | `--noise` | $0.08 per 24 output MP; $0.16 with Denoise Max. Queued |
| `topaz-sharpen` | `--softness` | $0.08 per 24 output MP; $0.16 with Super Focus. Queued |
| `topaz-adjust` | `--tone` | $0.08 per 24 output MP. Queued |
| `control-light` | `--dark` | $0.03/MP |
| `ddcolor` | `--colour` | $0.001/MP |

## relight

| Model                  | Mode             | Price     |
| ---------------------- | ---------------- | --------- |
| `iclight-v2`           | (none), `--mood` | $0.10/MP  |
| `lighting-restoration` | `--even`         | $0.035/MP |
| `remove-lighting`      | `--flat`         | $0.035/MP |

## restyle and try-on

| Model            | Task    | Price          |
| ---------------- | ------- | -------------- |
| `telestyle-v2`   | restyle | $0.035/MP      |
| `virtual-try-on` | try-on  | $0.075. Queued |

## segment

| Model | Tier or mode | Price |
| --- | --- | --- |
| `sam3-1-image` | quality | $0.01 |
| `sam3-image` | balanced | $0.005 |
| `sam3-1-video` | quality, video | $0.01 per 16 frames. Queued |
| `sam3-video` | balanced, video | $0.005 per 16 frames. Queued |
| `sam2-auto` | `--auto` | Metered. Queued |
| `sam3-image-rle`, `sam3-video-rle` | `--rle` | $0.005 a request, or per 16 frames of video |

## ask

| Model | Mode | Price |
| --- | --- | --- |
| `moondream-query`, `moondream-caption`, `moondream-detect`, `moondream-point` | (none), `--caption`, `--detect`, `--point` | Metered: $0.40/M input tokens, $3.50/M output |
| `got-ocr` | `--read` | Metered, listed at $0.05/image. Queued |
| `nsfw` | `--safe` | Metered, listed at $0.001/image |

## layers

| Model | Tier or mode | Price |
| --- | --- | --- |
| `seedream-layerize` | quality | Metered: $0.03375 per layer below 1536x1536, $0.0675 above. Queued |
| `qwen-layered` | balanced | Metered, listed at $0.05/image. Queued |
| `ideogram-layerize-text` | `--text` | $0.09. Queued |

## vectorize

| Model               | Tier     | Price                            |
| ------------------- | -------- | -------------------------------- |
| `recraft-vectorize` | balanced | $0.04; $0.08 with a vector style |
| `image2svg`         | fast     | $0.005                           |

## map

Every map Model is metered at fal's listed $0/compute-second, so `cost` is `null`, except `dwpose` (`--pose`) at $0.0006/compute-second.

| Mode          | quality          | balanced             | fast          |
| ------------- | ---------------- | -------------------- | ------------- |
| (none), depth | `marigold-depth` | `depth-anything`     | `midas-depth` |
| `--edges`     | `teed`           | `hed`                | `pidi`        |
| `--lineart`   |                  | `lineart`            |               |
| `--lines`     |                  | `mlsd`               |               |
| `--metric`    |                  | `zoe-depth`          |               |
| `--normals`   |                  | `midas-preprocessor` |               |
| `--pose`      |                  | `dwpose`             |               |
| `--scribble`  |                  | `scribble`           |               |
| `--segments`  |                  | `sam-preprocessor`   |               |

## material and tile

| Model | Task and mode | Price |
| --- | --- | --- |
| `patina` | material | Metered: $0.01 base plus $0.01/MP per map, ~$0.06 for five maps at 1MP. Queued |
| `patina-extract` | material `--extract` | Metered: $0.10 base plus $0.02/MP and $0.01/MP per map. Queued |
| `ideogram-tiling` | tile | $0.06/MP; $0.03 turbo, $0.10 quality |
| `seedvr-seamless` | tile `--upscale` | $0.0025/MP. Queued |

## mesh

| Model | Tier or mode | Price |
| --- | --- | --- |
| `meshy-v7` | quality, and `--rig` | $1.20 textured; plus $0.20 for rigging. Queued |
| `hunyuan3d-v3` | quality | $0.375. Queued |
| `trellis-2` | balanced | $0.30 at 1024p. Queued |
| `sam3-3d-body` | `--body` | Metered. Queued |
| `sam3-3d-objects` | `--objects` | Metered, one mesh per object. Queued |
