# Understanding images

Most of Motif turns a prompt into a picture. This page covers the tools that go the other way: you hand them a picture and they hand back facts about it - where a thing is, what a thing is, what the text says.

Three shapes of answer:

- **`motif segment`** returns pixels. Name a thing in words, get its region back as an image file.
- **`motif ask`** returns prose and coordinates. Ask a question, get a sentence; ask for a thing, get boxes or points.
- **`motif tool run got-ocr`** returns transcribed text.

None of them generate anything. `ask` writes no file at all.

## segment - find a thing and cut it out

`motif segment` runs SAM 3 from a text phrase. It costs $0.005 a call and returns in the normal request window, no queue.

```bash
motif segment "the white ceramic bowl" source-apothecary.jpg -o segment/ --no-open
```

`-o` with a trailing slash writes every output the tool produced, named by its registry output key. SAM 3 declares five - `image`, `masks`, `metadata`, `scores`, `boxes` - so you get `image.jpg` and `masks.png` on disk, and the numeric ones in the JSON.

| Source | `masks.png` |
| --- | --- |
| ![The apothecary source image](examples/source-apothecary.jpg) | ![The bowl isolated on transparency](examples/segment/masks.png) |

Note what `masks.png` actually is: the bowl cut out on transparency, not a black-and-white stencil. That is because `apply_mask` defaults to `true`, so the mask is applied to the source before it comes back. `motif tool run sam3-image ... --no-apply-mask` turns that off. Look at what you get before you wire it into something downstream that expects a binary mask.

Two things worth knowing:

- **`--rle` swaps the mask images for run-length encoded JSON.** Same price, no files to download, much smaller if you only need the geometry. It runs `sam3-image-rle` instead.
- **`boxes` and `scores` come back alongside.** `--fields boxes,scores` gets you the geometry without the file paths.

```bash
motif segment "the white ceramic bowl" source-apothecary.jpg --rle --format json --fields boxes,scores
```

SAM 3.1 (`sam3-1-image`, $0.01) is available through `motif tool run` and adds multi-object tracking. The video variants (`sam3-video`, `sam3-video-rle`, `sam3-1-video`) take a video and go through fal's queue. `sam2-auto` segments everything it can find without a prompt, which is a different job - use it when you don't know what you're looking for.

## ask - a question about the picture

`motif ask` runs Moondream 3. It has four modes and writes nothing to disk.

```bash
motif ask "how many bottles are there?" source-apothecary.jpg
motif ask --caption source-interior.jpg
motif ask --detect "amber bottle" source-apothecary.jpg
motif ask --point "vase" source-interior.jpg
```

The positional order changes with the mode, which catches people out. Default mode reads the first positional as the question and the second as the image. The three flag modes carry their own subject, so the first positional **is** the image. Passing both to `--detect` is an `INVALID_OPTION` error rather than a guess.

Where the answer lands:

| Mode | JSON field | Contents |
| --- | --- | --- |
| default | `answer`, `reasoning` | Prose, plus the model's reasoning where it returns any |
| `--caption` | `answer` | A caption |
| `--detect <thing>` | `objects` | Bounding boxes |
| `--point <thing>` | `points` | One coordinate per instance |

In human format the answer is printed on its own with no spinner furniture around it, so `motif ask "..." photo.jpg` is pipeable as-is.

**Moondream is metered by tokens, so `estimatedCost` is always `null`.** Not zero - unknown. It's billed at $0.40 per million input tokens and $3.50 per million output. A single question about one image is a fraction of a cent, but nothing in the response tells you what it was.

## The rest of the reading tools

| Tool | What you get | Price | Notes |
| --- | --- | --- | --- |
| `got-ocr` | Transcribed text, optionally as formatted multi-page output | metered, listed at $0.05/image | Takes `--inputs` for several images at once. Queued |
| `nsfw` | `has_nsfw_concepts` per image | metered, listed at $0.001/image | Takes `--inputs`. Cheapest thing in the registry |
| `moondream-detect` | Boxes, plus a preview image | metered | Same endpoint `motif ask --detect` uses |
| `moondream-point` | Points, plus a preview image | metered | Same endpoint `motif ask --point` uses |

```bash
motif tool run got-ocr --inputs source-label.jpg --format json
motif tool run nsfw --inputs a.jpg b.jpg c.jpg --format json
```

Both take `input_image_urls` / `image_urls` rather than a single image, which is why they need `--inputs` rather than a bare positional path.

## Segment, then edit

The reason to cut a region out is usually to change only that region. The cut-out from `segment` feeds the SDK's `edit()` as a mask.

```bash
motif segment "the white ceramic bowl" source-apothecary.jpg -o segment/ --no-open --format json --fields files
```

That writes `segment/image.jpg` and `segment/masks.png` and costs $0.005. Then:

```ts
import { readFile } from "node:fs/promises";
import { createMotifImage } from "@howells/motif-sdk/image";

const img = createMotifImage({ defaultProvider: "google" });

const result = await img.edit({
  images: [await readFile("source-apothecary.jpg")],
  mask: await readFile("segment/masks.png"),
  instruction: "make the bowl matte black stoneware",
});

if (result.isOk()) {
  result.value.images[0].uint8Array;
  result.value.cost; // { usd, source }
}
```

`edit()` takes the mask as bytes, a base64 string, a `data:` URL, or a remote URL. When you pass several images the mask applies to `images[0]`.

The CLI has a `--mask <url>` flag on `generate` too, supported by `gpt` and `gpt2` only. It wants a URL: unlike `-e/--edit`, a local path is not uploaded for you. Use the SDK for a mask you just wrote to disk.

How faithfully a provider honours a mask varies, and so does whether it wants an alpha cut-out or a binary stencil - check the result rather than assuming. If the provider ignores it, you still have a working fallback: crop to the box `segment` returned, edit the crop, composite it back.

## What this costs

| Step | Tool | Price |
| --- | --- | --- |
| Find the region | `sam3-image` | $0.005 |
| Find it as JSON only | `sam3-image-rle` | $0.005 |
| Ask about it | `moondream-*` | metered, `null` before the call |
| Read its text | `got-ocr` | metered, `null` before the call |
| Edit the masked region | depends on the model | $0.003 to $0.30 |

Segmentation is close to free next to the edit that follows it. Two or three `segment` calls to get the phrase right cost less than one wasted generation.

---

- [Preprocessors](preprocessors.md) - depth, pose and edge maps
- [Repair and restore](repair-and-restore.md) - erase, fill, restore
- [Pipelines](pipelines.md) - chaining these together
