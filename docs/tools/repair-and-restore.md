# Repair and restore

Something in the frame is wrong and you want it gone, or something about the whole frame is degraded and you want it back. Those are different Tasks, and each ranks several Models because the cheap one and the expensive one fail in different places.

Start here:

| The problem | Command | Price |
| --- | --- | --- |
| An object is in the shot | `motif erase "<the thing>"` | $0.024 |
| An object is in the shot **and casts a shadow** | `motif erase "<the thing>" --tier quality` | $0.27 |
| You have a mask, not a phrase | `motif erase --mask mask.png` | $0.024, $0.04 at `--tier quality` |
| You want something _else_ in that region | `motif erase --mask mask.png --with "<the new thing>"` | $0.04 |
| Rendered text needs to come off | `motif erase --text` | $0.04 |
| The photograph is damaged, noisy or soft | `motif restore` and its modes | $0.08 to $0.48 per 24 output megapixels |
| It needs to be bigger | `motif upscale` | $0.02 to $0.96 |
| The lighting is wrong | `motif relight` | $0.035/MP to $0.10/MP |
| It's black and white | `motif restore --colour` | $0.001/MP |

## The shadow is the whole argument

`motif erase` at the default Tier runs Object Removal at $0.024. It removes the object. It does not remove what the object was doing to the light.

Here is the same source at both Tiers, asked to remove the small amber bottle:

```bash
motif erase "the small amber bottle on the right of the group" source-apothecary.jpg -o out-erased.jpg --no-open
motif erase "the small amber bottle on the right of the group" source-apothecary.jpg --tier quality -o out-erased-finegrain.jpg --no-open
```

**Source**

![Three amber bottles and a white bowl on a travertine shelf, raking sunlight](examples/source-apothecary.jpg)

**Default Tier, $0.024**

![The same shelf with the small bottle gone but its shadow still on the wall](examples/out-erased.jpg)

**`--tier quality`, $0.27**

![The same shelf with the small bottle and its shadow both gone](examples/out-erased-finegrain.jpg)

Look at the wall to the right of the two remaining bottles. In the $0.024 version the bottle's cast shadow is still there, along with the amber caustic it threw onto the shelf - a shadow with nothing making it. In the $0.27 version the wall is clean and the light falls the way it would have if the bottle had never been on the shelf.

That is the difference the eleven-fold price buys. Neither result is sloppy. One of them is physically coherent.

### When $0.024 is the right answer

- **Flat, even light.** No raking sun, no hard cast shadow, no contact shadow worth the name.
- **The object is matte and not reflective.** Nothing else in the frame is carrying its reflection.
- **You're still finding the phrase.** Getting the prompt to select the right object takes two or three goes. Do that at the default Tier and switch to `--tier quality` for the final pass - $0.072 of iteration plus one $0.27 run beats three $0.27 runs.
- **Volume.** Fifty product shots at $0.024 is $1.20. At $0.27 it's $13.50.

### When it isn't

- Directional light and a visible cast shadow, as above.
- Glossy floors, glass, polished surfaces - anything holding a reflection of the thing you're removing.
- The object sits _on_ something, so it has a contact shadow. Those read as strongly as cast shadows.

Object Removal also has cheaper quality settings below its default: $0.006, $0.012 and $0.018. Reach them with `-m object-removal` and its own quality field through `--param`.

## Choosing how to say which region

| Command | You supply | Price |
| --- | --- | --- |
| `motif erase "<phrase>"` | A text phrase | $0.024, $0.27 at `--tier quality` |
| `motif erase --boxes <x,y,w,h>` | Bounding boxes in pixels | $0.024 |
| `motif erase --mask mask.png` | A mask image | $0.024, $0.04 at `--tier quality` (Bria) |

The box and mask forms pair with [`motif segment`](understanding-images.md): segment to find the region, then hand the box or mask to erase. That is more reliable than a phrase when the object is one of several similar things in the frame.

## Erase versus fill

They sound alike and they are not.

- **Erase** removes a region and reconstructs what was plausibly behind it. You get the wall, the floor, the shelf.
- **`--with`** removes a masked region and puts something _new_ there, from a description. You get whatever you asked for.

```bash
motif erase source-apothecary.jpg --mask bowl-mask.png --with "a squat green glass jar" --dry-run --format json
```

If you find yourself erasing and then editing the hole, you wanted `--with`.

`--text` is the specialist: it takes all rendered text off an image and rebuilds what sat behind it, $0.04, no prompt needed. For lifting type off while _keeping_ it as editable data, see [`layers --text`](layers-vectors-materials.md).

## Restoring the whole frame

`motif restore` fixes a degraded image at its own size. Each mode names what's wrong; one mode per call.

```bash
motif restore source-vessel.jpg --no-open
```

| Command | Per 24 output MP | What it does |
| --- | --- | --- |
| `motif restore` | $0.48 | General repair of damage and degradation |
| `motif restore --scratches` | $0.48 | Scratches, tears and damage |
| `motif restore --noise` | $0.08 | Noise reduction |
| `motif restore --softness` | $0.08 | Deblur and sharpen |
| `motif restore --tone` | $0.08 | Exposure, white balance, colour |
| `motif restore --dark` | $0.03/MP | Brighten a dark or underexposed photo |
| `motif restore --colour` | $0.001/MP | Colourise a black-and-white photograph |

`motif restore` on the stoneware vessel:

| Source | `motif restore` |
| --- | --- |
| ![A ribbed stoneware vessel on a stone plinth](examples/source-vessel.jpg) | ![The same vessel, ribs and marble veining more defined](examples/verb-enhanced.jpg) |

The ribs on the vessel and the veining in the plinth are the places to look. Both are more defined; nothing has been invented.

## Making it bigger

`motif upscale` is a separate Task, because making an image larger and fixing it are different jobs.

| Command | Price | What it does |
| --- | --- | --- |
| `motif upscale --tier fast` | $0.02 | Crystal, a quick enlargement |
| `motif upscale` | $0.03/MP | Clarity, the balanced default |
| `motif upscale --tier quality` | $0.08 per 24 output MP | Topaz Precision, preserving existing detail |
| `motif upscale --transparent` | $0.08 per 24 output MP | Keeps the alpha channel intact |
| `motif upscale --generative` | $0.24 per 24 output MP | Synthesises plausible new detail |
| `motif upscale --creative` | $0.96 per 24 output MP | Reimagines detail |

`--generative` and `--creative` invent detail, which is the right call for a heavily degraded source and the wrong one for anything that has to stay faithful to a real object.

## Topaz bills on the size of the output

The Topaz Models behind `restore` and `upscale --tier quality` price per 24 output megapixels. A 4x upscale of a 2MP source is 32MP of output, so it costs more than the headline figure. The dry run prices what it can from the source size; check `cost` and `costBasis` rather than assuming.

Several Topaz Models have variants behind their own model field, priced differently - Denoise Max and Super Focus cost double, Dust-Scratch V2 costs a sixth of Recover 3. Reach them with `-m` and `--param`; the [cost reference](../../apps/cli/docs/costs.md#restore) lists them.

**Every Topaz Model runs through fal's queue.** They outrun the 120-second synchronous window - the restore above took over two minutes. The CLI handles the queueing and reports position on the spinner, so there is nothing to do about it except not assume a two-minute wait means it hung.

## Lighting

Three jobs, one Task:

| Command | Price | What it does |
| --- | --- | --- |
| `motif relight "<light>"` or `--mood <id>` | $0.10/MP | Relights to a described light or a house mood, optionally inside `--mask` |
| `motif relight --even` | $0.035/MP | Evens out uneven or blown lighting across the frame |
| `motif relight --flat` | $0.035/MP | Strips baked-in lighting and shadows, leaving a flat neutral surface |

`--flat` is the one that pairs with material work: flatten the lighting off a surface photograph before extracting PBR maps from it, so the baked highlights don't end up in the basecolor. See [Layers, vectors and materials](layers-vectors-materials.md).

## Costs you cannot know in advance

Anything metered, or priced by a size the call decides, reports:

```json
{ "cost": null, "costBasis": "unknown" }
```

`null` is not free. It means the bill depends on something nobody knows before the call. [The cost reference](../../apps/cli/docs/costs.md) carries each Model's rate.

---

- [Understanding images](understanding-images.md) - find the region first
- [Layers, vectors and materials](layers-vectors-materials.md) - what `layers --text` is actually for
- [Pipelines](pipelines.md) - erase then reframe, and other chains
