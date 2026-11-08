import { taskCommand } from "@/lib/site/home/commands";
import type { Chapter, Entry } from "@/lib/site/home/types";

/** The Edit chapter, as the Paper file sets it on the desktop and phone
 * boards. The words follow that file exactly. */

const erase = {
  id: "remove-an-object",
  headline: "Remove an object.",
  body: "Name it, and Motif removes it and fills in the space behind.",
  command: taskCommand("erase", "motif erase"),
  figures: [
    {
      caption: "Before",
      image: {
        alt: "Three amber glass bottles, two tall and one small, beside a white bowl on a pale stone shelf, with sun slanting across a peach wall.",
        height: 781,
        src: "/demo/sources/apothecary.jpg",
        width: 1400,
      },
    },
    {
      caption: "After",
      image: {
        alt: "The same shelf with the small bottle gone: two tall amber bottles and the white bowl, and the stone and shadows filled in where it stood.",
        height: 781,
        src: "/demo/erase/apothecary.jpg",
        width: 1400,
      },
    },
  ],
} as const satisfies Entry;

const cutout = {
  id: "remove-the-background",
  headline: "Remove the background.",
  body: "The subject keeps a clean edge, ready to place on a page or in a new scene.",
  command: taskCommand("cutout", "motif cutout"),
  figures: [
    {
      image: {
        alt: "A speckled cream stoneware vase standing on rumpled linen against a pale wall.",
        height: 1000,
        src: "/demo/vase/vase.jpg",
        width: 1000,
      },
    },
    {
      image: {
        alt: "The same vase cut out on its own, with no background.",
        height: 505,
        src: "/demo/showcase/nobg-trim.png",
        width: 341,
      },
    },
  ],
} as const satisfies Entry;

const reframe = {
  id: "extend-the-frame",
  headline: "Extend the frame.",
  body: "Turn a wide shot into a square or a tall one. Motif paints in what lies past the old edges.",
  command: taskCommand("reframe", "motif reframe"),
  figures: [
    {
      image: {
        alt: "A sunlit room with a wooden bench draped in a cream throw and a branch in a white vase, made square by painting in more wall above and more floorboards below the wide original.",
        height: 1400,
        src: "/demo/expand/interior-square.jpg",
        width: 1400,
      },
    },
  ],
  /** Words set inside the dashed outline that marks the wide original. */
  original: "The original photo",
} as const satisfies Entry & { readonly original: string };

const upscale = {
  id: "upscale",
  headline: "Upscale up to four times.",
  body: "Detail is redrawn at the new size, so the picture stays sharp.",
  command: taskCommand("upscale", "motif upscale"),
  figures: [
    {
      caption: "360 pixels",
      image: {
        alt: "The rim of a ribbed cream ceramic pot at 360 pixels, soft and blocky.",
        height: 636,
        src: "/demo/showcase/up-before.png",
        width: 636,
      },
    },
    {
      caption: "1,440 pixels",
      image: {
        alt: "The same pot at 1,440 pixels, its ribs and rim sharp.",
        height: 636,
        src: "/demo/showcase/up-after.png",
        width: 636,
      },
    },
  ],
} as const satisfies Entry;

const relight = {
  id: "relight",
  headline: "Relight a photo.",
  body: "Say what time of day it should be. Everything in the room stays where it was. You can also soften harsh light.",
  command: taskCommand("relight", "motif relight"),
  figures: [
    {
      image: {
        alt: "A farmhouse kitchen with a pine dresser, a scrubbed table and chairs by a sash window, split down the middle: flat daylight on the left, warm evening light on the right.",
        height: 900,
        src: "/demo/showcase/light-split.jpg",
        width: 1600,
      },
      phone: {
        image: {
          alt: "A farmhouse kitchen with a pine dresser, a scrubbed table and chairs by a sash window, split down the middle: flat daylight on the left, warm evening light on the right.",
          height: 900,
          src: "/demo/showcase/light-split-square.jpg",
          width: 900,
        },
      },
    },
  ],
  /** The two halves of the split picture, left then right. */
  sides: ["Flat daylight", "Evening light"],
} as const satisfies Entry & { readonly sides: readonly [string, string] };

const restyle = {
  id: "match-the-style",
  headline: "Match the style of another picture.",
  body: "Use a drawing, print or photograph as the reference. Your picture is redrawn in that style, with everything kept in place.",
  command: taskCommand("restyle", "motif restyle"),
  figures: [
    {
      image: {
        alt: "The sunlit room with its bench, throw and vase redrawn as a loose ink and watercolour sketch.",
        height: 781,
        src: "/demo/restyle/interior.jpg",
        width: 1400,
      },
    },
    {
      caption: "Your photo",
      image: {
        alt: "A sunlit room with a wooden bench, a cream throw and a branch in a white vase.",
        height: 781,
        src: "/demo/sources/interior.jpg",
        width: 1400,
      },
    },
    {
      caption: "The reference",
      image: {
        alt: "An ink and watercolour drawing of a kitchen with dark green cabinets, pendant lamps and stools.",
        height: 1024,
        src: "/demo/restyle/reference.jpg",
        width: 1024,
      },
    },
  ],
} as const satisfies Entry;

const tryOn = {
  id: "put-on-a-garment",
  headline: "Put a garment on a person.",
  body: "Give it a photo of the garment and a photo of the person. Motif shows them wearing it, folds and fit included.",
  command: taskCommand("try-on", "motif try-on"),
  figures: [
    {
      caption: "Wearing it",
      image: {
        alt: "A woman standing barefoot in a plaster-walled room, wearing a rust cotton work jacket over linen trousers.",
        height: 2048,
        src: "/demo/try-on/dressed.jpg",
        width: 2048,
      },
    },
    {
      caption: "The person",
      image: {
        alt: "The same woman in a white T-shirt and linen trousers.",
        height: 2048,
        src: "/demo/try-on/person.jpg",
        width: 2048,
      },
    },
    {
      caption: "The jacket",
      image: {
        alt: "A rust cotton work jacket laid flat on a cream ground.",
        height: 1000,
        src: "/demo/try-on/garment.jpg",
        width: 1000,
      },
    },
  ],
} as const satisfies Entry;

const restore = {
  id: "repair-a-damaged-photo",
  headline: "Repair a damaged photo.",
  body: "Fixes blur, noise and faded colour without changing what's in the picture.",
  command: taskCommand("restore", "motif restore"),
  figures: [
    {
      image: {
        alt: "A sage glazed jug and a folded linen cloth on a plaster shelf, split down the middle: blurred and faded on the left, sharp and clear on the right.",
        height: 678,
        src: "/demo/showcase/restore-split.jpg",
        width: 1024,
      },
    },
  ],
  /** The two halves of the split picture, left then right. */
  sides: ["Before", "After"],
} as const satisfies Entry & { readonly sides: readonly [string, string] };

export const EDIT = {
  id: "edit",
  title: "Edit",
  intro:
    "Change pictures you already have. Every edit saves a new file and leaves the original as it was.",
  tone: "ground",
  entries: [erase, cutout, reframe, upscale, relight, restyle, tryOn, restore],
} as const satisfies Chapter;
