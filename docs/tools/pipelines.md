# Pipelines

Chaining Tasks means taking a path out of one command's JSON and putting it into the next. This page is the cookbook: the field names that actually exist, the shell that reads them, and four chains worth copying.

Written for agents. If you're driving Motif by hand, the individual pages ([understanding images](understanding-images.md), [control maps](preprocessors.md), [repair and restore](repair-and-restore.md), [layers, vectors and materials](layers-vectors-materials.md)) are the better read.

## Where the path lives

Two families put the output path in two different places. Get this wrong and `jq` hands you `null` and the chain writes to nowhere.

| Command family | JSON shape | Field mask | jq |
| --- | --- | --- | --- |
| `generate` (and `vary`) | `images: [{ path, size, ... }]` | `--fields images` | `jq -r '.images[0].path'` |
| Every other Task verb | `path` at the top level | `--fields path` | `jq -r .path` |
| Any Task verb with `-o dir/` | `files: [{ path, ... }]` | `--fields files` | `jq -r '.files[].path'` |

Field masks are **top-level only**. `--fields path` on a `generate` returns `{}`, because `generate` has no top-level `path` - it has `images`.

Two more things that catch people out:

- **A dry run emits `output`, not `path`.** `output` is where the file _would_ go; `path` is where it _went_. `--fields path --dry-run` returns `{}` every time.
- **Verbs read the source file, even in a dry run.** You cannot dry-run step two of a chain before step one has actually written its file. Dry-run each step against a file you already have, then run the chain for real.

## House rules for a chained command

```bash
motif <verb> ... --no-open --format json --fields <minimum>
```

- `--no-open` on anything that writes a file. Every verb opens a viewer by default and it will interrupt you.
- `--format json` explicitly. It is the default when piped, but not when a harness gives you a TTY.
- `--fields` down to what you need. Full output carries dimensions, costs, timestamps and prompts.
- `--dry-run` first, always. Read `model`, `cost` and `costBasis` before committing.
- Let Motif choose the Model. Use `--tier` to trade cost for quality, and `-m` only when a step needs a particular Model.

## Chain 1: erase, then reframe

Take an object out of a product shot and recut the result for a vertical placement.

```bash
ERASED=$(motif erase "the small amber bottle" source-apothecary.jpg -o erased.jpg --no-open --format json --fields path | jq -r .path)

motif reframe "$ERASED" --story -o story.png --no-open --format json --fields path
```

$0.024 plus $0.06. `reframe` needs a target ratio (`-a` or a preset such as `--og`, `--square`, `--cover`, `--portrait`, `--landscape`, `--story`, `--wide`); there is no default, because there is no sensible guess at what ratio you meant.

If the object casts a visible shadow, add `--tier quality` to the first step for $0.27 - [the comparison](repair-and-restore.md#the-shadow-is-the-whole-argument) shows why.

## Chain 2: generate, then vectorise

```bash
MARK=$(motif "a minimal letterpress wordmark, SALVAGE & CO, single weight serif, flat black on white" -m recraft --square --no-open --format json --fields images | jq -r '.images[0].path')

motif vectorize "$MARK" -o wordmark.svg --no-open --format json --fields path
```

$0.04 plus $0.04. Recraft is an override here because it draws clean marks for vector work. Note `--fields images` and the array index - `generate` is the one family that nests the path.

To pick from candidates rather than take the first, run the generate step three or four times and vectorise the one you keep. Recraft returns one image a call, so `-n 4` with `-m recraft` fails with `NO_MODEL_AVAILABLE` (`blockedBy: "count"`).

## Chain 3: photo to PBR

Flatten the baked lighting off a surface photograph, then decompose it into material maps.

```bash
FLAT=$(motif relight source-linen.jpg --flat -o flat.png --no-open --format json --fields path | jq -r .path)

motif material "$FLAT" -o pbr/ --no-open --format json --fields files
```

`relight --flat` is $0.035 per megapixel. `material` is metered - $0.01 base plus $0.01/MP per output map - so it reports `cost: null`.

`-o pbr/` writes `basecolor.jpg`, `normal.jpg`, `roughness.jpg`, `metalness.jpg` and `height.jpg`.

**`material` is queued.** It routes through fal's queue rather than the 120-second synchronous path, so budget minutes rather than seconds.

## Chain 4: segment, then erase or relight the region

Find a region by name, then change only that region. `segment` writes a mask; `erase --mask` and `relight --mask` take it.

```bash
MASK=$(motif segment "the white ceramic bowl" source-apothecary.jpg -o segment/ --no-open --format json --fields files | jq -r '.files[] | select(.key == "masks") | .path')

motif erase source-apothecary.jpg --mask "$MASK" --with "a squat green glass jar" -o jar.png --no-open --format json --fields path
```

$0.005 plus $0.04. Two caveats worth checking before you rely on this: the mask comes back as the subject cut out on transparency rather than a binary stencil, and how faithfully a Model honours a mask varies. If it doesn't hold, fall back to cropping to the box `segment` returned, editing the crop, and compositing it back. [Understanding images](understanding-images.md#segment-then-edit) shows the same edit through the SDK.

## Reading a control map into a generation

A control map is a map, not a picture. Motif has no ControlNet Task, so the in-Motif way to use one is as a reference:

```bash
DEPTH=$(motif map source-interior.jpg -o depth.png --no-open --format json --fields path | jq -r .path)

motif "the same room in dark green lime plaster, oak floor, late evening" -e "$DEPTH" --landscape --no-open --format json --fields images
```

That is soft conditioning - the Model treats the map as visual context, not as a hard geometric constraint. For a real constraint, feed the map to a ControlNet pipeline outside Motif. See [control maps](preprocessors.md) for which map suits which job.

## Budgeting a chain before you run it

Price every step first. `--dry-run` needs no key and makes no call.

```bash
motif erase "the small amber bottle" source-apothecary.jpg --dry-run --format json --fields model,cost,costBasis
motif reframe source-apothecary.jpg --story --dry-run --format json --fields model,cost,costBasis
motif material source-linen.jpg --dry-run --format json --fields model,cost,costBasis
# {"model":"patina","cost":null,"costBasis":"unknown"}
```

**`cost: null` does not mean free.** It means the price depends on something the CLI cannot see before the call - output megapixels, seconds of compute, number of maps, number of layers, tokens. An agent that sums `cost ?? 0` across a plan will under-budget, sometimes by a lot: a Topaz restore of a large image is dollars. Per-Model rates are in [the cost reference](../../apps/cli/docs/costs.md).

## Handling the slow ones

Topaz (`restore`, `upscale --tier quality` and its modes), `material`, `layers`, `mesh`, `try-on`, `ask --read`, `segment --auto` and video segmentation all go through fal's queue. They routinely outrun the 120-second synchronous window, so the CLI submits and polls. A Topaz restore in testing took over two minutes.

Nothing is required of the caller - the routing is automatic and the spinner reports queue position - but two things follow:

- **Set your timeout accordingly.** A harness that kills a command at 60 seconds will kill queued runs mid-flight and you'll pay for them anyway.
- **Don't retry a slow queued call.** It's working. Every retry is another billable submission.

## Errors in a chain

Exit codes are semantic, so branch on them rather than parsing stderr:

| Exit | Meaning |
| --- | --- |
| `2` | Bad input or usage, including `NO_MODEL_AVAILABLE` and `REMOVED_COMMAND` |
| `3` | Auth |
| `4` | Not found - including `NO_PREVIOUS` when a verb falls back to a last generation that doesn't exist |
| `5` | Upstream failure, including `TASK_FAILED` |

```bash
if ! OUT=$(motif erase "the bottle" photo.jpg -o erased.jpg --no-open --format json --fields path); then
  case $? in
    2) echo "bad input" ;;
    5) echo "provider failed - retriable" ;;
  esac
fi
```

Every verb that takes an optional trailing image falls back to the last generation when you omit it. In a pipeline, always pass the path explicitly - the last generation is shared state and another process may have moved it.

---

- [Understanding images](understanding-images.md)
- [Control maps](preprocessors.md)
- [Repair and restore](repair-and-restore.md)
- [Layers, vectors and materials](layers-vectors-materials.md)
- [CLI agent guide](../../apps/cli/AGENTS.md)
