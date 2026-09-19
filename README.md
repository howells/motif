<p align="center">
  <img src="https://raw.githubusercontent.com/howells/motif/main/logo.png" width="128" alt="Motif">
</p>
<h1 align="center">Motif</h1>

<p align="center">
  Images and video through <a href="https://fal.ai">fal.ai</a>, by task<br>
  <code>npm install -g @howells/motif-cli</code> · <code>npm install @howells/motif-sdk</code>
</p>

Motif is a CLI and a Node SDK for image work on fal.ai. You say what you want done (erase this, upscale that, relight it) and Motif chooses the Model that does it best at the Tier you ask for. Every call can be priced with a dry run before it spends anything.

## Quick start

```bash
npm install -g @howells/motif-cli
export FAL_KEY="your-fal-key"

motif "a ceramic desk lamp on an oak desk" --dry-run    # choose the Model and price it
motif "a ceramic desk lamp on an oak desk"              # make it
motif erase "the cable" lamp.png                         # take something out
motif upscale lamp-erase.png --scale 2                   # make it larger
```

Run `motif` with no arguments for help, and `motif <verb> --help` for one Task.

## What do you want to do?

| Task | Command | Instead, when |
| --- | --- | --- |
| Make an image from a prompt, or change one passed with -e | `motif "prompt"` | Variations of an image you already have (vary), or a consistent set of images (series run). |
| Variations of an image | `motif vary [image]` | A specific change to an image described in words (generate with a reference), or a set of different scenes in one style (series run). |
| Remove something and fill the gap | `motif erase "what" [image]` | The whole background (cutout), or extending the canvas (reframe). |
| Remove the background | `motif cutout [image-or-video]` | Cutting one named thing out of a scene, such as the chair in a room (segment), or taking an object out and filling the gap (erase). |
| Extend to a new aspect ratio | `motif reframe [image] --og` | A new image at a given ratio (generate with a ratio). |
| Make it larger | `motif upscale [image-or-video]` | Fixing noise, softness or colour without changing the size (restore). |
| Fix noise, blur, damage or colour | `motif restore [image]` | Making an image larger (upscale). |
| Relight a photo | `motif relight [image] "light"` | Regenerating the scene in a new light (generate with a mood). |
| Redraw in a reference's style | `motif restyle [image] --like <image>` | A house style kept across images (generate with a look). |
| Mask or cut out a named thing | `motif segment "what" [image-or-video]` | The background behind the subject (cutout), or boxes without masks (ask detect). |
| Caption, count, find or ask | `motif ask "question" [image]` | Pixel masks of a named thing (segment). |
| Split into transparent layers | `motif layers [image]` | Masking one named thing (segment), or removing the background (cutout). |
| Trace to a clean SVG | `motif vectorize [image]` | Drawing a new image from a prompt (generate). |
| Depth, edge, normal or pose map | `motif map [image]` | Masks of a named thing (segment), or PBR material maps (material). |
| PBR maps from a surface photo | `motif material [image]` | A seamless texture without PBR maps (tile), or depth and normals of a scene (map). |
| A seamlessly tiling texture | `motif tile "prompt" [image]` | PBR maps of a surface (material). |
| A textured 3D mesh | `motif mesh [image] [--rig]` | A flat image of an object (generate), or depth of a scene (map). |
| Dress a person in a garment | `motif try-on [image] --garment <image>` | Changing clothes by description (generate with a reference). |
| Turn an image into a video | `motif animate "prompt" [image]` | A still image (generate), or variations of one (vary). |
| A captioned contact sheet | `motif sheet <images...>` | Making the images (generate or series run), or combining images into one new picture (generate with several -e). |
| A consistent set from a theme | `motif series run "theme"` | One image (generate), several takes of the same prompt (generate with -n), or variations of an image (vary). |
| A reusable style and references | `motif series <subcommand>` | A one-off themed set (series run creates or reuses a series for you), or a house register for one image (generate with --look). |
| The interactive terminal Studio | `motif studio` | Agents and scripts, which call the commands directly with --format json. |

Each Task's modes, flags and examples are in [apps/cli/docs/verbs.md](apps/cli/docs/verbs.md). `motif --describe tasks --format json` maps task words ("inpaint", "rmbg", "depth") to the verb.

The trailing image is optional and falls back to your last generation.

## Tiers

Every Task ranks the Models that can do it. `--tier fast|balanced|quality` moves Motif along that ranking, trading cost and speed for quality; `balanced` is the default.

```bash
motif "a green kitchen" --tier fast --dry-run
motif erase "the parked car" street.jpg --tier quality --dry-run   # also removes the car's shadow
```

Motif never reads the prompt to choose, so the same command picks the same Model. A request that needs something (a mask, transparency, several references, a video) rules out the Models that can't do it.

## Overriding the Model

Let Motif choose unless you have a reason not to. To run a specific Model, name it with `-m`. Options only that Model understands go through `--param key=value`, which needs `-m`.

```bash
motif "a jazz night poster" -m ideogram --param style=DESIGN --dry-run
motif "a ceramic vase in window light" -m flare --param quality=xhigh --dry-run
```

The generate default is `banana` (Nano Banana Pro). Override Models by Tier are listed in [generate and vary](apps/cli/docs/generate.md#override-models) and priced in the [cost reference](apps/cli/docs/costs.md). JSON output always records the Model that ran, as `model`, with `chosenBy` saying why.

## Looks and moods

Creative direction adds house sentences to your prompt. A **look** sets the kind of image and brings its own Model and aspect ratio; a **mood** sets the light.

| Look | What it's for |
| --- | --- |
| `editorial` | Quiet, materially rich editorial photography |
| `still-life` | Objects and products on a plaster ground |
| `interior` | Bright, collected rooms that feel lived in |
| `architectural` | Buildings and their settings from outside |
| `portrait` | Natural, unposed documentary portraits |
| `object` | One object in one colour on a clean ground |
| `surface` | Flat, edge-to-edge surface photographs for textures and swatches |
| `abstract` | Painted abstraction edge to edge, for wall art and backgrounds |
| `illustration` | Line and gouache illustration of any subject (experimental) |

| Mood       | Light                                  |
| ---------- | -------------------------------------- |
| `window`   | Soft, even daylight from a window      |
| `dawn`     | Cool, clear early morning light        |
| `raking`   | Low side light that brings out texture |
| `overcast` | Soft grey light on a rainy afternoon   |
| `lamplit`  | Warm evening lamps, candles and a fire |
| `nocturne` | Night, one warm low light, deep shadow |

```bash
motif "a green kitchen" --look interior --mood overcast --dry-run
motif relight kitchen.jpg --mood dawn --dry-run
```

These reflect one studio's taste: quiet, material, shot on film, generous with space. A look's Model wins over the Tier. `object`, `surface`, `abstract` and `illustration` carry their own light and refuse a mood. No look renders lettering; for type in the picture, override the Model with `-m ideogram4`. `relight --mood` applies a mood to an existing photo.

## Series

A Series keeps a style prompt, tagged reference images, a pinned look and mood, and its own history, so later images match.

```bash
motif series run "brutalist architecture" --count 6 --dry-run
motif series create "Luna Book Covers" --from cover-style.png --style "moody watercolour fantasy cover"
motif series ref-add luna-book-covers character.png --tag character
motif series gen luna-book-covers "Luna entering the old forest" --refs character --dry-run
```

More in [apps/cli/docs/series.md](apps/cli/docs/series.md).

## Studio

`motif studio` opens an interactive terminal app to browse, generate and review images. Agents and scripts should call the commands directly.

## Scripts and agents

When stdout isn't a terminal, Motif writes JSON. Useful flags everywhere: `--dry-run`, `--format json|ndjson|human`, `--fields`, `--no-open`.

```bash
motif "a logo mark" --no-open --fields images,cost
motif segment "the bowl" shelf.jpg -o segment/ --no-open --fields files
motif --history --limit 20 --fields model,cost
motif --describe erase --format json
echo '{"prompt":"a cat","tier":"fast"}' | motif --dry-run
```

`generate` and `vary` put paths in `images[].path`; every other verb puts the primary file at `path` and every file at `files`. A `cost` of `null` means the price depends on what the call returns (tokens, megapixels, seconds). It is not free. Exit codes are semantic: `2` bad input, `3` auth, `4` not found, `5` provider failure. See [output](apps/cli/docs/output.md) and [errors](apps/cli/docs/errors.md).

Guides with worked examples: [understanding images](docs/tools/understanding-images.md), [control maps](docs/tools/preprocessors.md), [repair and restore](docs/tools/repair-and-restore.md), [layers, vectors and materials](docs/tools/layers-vectors-materials.md), [pipelines](docs/tools/pipelines.md).

## SDK

```bash
npm install @howells/motif-sdk
```

`createMotif()` returns a client with one function per Task. Each resolves the Model the same way the CLI does and returns a `Result` (from `neverthrow`) rather than throwing.

```ts
import { createMotif } from "@howells/motif-sdk";

const motif = createMotif(); // reads FAL_KEY

// Resolve the Model, build the request and price it. No key, no network.
const plan = motif.plan(
  "erase",
  {
    image: "https://example.com/street.jpg",
    prompt: "the parked car",
    tier: "quality",
  },
  { dryRun: true }
);
if (plan.isOk()) console.log(plan.value.model, plan.value.cost);

// Run it.
const result = await motif.erase({
  image: "https://example.com/street.jpg",
  prompt: "the parked car",
});
if (result.isOk())
  console.log(
    result.value.files[0]?.url,
    result.value.model,
    result.value.cost
  );
```

`motif.run(task, input)` does the same by Task id. Input takes `image` or `video` as an https or data URL, plus `prompt`, `mask`, `references`, `aspect`, `count`, `seed`, `transparent`, `look`, `mood`, `tier`, `model`, `mode` and `params`. `motif.upload(bytes, contentType)` puts a local file on fal storage and returns its URL.

`TASKS` holds each Task's summary, modes and ranked Models; `resolveTask` is the pure function that chooses one. `createMotif({ pins: { generate: "gpt2" } })` pins a Model per Task. The provider-agnostic image layer (`@howells/motif-sdk/image`) is documented in the [SDK README](packages/motif-sdk/README.md).

## Configuration

Motif reads `~/.motif/config.json`, then `.motifrc` in the project. `FAL_KEY` in the environment wins over a saved `apiKey`.

```json
{
  "apiKey": "your-fal-key",
  "defaultAspect": "1:1",
  "defaultResolution": "2K",
  "openAfterGenerate": true,
  "tasks": {
    "generate": { "model": "flux2-pro" },
    "upscale": { "model": "topaz-precision" }
  }
}
```

`tasks.<task>.model` pins a Model for one Task, so a ranking change in a new release doesn't change its results. A config written before Tasks is migrated when read: `defaultModel` becomes `tasks.generate.model`, `upscaler` becomes `tasks.upscale.model` and `backgroundRemover` becomes `tasks.cutout.model` (unless they held the old shipped defaults).

`--transparent` at the quality Tier runs through OpenAI and needs `OPENAI_API_KEY`. History is kept in `~/.motif/history.json` (the last 100 generations). See [security notes](docs/security.md).

## Development

```bash
git clone https://github.com/howells/motif.git
cd motif
pnpm install
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

## License

MIT
