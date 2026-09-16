# Tasks

One verb per Task: its usage, modes, flags and what to use instead. Part of the [CLI agent guide](../AGENTS.md). The live source is `motif <verb> --help` and `motif --describe <verb> --format json`; `motif --describe tasks --format json` maps task words ("inpaint", "rmbg", "depth") to the verb.

`generate` and `vary` are covered in [generate input](generate.md). Prices for every override Model are in the [cost reference](costs.md).

## What every Task verb shares

- **Motif chooses the Model.** It takes the highest-ranked Model that can do what the request asks for (a mask, transparency, a video, a mode) at the chosen Tier. The prompt never affects the choice.
- `--tier fast|balanced|quality` moves the choice along the Task's ranking. The default is `balanced`. A Task with nothing at a Tier falls back to the nearest Model that can do the job, so `--tier fast` on `erase` still runs.
- `-m <model>` runs that Model instead. `--param key=value` (repeatable) sends a Model-only request field and needs `-m`.
- A **mode** is a flag such as `--text` or `--pose`. One mode per call; two is `INVALID_OPTION`.
- The trailing image is optional and falls back to the last generation. Pass it explicitly in a pipeline.
- `--dry-run` resolves the Model, builds the request and prices it without a key or a call. `--seed`, `-o`, `--format`, `--fields` and `--no-open` work everywhere.
- `-o` ending in `/` writes every file the Model returned into that directory, named by output key or label (`basecolor.jpg`, `masks.png`). Anything else writes the primary file only.
- JSON output carries `task`, `model`, `tier`, `chosenBy` (`ranking`, `model`, `look` or `pin`), `cost` and `costBasis` (`measured`, `projected` or `unknown`), then `path`, `width`, `height`, `size` and `files` when files were written, plus any data the Model returned (`answer`, `boxes`, `scores`). A dry run has `output` and `request` instead of `path`.
- `cost: null` with `costBasis: "unknown"` means the price depends on something only the call knows (tokens, output megapixels, seconds, map or layer count). It is not free.
- Slow Models (Topaz, Patina, layers, mesh, try-on, video segmentation) run through fal's queue and can take minutes. Don't retry one that looks stuck: every retry is billed.
- Failures from the provider exit `5` with `TASK_FAILED`, carrying `details.task` and `details.model`.

## erase

`motif erase [what] [image]` - remove an object, person, text or clutter from an image and fill the gap.

Instead: the whole background (cutout), or extending the canvas (reframe).

| Flag | Does |
| --- | --- |
| (none) | Remove the named thing |
| `--mask <path>` | Remove what the mask marks in white |
| `--boxes <x,y,w,h;...>` | Remove whatever falls inside these pixel boxes |
| `--text` | Remove all rendered text |
| `--with <fill>` | With `--mask`, fill the region with something described in words |

`--tier quality` runs an eraser that also removes the object's shadow and reflections, at about ten times the price. See [repair and restore](../../../docs/tools/repair-and-restore.md).

```bash
motif erase "the parked car" street.jpg --dry-run
motif erase "the parked car" street.jpg --tier quality --dry-run
motif erase poster.png --text --dry-run
```

## cutout

`motif cutout [image-or-video]` - remove the background behind the main subject of an image or video.

Instead: cutting one named thing out of a scene, such as the chair in a room (segment), or taking an object out and filling the gap (erase).

Flags: `--output-format jpeg|png|webp`. A video source picks a video Model.

```bash
motif cutout product.jpg -o product-cutout.png --dry-run
motif cutout clip.mp4 --dry-run
```

## reframe

`motif reframe [image] --og` - extend or recut an image to a new aspect ratio, generating the new edges.

Instead: a new image at a given ratio (generate with a ratio).

| Flag | Does |
| --- | --- |
| `-a <ratio>` or a preset: `--og`, `--square`, `--cover`, `--portrait`, `--landscape`, `--story`, `--wide` | The target ratio. One is required |
| `--margin <px>` | Extend by pixels: one number, or `top,right,bottom,left` |
| `--sizes <WxH,...>` | Several target sizes at once, each recomposed |

```bash
motif reframe cover.png --story --dry-run
motif reframe cover.png --margin 200,0,200,0 --dry-run
motif reframe cover.png --sizes 1080x1920,1200x630 -o sizes/ --dry-run
```

## upscale

`motif upscale [image-or-video]` - make an image or video larger without losing detail.

Instead: fixing noise, softness or colour without changing the size (restore).

| Flag            | Does                                       |
| --------------- | ------------------------------------------ |
| `--scale <n>`   | Upscale factor                             |
| `--transparent` | Keep the alpha channel                     |
| `--generative`  | Synthesise plausible detail as it enlarges |
| `--creative`    | Reimagine detail as it enlarges            |

```bash
motif upscale photo.jpg --scale 2 --dry-run
motif upscale photo.jpg --tier quality --dry-run
motif upscale logo.png --transparent --dry-run
```

## restore

`motif restore [image]` - fix noise, softness, damage, colour or tone without changing the size.

Instead: making an image larger (upscale).

| Flag          | Does                                   |
| ------------- | -------------------------------------- |
| (none)        | General restoration                    |
| `--scratches` | Repair scratches, tears and damage     |
| `--noise`     | Remove noise                           |
| `--softness`  | Sharpen a soft or blurred image        |
| `--tone`      | Fix exposure, white balance and colour |
| `--dark`      | Brighten a dark or underexposed photo  |
| `--colour`    | Colourise a black-and-white photograph |

```bash
motif restore old-photo.jpg --scratches --dry-run
motif restore old-photo.jpg --colour --dry-run
```

## relight

`motif relight [image] [light]` - change the light in a photo without regenerating it.

Instead: regenerating the scene in a new light (generate with a mood).

| Flag | Does |
| --- | --- |
| `"light"` positional | Relight to a described light |
| `--mood <id>` | Relight to a house mood: `window`, `dawn`, `raking`, `overcast`, `lamplit`, `nocturne` |
| `--mask <path>` | Relight only what the mask marks in white |
| `--even` | Restore natural, even lighting |
| `--flat` | Strip baked-in light and shadow |

```bash
motif relight kitchen.jpg "low warm evening sun from the left" --dry-run
motif relight kitchen.jpg --mood overcast --dry-run
motif relight linen.jpg --flat --dry-run
```

## restyle

`motif restyle [image] --like <image>` - redraw an image in the style of a reference image.

Instead: a house style kept across images (generate with a look).

```bash
motif restyle photo.jpg --like watercolour.jpg --dry-run
```

## segment

`motif segment [what] [image-or-video]` - mask or cut out a named thing in an image or video.

Instead: the background behind the subject (cutout), or boxes without masks (ask detect).

| Flag     | Does                                                |
| -------- | --------------------------------------------------- |
| (none)   | Masks of the named thing, with `boxes` and `scores` |
| `--auto` | Segment every region without a prompt               |
| `--rle`  | Run-length encoded masks instead of mask images     |

```bash
motif segment "the white ceramic bowl" shelf.jpg -o segment/ --dry-run
motif segment "the white ceramic bowl" shelf.jpg --rle --dry-run
```

## ask

`motif ask [question] [image]` - answer a question about an image, caption it, count or find things in it.

Instead: pixel masks of a named thing (segment).

| Flag               | Returns                                             |
| ------------------ | --------------------------------------------------- |
| (none)             | `answer`, and `reasoning` where the Model gives one |
| `--caption`        | A caption in `answer`                               |
| `--detect <thing>` | Bounding boxes in `objects`                         |
| `--point <thing>`  | A point on every instance in `points`               |
| `--read`           | The transcribed text                                |
| `--safe`           | Whether the image is safe for work                  |

With a mode flag the only positional is the image. `ask` writes no file and records no history. It is metered by tokens, so `cost` is `null`.

```bash
motif ask "how many bottles are there?" shelf.jpg --dry-run
motif ask --detect "amber bottle" shelf.jpg --dry-run
motif ask --read label.jpg --dry-run
```

## layers

`motif layers [image]` - split an image into transparent layers.

Instead: masking one named thing (segment), or removing the background (cutout).

| Flag | Does |
| --- | --- |
| (none) | Stacked RGBA layers |
| `--text` | Separate the text from the artwork, returning the plate and the type as data |

`--tier quality` returns named, z-ordered object layers. Pass `-o` ending in `/` to keep every layer; a filename keeps only the first.

```bash
motif layers poster.png -o layers/ --dry-run
motif layers label.jpg --text -o layers/ --dry-run
```

## vectorize

`motif vectorize [image]` - trace a raster image to a clean SVG.

Instead: drawing a new image from a prompt (generate).

`--tier fast` traces faithfully with many paths at an eighth of the price. The saved file always takes the `.svg` extension, whatever `-o` says.

```bash
motif vectorize logo.png -o logo.svg --dry-run
```

## map

`motif map [image]` - make a control map of an image: depth, edges, lines, normals or pose.

Instead: masks of a named thing (segment), or PBR material maps (material).

| Flag         | Map                                                    |
| ------------ | ------------------------------------------------------ |
| (none)       | Depth                                                  |
| `--metric`   | Metric depth, in real distances                        |
| `--normals`  | Surface normals                                        |
| `--edges`    | Soft edges                                             |
| `--lineart`  | Line art                                               |
| `--lines`    | Straight line segments, for architecture and interiors |
| `--scribble` | A loose scribble                                       |
| `--pose`     | Body, hand and face pose skeletons                     |
| `--segments` | A segmentation map                                     |

See [preprocessors](../../../docs/tools/preprocessors.md) for which map suits which job.

```bash
motif map room.jpg -o depth.png --dry-run
motif map figure.jpg --pose --dry-run
```

## material

`motif material [image]` - turn a surface photograph into PBR maps: colour, normal, roughness, metalness, height.

Instead: a seamless texture without PBR maps (tile), or depth and normals of a scene (map).

`--extract <region>` extracts a tiling material from the named region instead. Pass `-o` ending in `/` to write `basecolor`, `normal`, `roughness`, `metalness` and `height`.

```bash
motif material linen.jpg -o pbr/ --dry-run
motif material sofa.jpg --extract "the linen upholstery" -o pbr/ --dry-run
```

## tile

`motif tile [prompt] [image]` - make a seamlessly tiling texture.

Instead: PBR maps of a surface (material).

The image is optional: a prompt alone makes a tile. `--upscale` enlarges an existing tile and keeps it seamless.

```bash
motif tile "worn terracotta floor tiles" --dry-run
motif tile tile.png --upscale --dry-run
```

## mesh

`motif mesh [image] [--rig]` - make a textured 3D mesh from one image.

Instead: a flat image of an object (generate), or depth of a scene (map).

| Flag | Does |
| --- | --- |
| (none) | One textured mesh (`.glb`) |
| `--rig` | Rig it with a skeleton for animation. Only one Model rigs, so this picks it at any Tier |
| `--objects <object>` | Reconstruct every instance of one named object |
| `--body` | Reconstruct a human body |

```bash
motif mesh chair.jpg --dry-run
motif mesh character.png --rig --dry-run
```

## try-on

`motif try-on [image] --garment <image>` - dress a person in a garment from another image.

Instead: changing clothes by description (generate with a reference).

```bash
motif try-on person.jpg --garment coat.jpg --dry-run
```

## animate

`motif animate <prompt> [image]` - turn a still image into a short video clip.

Instead: a still image (generate), or variations of one (vary).

| Flag                | Does                         |
| ------------------- | ---------------------------- |
| `--duration <s>`    | Clip length in seconds       |
| `--negative <text>` | What the motion should avoid |

Output is `.mp4`. Video runs through the queue, takes 30 to 120 seconds and costs 5 to 10 times an image, so price it first.

```bash
motif animate "the camera slowly pushes in" still.png --duration 5 --dry-run
motif animate "the camera slowly pushes in" still.png --tier fast --dry-run
```

## Not Tasks

`sheet`, `series`, `studio`, `--history`, `--last` and `--describe` choose no Model.

```bash
motif sheet a.png b.png c.png -o sheet.png --no-open
motif sheet --last 6 --cols 3 --no-open --format json
```

`sheet` lays images out on one captioned PNG, JPEG or WebP, captioned from history (model, look, mood, cost). Series are in [series](series.md).

## Removed commands

These exit `2` with `REMOVED_COMMAND`, and `details.use` names the replacement.

| Removed | Use |
| --- | --- |
| `--rmbg` | `motif cutout` |
| `--up` | `motif upscale` |
| `--vary` | `motif vary` |
| `--video` and `--video-*` | `motif animate` |
| `motif enhance` | `motif upscale` or `motif restore` |
| `motif tool` | the Task verb that does the job |
| `--quality`, `--rendering-speed`, `--thinking` | `--tier`, or `--param` with `-m` for a finer value |
| `--style` and other Model-only flags | `--param key=value` with `-m` |
