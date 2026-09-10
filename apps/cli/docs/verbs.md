# Promoted verbs

Which fal tool each of the seven verbs calls, and the flags and outputs that differ between them. Part of the [CLI agent guide](../AGENTS.md), which covers what the verbs share. Read each verb's flags and outputs from `motif --describe <verb> --format json`.

| Verb | fal tool(s) | Notes |
| --- | --- | --- |
| `segment "<prompt>" [image]` | `sam3-image`, `sam3-image-rle` (`--rle`) | Emits `boxes` and `scores` alongside the mask files |
| `ask "<question>" [image]` | `moondream-query`, `-caption`, `-detect`, `-point` | Writes no file and records no history; answer is at `answer`. With a mode flag the first positional is the image |
| `erase "<prompt>" [image]` | `object-removal` |  |
| `reframe [image]` | `ideogram-reframe` | Needs one of `--og --square --cover --portrait --landscape --story --wide` |
| `enhance [image]` | eight Topaz endpoints | `--upscale` (default), `--generative`, `--creative`, `--transparent`, `--restore`, `--denoise`, `--sharpen`, `--adjust`. Two modes is `INVALID_OPTION`. All run through the fal queue |
| `layers [image] -o dir/` | `qwen-layered` | One file per layer, so `-o` must end in `/` |
| `vectorize [image] -o out.svg` | `recraft-vectorize` | `-o` must name a `.svg` or end in `/` |

Metered and per-unit endpoints report `cost: null` rather than a guessed number — `ask` is metered by tokens, so it always does.
