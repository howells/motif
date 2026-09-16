# Control maps

`motif map` turns a photograph into a control map: a depth map, a pose skeleton, an edge drawing. None of these is a finished image. Each is the input to a _conditioned_ generation - the thing you hand a model when you want the new image to keep the old one's geometry.

The question this page answers is which map to ask for. They are not interchangeable, and picking the wrong family is why conditioned output comes back looking approximately right and structurally wrong.

## Where the map goes afterwards

Motif has no ControlNet generation Task. The control map is a file; you consume it in one of two places:

- **As a reference to generate.** `motif "..." -e depth.png` passes it as visual context. Loose, no hard geometric constraint, but it needs nothing outside Motif.
- **As the control input to a ControlNet pipeline.** ComfyUI, diffusers, or a fal ControlNet endpoint called directly. This is where the map does what it was designed to do - the generation is constrained to the geometry, not merely nudged by it.

The maps below are the standard ControlNet types, so a depth map drops straight into a depth ControlNet, a pose skeleton into an OpenPose one, and so on.

## Depth - keep the layout, change everything else

Depth is the map to reach for when the composition is right and the surfaces are wrong: same room, different materials; same product on the shelf, different finish. It's what `motif map` makes with no mode flag.

```bash
motif map source-interior.jpg -o out-depth.jpg --no-open
```

| Source | Depth map |
| --- | --- |
| ![An interior with a bench, linen and a plaster wall](examples/source-interior.jpg) | ![The same interior as a greyscale depth map](examples/out-depth.jpg) |

Near is light, far is dark. The bench, the folds of the linen and the vase survive; the colour, the light and the wood grain do not. That is the point - what the depth ControlNet reproduces is exactly what is left in this image.

The depth options differ in what the greys mean:

| Command | Model | Reach for it when |
| --- | --- | --- |
| `motif map` | Depth Anything v2 | The default. Robust across scene types |
| `motif map --tier quality` | Marigold | Diffusion-based, slower and often cleaner on hard edges |
| `motif map --tier fast` | MiDaS | Quick and rough |
| `motif map --metric` | ZoeDepth | You need _metric_ depth - greys that correspond to real distance, not just relative order |
| `motif map --normals` | MiDaS preprocessor | You want a surface normal map. `-o dir/` also keeps the depth map it returns |

All of these are metered: `cost` comes back `null`, and fal lists them at $0/compute-second.

## Pose - keep the figure, change the scene

`motif map --pose` extracts body, hand and face skeletons. It is the map for character consistency: same stance, same gesture, new setting or new style.

```bash
motif map figure.jpg --pose -o pose.png --no-open
```

It is the one map with a real per-unit rate - $0.0006 per compute second - but the seconds aren't known before the call, so `cost` is still `null`. Cheap, but not free like the metered ones.

Pose is the wrong map for objects. A skeleton of a chair is nothing; use depth or edges.

## Edges - keep the drawing, change the rendering

Five edge-style modes, and the difference between them is how hard the line is. This is the family for style transfer: hold the structure, replace everything about how it looks.

```bash
motif map source-vessel.jpg --lineart -o out-lineart.jpg --no-open
```

| Source | Line art |
| --- | --- |
| ![A ribbed stoneware vessel on a stone plinth](examples/source-vessel.jpg) | ![The same vessel as white line art on black](examples/out-lineart.jpg) |

Every rib on the vessel and every fracture in the plinth is there. The light, which is most of what makes the photograph, is gone.

| Command | Line character | Reach for it when |
| --- | --- | --- |
| `--lineart` | Clean, drawn, high detail | Style transfer where the subject reads as illustrated |
| `--edges` | Soft, painterly, follows tone (HED) | You want the edges to carry some shading, not just outline |
| `--edges --tier fast` | Soft, lighter (PiDiNet) | HED is picking up too much texture |
| `--edges --tier quality` | Thin and even (TEED) | You want consistent line weight across the frame |
| `--scribble` | Loose and sparse | You want the model to invent most of it and only honour the gesture |
| `--lines` | Straight line segments only (M-LSD) | Architecture and interiors. It finds walls, frames and floorboards and discards everything organic |

`--lines` is the specialist worth remembering. On an interior it returns the room's geometry and nothing else, which is exactly right for architectural work and useless on a portrait.

## Segmentation map

`motif map --segments` produces a segmentation map - flat regions rather than lines or greys - for segmentation-conditioned ControlNets. It is a control map, not a mask: if you want a named object cut out, use `motif segment`, covered in [Understanding images](understanding-images.md).

## Picking one

- Layout must survive, surfaces must change → `motif map`
- Real-world distances matter → `motif map --metric`
- A person's stance must survive → `motif map --pose`
- A drawing must survive, rendering must change → `motif map --lineart`
- The building must survive → `motif map --lines`
- You want the gesture only → `motif map --scribble`
- You need normals → `motif map --normals`

## Costs and timing

Every map runs synchronously - none goes through the queue. Every one reports `cost: null`, which is not zero. Read [the CLI cost reference](../../apps/cli/docs/costs.md#map) before you assume a null is free.

```bash
motif map source-interior.jpg --dry-run --format json --fields model,cost,costBasis
# {"model":"depth-anything","cost":null,"costBasis":"unknown"}
```

---

- [Understanding images](understanding-images.md) - segment, ask, read
- [Layers, vectors and materials](layers-vectors-materials.md) - PBR maps from a photograph
- [Pipelines](pipelines.md) - chaining these together
