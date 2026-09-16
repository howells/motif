# Understanding images

Most of Motif turns a prompt into a picture. This page covers the Tasks that go the other way: you hand them a picture and they hand back facts about it - where a thing is, what a thing is, what the text says.

Two shapes of answer:

- **`motif segment`** returns pixels. Name a thing in words, get its region back as an image file.
- **`motif ask`** returns prose, coordinates or text. Ask a question, get a sentence; ask for a thing, get boxes or points; ask it to read, get a transcription.

Neither generates anything. `ask` writes no file at all.

## segment - find a thing and cut it out

`motif segment` masks a named thing. At the default Tier it runs SAM 3 for $0.005 a call and returns in the normal request window, no queue.

```bash
motif segment "the white ceramic bowl" source-apothecary.jpg -o segment/ --no-open
```

`-o` with a trailing slash writes every file the Model returned, named by output key. SAM 3 returns an image and masks as files and `boxes`, `scores` and metadata as data, so you get `image.jpg` and `masks.png` on disk and the numbers in the JSON.

| Source | `masks.png` |
| --- | --- |
| ![The apothecary source image](examples/source-apothecary.jpg) | ![The bowl isolated on transparency](examples/segment/masks.png) |

Note what `masks.png` actually is: the bowl cut out on transparency, not a black-and-white stencil. SAM 3 applies the mask to the source before returning it. To get the plain mask, override the Model and send its own field: `-m sam3-image --param apply_mask=false`. Look at what you get before wiring it into something that expects a binary mask.

Three more things worth knowing:

- **`--rle` swaps the mask images for run-length encoded JSON.** Same price, no files to download, much smaller if you only need the geometry.
- **`boxes` and `scores` come back alongside.** `--fields boxes,scores` gets you the geometry without the file paths.
- **`--tier quality` runs SAM 3.1** at $0.01. A video source picks a video segmentation Model, which goes through fal's queue. `--auto` segments everything it can find without a prompt, which is a different job - use it when you don't know what you're looking for.

```bash
motif segment "the white ceramic bowl" source-apothecary.jpg --rle --format json --fields boxes,scores
```

## ask - a question about the picture

`motif ask` runs Moondream 3 for questions, captions, detection and points, and a dedicated OCR Model for reading. It writes nothing to disk.

```bash
motif ask "how many bottles are there?" source-apothecary.jpg
motif ask --caption source-interior.jpg
motif ask --detect "amber bottle" source-apothecary.jpg
motif ask --point "vase" source-interior.jpg
motif ask --read source-label.jpg
motif ask --safe source-interior.jpg
```

The positional order changes with the mode, which catches people out. With no mode the first positional is the question and the second the image. The mode flags carry their own subject, so the only positional **is** the image.

Where the answer lands:

| Mode | JSON field | Contents |
| --- | --- | --- |
| (none) | `answer`, `reasoning` | Prose, plus the model's reasoning where it returns any |
| `--caption` | `answer` | A caption |
| `--detect <thing>` | `objects` | Bounding boxes |
| `--point <thing>` | `points` | One coordinate per instance |
| `--read` | the transcription | Text, through fal's queue |
| `--safe` | the verdict | Whether the image is safe for work |

In human format the answer is printed on its own with no spinner furniture around it, so `motif ask "..." photo.jpg` is pipeable as-is.

**Moondream is metered by tokens, so `cost` is always `null`.** Not zero - unknown. It's billed at $0.40 per million input tokens and $3.50 per million output. A single question about one image is a fraction of a cent, but nothing in the response tells you what it was. `--read` is listed at $0.05 an image and `--safe` at $0.001, both metered.

## Segment, then edit

The reason to cut a region out is usually to change only that region. The cut-out from `segment` feeds an edit as a mask.

```bash
motif segment "the white ceramic bowl" source-apothecary.jpg -o segment/ --no-open --format json --fields files
```

That writes `segment/image.jpg` and `segment/masks.png` and costs $0.005. The image layer takes a local mask as bytes:

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

On the CLI, `--mask <path>` on `erase` and `relight` takes a local mask file, and `motif "make the bowl black" -e photo.jpg --mask mask.png` sends one to a generate Model that can take it.

How faithfully a Model honours a mask varies, and so does whether it wants an alpha cut-out or a binary stencil - check the result rather than assuming. If it's ignored, you still have a working fallback: crop to the box `segment` returned, edit the crop, composite it back.

## What this costs

| Step | Command | Price |
| --- | --- | --- |
| Find the region | `segment` | $0.005, $0.01 at `--tier quality` |
| Find it as JSON only | `segment --rle` | $0.005 |
| Ask about it | `ask` | metered, `null` before the call |
| Read its text | `ask --read` | metered, `null` before the call |
| Edit the masked region | `erase --mask`, or generate with `-e` and `--mask` | $0.024 to $0.30 |

Segmentation is close to free next to the edit that follows it. Two or three `segment` calls to get the phrase right cost less than one wasted generation.

---

- [Control maps](preprocessors.md) - depth, pose and edge maps
- [Repair and restore](repair-and-restore.md) - erase, restore, relight
- [Pipelines](pipelines.md) - chaining these together
