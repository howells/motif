# Generate and vary

Everything `generate` and `vary` accept: Tiers, override Models, references, looks and moods, stdin JSON, transparency and prompt warnings. Part of the [CLI agent guide](../AGENTS.md). Other Tasks are in [tasks](verbs.md).

## generate

`motif "prompt"` - make an image from a prompt, or change an image you pass as a reference with `-e`.

Instead: variations of an image you already have (vary), or a consistent set of images (series run).

```bash
motif "a ceramic desk lamp on oak" --dry-run
motif "a ceramic desk lamp on oak" --tier quality --landscape -n 2 --dry-run
motif "turn this into a watercolour poster" -e photo.png -e palette.png --dry-run
```

Task options any capable Model can honour: `-a/--aspect` or a preset (`--og`, `--square`, `--cover`, `--portrait`, `--landscape`, `--story`, `--reel`, `--feed`, `--wallpaper`, `--wide`, `--ultra`), `-r/--resolution`, `-n/--num` (1-4), `--seed`, `--negative`, `--output-format`, `--transparent`, `-e/--edit` (a reference, repeatable) and `--mask` (with `-e`). A request that needs something narrows the Models that qualify: several references, transparency or a mask rule out Models that can't take them.

`-e` takes one path per flag and repeats: `motif -e a.png -e b.png "a cat"`. The prompt can go anywhere.

## vary

`motif vary [image]` - make variations of an image you already have.

Instead: a specific change to an image described in words (generate with a reference), or a set of different scenes in one style (series run).

Flags: `--prompt <text>` (default: the source's prompt), `-n/--num`, `--look`, `--mood`, `--no-mood`, `--tier`, `-m`, `--param`, `--seed`. The image falls back to the last generation. vary reuses the Model that made the image while Motif still offers it; otherwise it chooses one the way generate would, from the Models that can edit.

```bash
motif vary hero.png -n 4 --dry-run
motif vary hero.png --prompt "the same room at night" --dry-run
```

## Tiers

`--tier fast|balanced|quality` moves Motif's choice along the generate ranking. The default is `balanced`. `fast` picks cheap, quick Models (under about $0.04 an image); `quality` picks the best-ranked ones, which cost more and are often much slower.

A look carries its own Model, so `--tier` has no effect when `--look` is set. The order is `-m`, then the look's Model, then a pinned Model in config (`tasks.generate.model`), then the ranking at the chosen Tier.

## Override Models

`-m <id>` runs that Model instead of the ranked choice. The list is the generate ranking, best first within each Tier. vary offers the ones that can edit.

| Tier | Models |
| --- | --- |
| quality | `gpt2`, `banana2`, `gpt`, `sunburst`, `gemini3`, `mai-image-2.5-pro`, `seedream5`, `flux2-max` |
| balanced | `banana` (the default), `ideogram3-transparent` (only for `--transparent`), `flare`, `banana2-lite`, `qwen3`, `seedream4`, `flux2-flex`, `ideogram4`, `grok-image`, `recraft4`, `flux2-pro`, `seedream45`, `grok-image-2`, `recraft41` |
| fast | `flux2-turbo`, `flux2-dev`, `flux-fast`, `seedream5-lite`, `gemini`, `qwen`, `ideogram`, `recraft`, `flux` |

Prices are in the [cost reference](costs.md#generate-and-vary). Read the live list from `motif --describe generate --format json`.

### Model-only options

Options only one Model understands (Recraft styles, FLUX steps, Ideogram's rendering speed, web search) go through `--param key=value`, which needs `-m`. Values parse as JSON where they can.

```bash
motif "a jazz night poster" -m ideogram --param style=DESIGN --dry-run
motif "an editorial portrait" -m flux2-flex --param num_inference_steps=40 --dry-run
```

`--quality` values finer than the Tiers, such as `xhigh` or `max` on the GPT Image 2.5 Models, need `--param` with `--model`:

```bash
motif "a ceramic vase in window light" -m flare --param quality=xhigh --dry-run
```

The old flags (`--quality`, `--rendering-speed`, `--thinking`, `--style`, `--background`, `--web-search` and the rest) exit `2` with `REMOVED_COMMAND` naming the replacement.

## Looks and moods

A look is a house visual register added to the prompt, with its own Model and aspect ratio. A mood is a light condition. Set them with `--look <id>` and `--mood <id>`; `motif --describe --format json` carries the sentences each adds.

Looks: `editorial`, `still-life`, `interior`, `architectural`, `portrait`, `object`, `surface`, `abstract`, `illustration`. Moods: `window`, `dawn`, `raking`, `overcast`, `lamplit`, `nocturne`.

Precedence for the Model: `-m`, then the look's Model, then a pinned Model, then the ranking at the chosen Tier. For the aspect: `-a` or a preset, then the look's, then `defaultAspect` in config. The flat looks `object`, `surface`, `abstract` and `illustration` refuse a mood with `INVALID_OPTION`. `--no-mood` drops a mood, including one pinned on a Series. No look renders lettering; for type in the picture, use `-m ideogram4`.

```bash
motif "a green kitchen" --look interior --mood overcast --dry-run
```

## Stdin JSON

```bash
echo '{"prompt":"a cat","tier":"fast","aspect":"16:9","numImages":2}' | motif --dry-run
echo '{"prompt":"a cat","model":"gpt"}' | motif --landscape -r 4K --dry-run
```

Flag values override stdin values for the same field. The schema:

```json
{
  "prompt": "string (required)",
  "tier": "fast | balanced | quality",
  "model": "flare | sunburst | gpt2 | gpt | banana2 | banana | gemini | gemini3 | seedream4 | seedream45 | seedream5 | seedream5-lite | flux2-max | flux2-pro | flux2-flex | flux2-dev | flux2-turbo | flux | flux-fast | recraft | recraft4 | ideogram | ideogram4 | grok-image | grok-image-2 | qwen | qwen3 | mai-image-2.5-pro | banana2-lite | ideogram3-transparent | recraft41",
  "aspect": "auto | 1:1 | 4:3 | 3:4 | 16:9 | 9:16 | 3:2 | 2:3 | 4:5 | 5:4 | 21:9 | 4:1 | 1:4 | 8:1 | 1:8",
  "resolution": "0.5K | 1K | 2K | 4K",
  "numImages": 1,
  "output": "filename.png",
  "editImages": ["path/to/ref.png"],
  "transparent": false,
  "preset": "cover | square | landscape | portrait | story | reel | feed | og | wallpaper | wide | ultra",
  "creative": { "look": "editorial", "mood": "overcast" },
  "noOpen": true
}
```

`motif --describe generate --format json` is the live schema.

## Transparency

`--transparent` narrows the choice to Models that return alpha. At `balanced` and `fast` that is `ideogram3-transparent`, which runs on fal and needs no extra key. At `quality` it is `gpt2`, which runs through OpenAI (`gpt-image-2`) because fal's GPT Image 2 endpoint hasn't been confirmed to return alpha. That route needs `OPENAI_API_KEY`; without it the run fails with `MISSING_API_KEY` (exit `3`) and `details.envVar`. The dry run shows `provider: "openai"`. OpenAI prices by tokens, so `cost` is `null`. A request OpenAI can't carry, such as one with `--seed`, falls back to `ideogram3-transparent`; with `-m gpt2` it fails with `NO_MODEL_AVAILABLE` and `blockedBy: "seed"` instead. `-m gpt --transparent` stays on fal.

Every `--transparent` run reads the saved PNG back. With no alpha channel or no fully transparent pixel it fails with `TRANSPARENCY_MISSING` (status `502`, exit `5`, retriable): nothing is reported as a success or recorded in history, and the file stays on disk (`details.paths`).

## Prompt warnings

`generate` puts `warnings: [{rule, match, message}]` in dry-run JSON and in successful JSON output (empty when nothing matches), and prints them in yellow in human output. They are advisory: generation still goes ahead. They check the caller's own prompt only, never the look or mood text.

| Rule | Fires on | Why |
| --- | --- | --- |
| `negated-object` | `no <word>` (optionally `no a/an/the <word>`), except text, logos, logo, people, person, faces, watermark, watermarks, words, lettering | Negating an object tends to draw it into the picture; describe what is present instead |
| `text-bearing-object` | `no text` or `no words` together with sign, label, poster, book, menu, newspaper, packaging, card, ticket, magazine or screen | The model is likely to render text on the object anyway |
| `edit-has-verb` | a prompt starting with remove, erase, extend or outpaint, with `-e` set | An edit regenerates the whole image; `motif erase` or `motif reframe` does that job and leaves the rest alone |
