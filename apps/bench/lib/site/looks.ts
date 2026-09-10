/**
 * Proof images for every look and every mood, each a real Motif output
 * web-sized into `public/demo/`. Widths and heights are read from the files,
 * so the frames match what the models returned. Import from
 * `@/lib/site/content`.
 */

import type { Asset } from "@/lib/site/types";

/** One image per look, made with the look's own model and defaults. */
export const LOOK_PROOFS = new Map<string, { image: Asset; prompt: string }>([
  [
    "editorial",
    {
      image: {
        alt: "A worn wooden table laid with paint tins, jars and tied swatches in bottle green and oxblood",
        height: 1800,
        src: "/demo/looks/editorial.jpg",
        width: 1800,
      },
      prompt:
        "A materials library table with paint tins and swatch chains in bottle green and oxblood",
    },
  ],
  [
    "still-life",
    {
      image: {
        alt: "Three stoneware vessels, one glazed sage green and two pale stone, on a plaster ground",
        height: 1024,
        src: "/demo/looks/still-life.jpg",
        width: 1024,
      },
      prompt: "Three stoneware vessels, one glazed sage green, two pale stone",
    },
  ],
  [
    "lived-in",
    {
      image: {
        alt: "A sitting room with deep green painted bookshelves and an oatmeal linen sofa",
        height: 768,
        src: "/demo/looks/lived-in.jpg",
        width: 1024,
      },
      prompt:
        "A calm English sitting room with deep green painted bookshelves and an oatmeal linen sofa",
    },
  ],
  [
    "architectural",
    {
      image: {
        alt: "A hotel lobby with a curved travertine reception desk against oxblood plaster walls",
        height: 1800,
        src: "/demo/looks/architectural.jpg",
        width: 1450,
      },
      prompt:
        "A hotel lobby with a travertine reception desk against oxblood plaster walls",
    },
  ],
  [
    "homeowner",
    {
      image: {
        alt: "A phone snapshot of a kitchen with oak cabinets and a cream range cooker",
        height: 1350,
        src: "/demo/looks/homeowner.jpg",
        width: 1800,
      },
      prompt:
        "A real home kitchen with oak shaker cabinets and a cream range cooker",
    },
  ],
  [
    "drawing",
    {
      image: {
        alt: "A line and wash drawing of a kitchen with bottle-green cabinets, an island with two stools and pale plaster walls",
        height: 1024,
        src: "/demo/looks/drawing.jpg",
        width: 1024,
      },
      prompt:
        "A kitchen with bottle-green cabinetry, pale plaster walls and white trim",
    },
  ],
  [
    "plate",
    {
      image: {
        alt: "An edge-to-edge sample of oxblood lime plaster with trowel marks",
        height: 1024,
        src: "/demo/looks/plate.jpg",
        width: 1024,
      },
      prompt: "A sample of oxblood lime plaster",
    },
  ],
  [
    "engraved",
    {
      image: {
        alt: "A grey-ink engraving of foxgloves and ferns running off all four edges",
        height: 1024,
        src: "/demo/looks/engraved.jpg",
        width: 1024,
      },
      prompt: "A wallpaper pattern of foxgloves and ferns",
    },
  ],
  [
    "ephemera",
    {
      image: {
        alt: "A stained, pinholed card reading Boxing match, Johnny Halloran vs Rocky Malone, Friday, October 12th, 1948",
        height: 1024,
        src: "/demo/looks/ephemera.jpg",
        width: 768,
      },
      prompt:
        "A 1948 boxing match card announcing JOHNNY HALLORAN VS ROCKY MALONE",
    },
  ],
  [
    "canvas",
    {
      image: {
        alt: "A linen canvas with loose ivory and grey strokes, hung above a wooden bench and a linen sofa",
        height: 1400,
        src: "/demo/looks/canvas.jpg",
        width: 1045,
      },
      prompt: "An abstract painting for a calm sitting room",
    },
  ],
  [
    "portrait",
    {
      image: {
        alt: "A potter in a sage sweatshirt shaping a clay vase on a wheel in a workshop",
        height: 1400,
        src: "/demo/looks/portrait.jpg",
        width: 1400,
      },
      prompt: "A ceramicist at the wheel in a daylit studio",
    },
  ],
  [
    "object",
    {
      image: {
        alt: "A ceramic table lamp with a sage green base and a white shade on a sage ground",
        height: 1024,
        src: "/demo/looks/object.jpg",
        width: 1024,
      },
      prompt: "A ceramic table lamp with a sage green base",
    },
  ],
]);

/** Every mood ran with this prompt, the lived-in look and one seed. */
export const MOOD_RUN = {
  look: "lived-in",
  prompt: "A family kitchen with a scrubbed oak table",
  seed: 4217,
};

const moodImage = (id: string, alt: string): Asset => ({
  alt,
  height: 768,
  src: `/demo/moods/${id}.jpg`,
  width: 1024,
});

export const MOOD_IMAGES = new Map<string, Asset>([
  [
    "window",
    moodImage(
      "window",
      "A kitchen with a wooden table, rush-seated chairs and a dresser in soft, even daylight"
    ),
  ],
  [
    "dawn",
    moodImage(
      "dawn",
      "A kitchen with a wooden table, a butler sink and tall glazed doors in cool, clear morning light"
    ),
  ],
  [
    "raking",
    moodImage(
      "raking",
      "A kitchen with a wooden table and open shelves, low sunlight laying long shadows across the floor"
    ),
  ],
  [
    "overcast",
    moodImage(
      "overcast",
      "A kitchen with a wooden table beside a rain-streaked window in soft grey light"
    ),
  ],
  [
    "lamplit",
    moodImage(
      "lamplit",
      "A kitchen with a wooden table, lit by wall lamps, candles and a wood stove"
    ),
  ],
  [
    "nocturne",
    moodImage(
      "nocturne",
      "A dark kitchen with a wooden table, lit by one wall light and two candles"
    ),
  ],
]);
