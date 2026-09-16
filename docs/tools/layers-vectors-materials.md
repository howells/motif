# Layers, vectors and materials

Tasks that take a flat image apart into something you can work with afterwards: type you can reset, objects you can re-compose, paths you can scale, and surface maps you can light.

## layers --text is not what the name suggests

The obvious reading of `motif layers --text` is that it hands back RGBA layers, like a PSD. It doesn't, and the gap between the name and the behaviour is the single most useful thing on this page.

The Model behind it (Ideogram's text layerize) declares four outputs: `image_layers`, `image`, `text_html` and `text_containers`. Run it on a piece of typography and what you get is:

- **`image`** - the source with the type lifted off and what sat behind it rebuilt.
- **`text_containers`** - the type as structured data. One entry per text run, with its pixel position, its alignment, and candidate fonts.
- **`text_html`** - a positioned HTML reconstruction of the type, ready to render over the plate.
- **`image_layers`** - which, on a text-only source, came back **empty**.

```bash
motif layers source-label.jpg --text -o layers/ --no-open
```

| Source | `layers/image.jpg` |
| --- | --- |
| ![A letterpress label reading SALVAGE & CO on textured paper](examples/source-label.jpg) | ![The same label with the type gone, paper grain and plaster intact](examples/layers/image.jpg) |

The deckle edge, the paper grain, the fibre flecks and the plaster behind are all still there. Only the type is gone - and it isn't lost, it's in `text_containers` with the coordinates it came from.

**So `layers --text` is a re-typesetting tool.** You use it when you have a rendered design and you want to change the words: take the plate, take the positions and fonts, set new copy, composite. That is a real job, and it is not "give me PSD layers".

$0.09 an image, queued.

### The layers that are layers

| Command | Returns | Price |
| --- | --- | --- |
| `motif layers` | `images` - stacked RGBA layers (Qwen) | metered, listed at $0.05/image, queued |
| `motif layers --tier quality` | A named, z-ordered object stack in `layers`, plus flattened `images` (Seedream) | metered - per generated layer, queued |

fal lists the Qwen Model at $0.05 per image but does not say whether that counts the image you send or each of the layers it returns. Rather than assert a per-call price on the more favourable reading, Motif reports no estimate - `cost` comes back `null`.

```bash
motif layers poster.png -o layers/ --no-open
```

Pass `-o` ending in a slash. One file per layer means one directory; a filename keeps only the first layer.

### The quality Tier takes the scene apart

The two layer Models do opposite jobs. `--text` extracts _type_. `--tier quality` extracts _objects_ - and it names them.

```bash
motif layers source-apothecary.jpg --tier quality -o layers/ --no-open
```

Run against the apothecary still life, it returns a five-layer stack:

| `z_index` | `name`                         | Bounding box       |
| --------- | ------------------------------ | ------------------ |
| 0         | the background plate           | full frame         |
| 1         | Left amber glass bottle        | 327,388 → 453,686  |
| 2         | Middle amber glass pump bottle | 488,382 → 606,692  |
| 3         | Small right amber glass bottle | 656,475 → 752,681  |
| 4         | White ceramic bowl             | 822,527 → 1047,680 |

![Three amber bottles and a white bowl on a travertine shelf](examples/source-apothecary.jpg)

Two things make that more useful than a flat RGBA split.

**Layer 0 is whatever is left over, which is not the same as an empty scene.** It holds the complement of the layers you asked for. Unprompted, as here, the model picks out the objects and layer 0 is the plate behind them - plaster wall, travertine ledge and raking light intact, the scene with the props taken out.

Prompt it, and layer 0 changes with the prompt. Ask an interior for "the ceiling, each wall plane, the skirting board" and layer 0 comes back holding the sofa, the lamp, the floor and the picture: a room full of furniture with no walls. That is correct behaviour and it surprises people, because the name suggests a background and what it actually means is _the residual_.

So: **layer 0 is the background plate only when the layers you asked for are the foreground.** Do not build on it as a clean plate without checking what your own prompt left behind.

**`image_size` moves the reporting frame, not the render resolution.** Layers come back rendered at their own working resolution and reported against a box in frame-space, and the two are not the same number. Measured across `auto` and `auto_1.5K` on the same source, the frame scales but the per-layer factor barely moves: a wide wall arrives at exactly its box, a narrow one at about 2.6x it, in both settings. The scaling is uniform, so resizing back to the box is a clean downsample rather than a correction. The response reports each layer's width and height as `null` - use `-o dir/ --fields files`, which reports the dimensions Motif measured on download.

Thanks to the Samplize session, who measured this on production interiors and caught the sign of it before I did.

**Each object layer is cropped to its own bounding box on transparency**, and carries a human-readable `name` and `description` alongside `z_index` and both absolute and normalised coordinates.

So you get a still life you can re-compose. Move the bowl, drop a bottle, swap the background - no regeneration, no masking by hand.

**One thing to know today: the filenames are positional, the names are not.** Files download as `layers.png`, `layers-2.png`, `layers-3.png` and so on, in z-order. The `name` for each is in the JSON response, not on disk, so read the response to know which file is which. Tracked as MOT-41.

Billing is per generated layer, not per call - $0.03375 a layer below 1536x1536 total area, $0.0675 above - so `cost` comes back `null`. The five-layer decomposition above is five times the unit price, and the CLI cannot know the layer count before it runs.

## Vector

`motif vectorize` has two Models, and the choice is about what you want the SVG to be.

| Command | Output | Price | Character |
| --- | --- | --- | --- |
| `motif vectorize` | One clean SVG (Recraft) | $0.04, $0.08 with a vector style | Few paths, tidy curves, editable |
| `motif vectorize --tier fast` | Layered SVG (image2svg) | $0.005 | Traced, many paths, faithful to pixels |

```bash
motif vectorize logo.png -o logo.svg --no-open
```

The saved file always takes the `.svg` extension.

### Generate, then vectorise

The pairing that makes this useful is generating a mark with a Model that draws cleanly and then converting it. Recraft is built for design and vector work, so it is a natural front half - an override worth making:

```bash
motif "a minimal letterpress wordmark, SALVAGE & CO, single weight serif, flat black on white" -m recraft --square --no-open --format json --fields images
motif vectorize wordmark.png -o wordmark.svg --no-open
```

$0.04 to generate, $0.04 to vectorise. Worth generating three or four candidates (one call each: Recraft returns one image a call) and vectorising only the one you keep - the raster pass is where the design decision happens, and the vector pass is mechanical.

`--tier fast` at $0.005 is the one to reach for when you want a literal trace of a photograph rather than a clean mark.

## Materials

| Command | Job | Price |
| --- | --- | --- |
| `motif material` | Decompose a surface into PBR maps | metered, queued |
| `motif material --extract "<region>"` | Extract a _tiling_ material from a named region | metered, queued |
| `motif tile "<prompt>" [image]` | Generate a seamlessly tiling texture | $0.06/MP |
| `motif tile <tile> --upscale` | Upscale a tiling texture, keeping the seams | $0.0025/MP, queued |

### Photo to PBR

```bash
motif material source-linen.jpg -o pbr/ --no-open
```

The Model returns its five maps in one `images` array, and Motif knows what each position is, so `-o pbr/` writes:

```
pbr/basecolor.jpg
pbr/normal.jpg
pbr/roughness.jpg
pbr/metalness.jpg
pbr/height.jpg
```

Not `images-2.jpg` through `images-5.jpg`, which is what you get from an array output with no declared order and which tells you nothing about which map is which.

| Source | `basecolor.jpg` | `normal.jpg` | `roughness.jpg` |
| --- | --- | --- | --- |
| ![A macro photograph of folded linen weave](examples/source-linen.jpg) | ![The linen weave with the lighting mostly evened out](examples/pbr/basecolor.jpg) | ![A blue-violet tangent-space normal map of the weave](examples/pbr/normal.jpg) | ![A greyscale roughness map, dark across the weave](examples/pbr/roughness.jpg) |

Two things worth noticing in those maps.

The **basecolor** is noticeably flatter than the source. The bright fold running across the top left has been largely de-lit, which is the job.

The **roughness** map has not fully escaped it. That same fold still reads as a lighter band across an otherwise near-black map - baked lighting from the photograph leaking into a channel that should only describe the surface. If you care about that, run [`motif relight --flat`](repair-and-restore.md#lighting) over the photograph first at $0.035/MP and feed the flattened version to `material`.

### Fewer maps, or a different order

The Model takes a `maps` field. To ask for two maps, or a different order, override with `-m patina` and send it through `--param`; the filenames follow the request rather than the default order:

```bash
motif material source-linen.jpg -m patina --param 'maps=["normal","basecolor"]' -o pbr/ --no-open
```

That writes `pbr/normal.jpg` and `pbr/basecolor.jpg`. The naming is dropped entirely if the label count doesn't match the number of files that came back - a mislabelled map reads as authoritative and is worse than a positional one.

**`material` is metered.** Its real cost is $0.01 base plus $0.01 per megapixel _per output map_, so all five maps on a 1MP source is about $0.06 - and asking for two maps is genuinely cheaper than asking for five. No flat number can express that, so `cost` is `null`.

### Tiling materials

`material --extract` does a different job: you name a region of a photograph and it extracts a _tiling_ material from it, rather than decomposing the frame you gave it.

```bash
motif material source-linen.jpg --extract "the linen weave" -o material/ --no-open
```

Metered - $0.10 base, plus $0.02/MP and $0.01/MP per map, so 1MP with all five maps is around $0.17. Same output naming as `material`.

`motif tile` generates a tiling texture outright, from a prompt, optionally conditioned on a source image, at $0.06 per megapixel. `tile --upscale` enlarges a tile you already have while keeping its edges seamless, at $0.0025 per megapixel - a plain upscaler would break the tiling, which is the whole reason it exists.

```bash
motif tile "loose linen weave, natural undyed" source-linen.jpg -o tile.png --no-open
motif tile tile.png --upscale -o tile-2k.png --no-open
```

## Costs on this page

Most of these report `cost: null`:

| Command | Why it's null |
| --- | --- |
| `material`, `material --extract` | Billed per megapixel _per map_ |
| `layers`, `layers --tier quality` | Billed per image or per generated layer, and fal doesn't make the count clear before it runs |
| `tile`, `tile --upscale` | Billed per megapixel of output |

`layers --text` ($0.09) and both vectorize Models ($0.04 and $0.005) have a flat per-call price and report a number.

`null` is not free. It means the bill depends on something the CLI cannot see before the call - output size, map count, layer count. [The cost reference](../../apps/cli/docs/costs.md#material-and-tile) carries the formulas.

---

- [Understanding images](understanding-images.md) - segment, ask, read
- [Repair and restore](repair-and-restore.md) - flatten the lighting before extracting maps
- [Pipelines](pipelines.md) - generate then vectorise, photo then PBR
