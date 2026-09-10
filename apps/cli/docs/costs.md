# Cost reference

What each generation model, processing model, video model and fal tool costs. Part of the [CLI agent guide](../AGENTS.md). For the exact estimate on one call, run it with `--dry-run`.

## Image Generation

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

## Processing

| Model               | Per Use  | Notes                          |
| ------------------- | -------- | ------------------------------ |
| `clarity` (upscale) | $0.03/MP | Default upscaler               |
| `crystal` (upscale) | $0.02    | Alternative upscaler           |
| `rmbg`              | $0.02    | Background removal             |
| `bria`              | $0.02    | Alternative background removal |

## Video

| Model               | Per Second | Notes           |
| ------------------- | ---------- | --------------- |
| `kling` (audio off) | $0.112/sec | 5s clip = $0.56 |
| `kling` (audio on)  | $0.168/sec | 5s clip = $0.84 |

## Fal Tools

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
