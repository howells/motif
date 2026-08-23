# Pipelines

Chaining tools means taking a path out of one command's JSON and putting it into the next. This page is the cookbook: the field names that actually exist, the shell that reads them, and four chains worth copying.

Written for agents. If you're driving Motif by hand, the individual pages ([understanding images](understanding-images.md), [preprocessors](preprocessors.md), [repair and restore](repair-and-restore.md), [layers, vectors and materials](layers-vectors-materials.md)) are the better read.

## Where the path lives

The three command families put the output path in three different places. Get this wrong and `jq` hands you `null` and the chain writes to nowhere.

| Command family | JSON shape | Field mask | jq |
| --- | --- | --- | --- |
| `generate` (and `vary`) | `images: [{ path, size, ... }]` | `--fields images` | `jq -r '.images[0].path'` |
| The seven verbs | `path` at the top level | `--fields path` | `jq -r .path` |
| `motif tool run` | `saved: { path, size }` | `--fields saved` | `jq -r '.saved.path'` |
| `motif tool run -o dir/` | `files: [{ path, ... }]` | `--fields files` | `jq -r '.files[].path'` |

Field masks are **top-level only**. `--fields path` on a `generate` returns `{}`, because `generate` has no top-level `path` - it has `images`.

Two more things that catch people out:

- **A dry run emits `output`, not `path`.** `output` is where the file *would* go; `path` is where it *went*. `--fields path --dry-run` returns `{}` every time.
- **Verbs validate the source file exists, even in a dry run.** You cannot dry-run step two of a chain before step one has actually written its file. Dry-run each step against a file you already have, then run the chain for real.

## House rules for a chained command

```bash
motif <thing> --no-open --format json --fields <minimum>
```

- `--no-open` on anything that writes a file. The verbs and `generate` open a viewer by default and it will interrupt you. (`motif tool run` has no such flag and never opens one.)
- `--format json` explicitly. It is the default when piped, but not when a harness gives you a TTY.
- `--fields` down to what you need. Full output carries dimensions, costs, timestamps and prompts.
- `--dry-run` first, always. Read `estimatedCost` **and** `queued` before committing.

## Chain 1: erase, then reframe

Take an object out of a product shot and recut the result for a vertical placement.

```bash
ERASED=$(motif erase "the small amber bottle" source-apothecary.jpg \
  -o erased.jpg --no-open --format json --fields path | jq -r .path)

motif reframe --story "$ERASED" -o story.png --no-open --format json --fields path
```

$0.024 plus $0.06. `reframe` needs exactly one of `--og --square --cover --portrait --landscape --story --wide`; there is no default, because there is no sensible guess at what ratio you meant.

If the object casts a visible shadow, swap the first step for `finegrain-eraser` at $0.27 - [the comparison](repair-and-restore.md#the-shadow-is-the-whole-argument) shows why.

## Chain 2: generate, then vectorise

```bash
MARK=$(motif "a minimal letterpress wordmark, SALVAGE & CO, single weight serif, flat black on white" \
  -m recraft --square --no-open --format json --fields images | jq -r '.images[0].path')

motif vectorize "$MARK" -o wordmark.svg --no-open --format json --fields path
```

$0.04 plus $0.04. Note `--fields images` and the array index - `generate` is the one family that nests the path.

To pick from candidates rather than take the first, generate several and vectorise one:

```bash
motif "..." -m recraft --square -n 4 --no-open --format json --fields images | jq -r '.images[].path'
```

`-o` on `vectorize` must name a `.svg` or end in a slash, or the command refuses.

## Chain 3: photo to tileable PBR

Flatten the baked lighting off a surface photograph, then decompose it into material maps.

```bash
FLAT=$(motif tool run remove-lighting source-linen.jpg \
  -o flat.png --format json --fields saved | jq -r '.saved.path')

motif tool run patina "$FLAT" -o pbr/ --format json --fields files
```

`remove-lighting` is $0.035 per megapixel. `patina` is metered - $0.01 base plus $0.01/MP per output map - so both report `estimatedCost: null`.

`-o pbr/` writes `basecolor.jpg`, `normal.jpg`, `roughness.jpg`, `metalness.jpg` and `height.jpg`, named from the registry's declared order for `patina`'s `images` array. Ask for a subset and the names follow the request:

```bash
motif tool run patina "$FLAT" --json '{"maps":["basecolor","roughness"]}' -o pbr/ --format json --fields files
```

**`patina` is queued.** It routes through fal's queue rather than the 120-second synchronous path, so budget minutes rather than seconds.

## Chain 4: segment, then edit the region

Find a region by name, then change only that region. The edit half runs in the SDK, because the CLI's `--mask` flag wants a URL and won't upload a file you just wrote.

```bash
motif segment "the white ceramic bowl" source-apothecary.jpg \
  -o segment/ --no-open --format json --fields files
```

$0.005, synchronous. That writes `segment/image.jpg` and `segment/masks.png`.

```ts
import { readFile } from "node:fs/promises";
import { createMotifImage } from "@howells/motif-sdk/image";

const img = createMotifImage({ defaultProvider: "google" });

const result = await img.edit({
  images: [await readFile("source-apothecary.jpg")],
  mask: await readFile("segment/masks.png"),
  instruction: "make the bowl matte black stoneware",
});
```

`edit()` returns a `Result`, so branch on `result.isOk()` rather than catching. Per-call cost is on `result.value.cost`.

Two caveats worth checking before you rely on this: `masks.png` is the subject cut out on transparency rather than a binary stencil (because `apply_mask` defaults to true), and how faithfully a provider honours a mask varies. If it doesn't hold, fall back to cropping to the box `segment` returned, editing the crop, and compositing it back.

## Reading a control map into a generation

Preprocessors produce a map, not a picture. Motif has no ControlNet endpoint, so the in-Motif way to use one is as a reference image:

```bash
DEPTH=$(motif tool run depth-anything source-interior.jpg \
  -o depth.png --format json --fields saved | jq -r '.saved.path')

motif "the same room in dark green lime plaster, oak floor, late evening" \
  -m banana --edit "$DEPTH" --landscape --no-open --format json --fields images
```

That is soft conditioning - the model treats the map as visual context, not as a hard geometric constraint. For a real constraint, feed the map to a ControlNet pipeline outside Motif. See [preprocessors](preprocessors.md) for which map suits which job.

## Budgeting a chain before you run it

Price every step first. `--dry-run` is free and makes no fal call.

```bash
motif erase "the small amber bottle" source-apothecary.jpg --dry-run --format json --fields estimatedCost
motif reframe --story source-apothecary.jpg --dry-run --format json --fields estimatedCost
```

For registry tools, read `estimatedCost`, `estimatedCostPerMegapixel` / `estimatedCostPerSecond`, `pricing` and `queued` together:

```bash
motif tool run patina source-linen.jpg --dry-run --format json --fields estimatedCost,pricing,queued
# {"estimatedCost":null,"pricing":"$0.01 base plus $0.01/megapixel per output map, ...","queued":true}
```

**`estimatedCost: null` does not mean free.** It means the price depends on something the CLI cannot see before the call - output megapixels, seconds of compute, number of maps, number of layers, tokens. The `pricing` string carries the real formula. An agent that sums `estimatedCost ?? 0` across a plan will under-budget, sometimes by a lot: a Topaz restore of a large image is dollars, and it reports `null`.

## Handling the slow ones

29 of the 71 registry entries are marked `queued`. They routinely outrun fal's 120-second synchronous window, so the CLI submits them to the queue and polls. A Topaz restore in testing took over two minutes.

Nothing is required of the caller - the routing is automatic and the spinner reports queue position - but two things follow:

- **Set your timeout accordingly.** A harness that kills a command at 60 seconds will kill queued tools mid-flight and you'll pay for the run anyway.
- **Don't retry a slow queued call.** It's working. Every retry is another billable submission.

Check before you run:

```bash
motif tool run <id> <image> --dry-run --format json --fields queued
```

Every Topaz endpoint, both Patina tools, all three layerize tools, `got-ocr`, `sam2-auto` and the video segmentation tools are queued. `motif tool describe <id> --format json` tells you for any single tool.

## Errors in a chain

Exit codes are semantic, so branch on them rather than parsing stderr:

| Exit | Meaning |
| --- | --- |
| `2` | Bad input or usage |
| `3` | Auth |
| `4` | Not found - including `NO_PREVIOUS` when a verb falls back to a last generation that doesn't exist |
| `5` | Upstream fal failure |

```bash
if ! OUT=$(motif erase "the bottle" photo.jpg -o erased.jpg --no-open --format json --fields path); then
  case $? in
    2) echo "bad input" ;;
    5) echo "fal failed - retriable" ;;
  esac
fi
```

Every verb that takes an optional trailing image falls back to the last generation when you omit it. In a pipeline, always pass the path explicitly - the last generation is shared state and another process may have moved it.

---

- [Understanding images](understanding-images.md)
- [Preprocessors](preprocessors.md)
- [Repair and restore](repair-and-restore.md)
- [Layers, vectors and materials](layers-vectors-materials.md)
- [CLI agent guide](../../apps/cli/AGENTS.md)
