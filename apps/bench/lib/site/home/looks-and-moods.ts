import type { LookId, MoodId } from "@howells/motif-sdk";

import { docs } from "./commands";
import type { Chapter, Command, Entry, ImageRef } from "./types";

/** A plate as the Paper board labels it, tied to the SDK id it shows. The
 * label is the board's word, which can be shorter than the SDK's own label
 * ("Window" for "Window light"); the id is what `--look` and `--mood`
 * accept, so a plate cannot name a Look or Mood Motif lacks. */
export interface LookPlate {
  readonly image: ImageRef;
  readonly label: string;
  readonly look: LookId;
}

export interface MoodPlate {
  readonly image: ImageRef;
  readonly label: string;
  readonly mood: MoodId;
}

/** The nine house Looks, in the order the board draws them. */
export const LOOK_PLATES: readonly LookPlate[] = [
  {
    look: "editorial",
    label: "Editorial",
    image: {
      alt: "Pigment jars and folded cloth on a scrubbed wooden table in daylight",
      height: 1800,
      src: "/demo/looks/editorial.jpg",
      width: 1800,
    },
  },
  {
    look: "portrait",
    label: "Portrait",
    image: {
      alt: "A woman in a plain linen shirt, hair tied back, against a plaster wall in soft evening light",
      height: 2048,
      src: "/demo/looks/portrait.jpg",
      width: 2048,
    },
  },
  {
    look: "still-life",
    label: "Still life",
    image: {
      alt: "A sage-green glazed pot and two rough white clay pots on a plaster ledge in raking sun",
      height: 1024,
      src: "/demo/looks/still-life.jpg",
      width: 1024,
    },
  },
  {
    look: "architectural",
    label: "Architectural",
    image: {
      alt: "A restored country house in pale lime render with sash windows, seen across a clipped lawn between pleached limes and yew",
      height: 2048,
      src: "/demo/looks/architectural.jpg",
      width: 1650,
    },
  },
  {
    look: "interior",
    label: "Interior",
    image: {
      alt: "A linen-covered sofa before green shelves of books and pottery, a lamp on a skirted side table, on a pale wooden floor",
      height: 768,
      src: "/demo/looks/interior.jpg",
      width: 1024,
    },
  },
  {
    look: "object",
    label: "Object",
    image: {
      alt: "A sage-green ceramic table lamp with a white shade, lit, on a sage ground",
      height: 1024,
      src: "/demo/looks/object.jpg",
      width: 1024,
    },
  },
  {
    look: "illustration",
    label: "Illustration",
    image: {
      alt: "A stoneware jug with an olive branch and two shallow bowls on a table by a tall window, drawn in line and gouache",
      height: 1024,
      src: "/demo/looks/illustration.jpg",
      width: 1024,
    },
  },
  {
    look: "surface",
    label: "Surface",
    image: {
      alt: "Sand-coloured plaster seen flat and edge to edge, combed in sweeping arcs",
      height: 1024,
      src: "/demo/looks/surface.jpg",
      width: 1024,
    },
  },
  {
    look: "abstract",
    label: "Abstract",
    image: {
      alt: "Two long gestures in oatmeal and putty over a pale vertical band on coarse linen, one charcoal mark low right",
      height: 1374,
      src: "/demo/looks/abstract.jpg",
      width: 2048,
    },
  },
];

/** One kitchen, one prompt: only the Mood changes from plate to plate. In
 * the order the board draws them. */
export const MOOD_PLATES: readonly MoodPlate[] = [
  {
    mood: "window",
    label: "Window",
    image: {
      alt: "A farmhouse kitchen with a scrubbed pine table, lit softly from a window",
      height: 768,
      src: "/demo/moods/window.jpg",
      width: 1024,
    },
  },
  {
    mood: "dawn",
    label: "Dawn",
    image: {
      alt: "The same kitchen at dawn, cool light through a tall glazed door",
      height: 768,
      src: "/demo/moods/dawn.jpg",
      width: 1024,
    },
  },
  {
    mood: "raking",
    label: "Raking sun",
    image: {
      alt: "The same kitchen with low sun raking across the table and floorboards",
      height: 768,
      src: "/demo/moods/raking.jpg",
      width: 1024,
    },
  },
  {
    mood: "overcast",
    label: "Overcast",
    image: {
      alt: "The same kitchen in grey light from a rainy window",
      height: 768,
      src: "/demo/moods/overcast.jpg",
      width: 1024,
    },
  },
  {
    mood: "lamplit",
    label: "Lamplit",
    image: {
      alt: "The same kitchen in the evening, lit by lamps, candles and a fire",
      height: 768,
      src: "/demo/moods/lamplit.jpg",
      width: 1024,
    },
  },
  {
    mood: "nocturne",
    label: "Nocturne",
    image: {
      alt: "The same kitchen at night, lit by one wall lamp and candles",
      height: 768,
      src: "/demo/moods/nocturne.jpg",
      width: 1024,
    },
  },
];

/** `--look` and `--mood` are flags on any prompt, not commands, so they link
 * to the docs page that lists every Look and Mood. */
function lookFlag(look: LookId): Command {
  return { docs: docs("looks-and-moods"), text: `--look ${look}` };
}

function moodFlag(mood: MoodId): Command {
  return { docs: docs("looks-and-moods"), text: `--mood ${mood}` };
}

/** The nine Look plates in a strip, and the `--look` flag below them. */
export const LOOK_ROW: Entry = {
  id: "looks",
  command: lookFlag("editorial"),
  figures: LOOK_PLATES.map(({ image, label }) => ({ caption: label, image })),
};

/** What a screen reader calls the strip of Look plates, which scrolls
 * sideways and takes focus so a keyboard can scroll it. The board shows it
 * no heading of its own. */
export const LOOK_STRIP_LABEL = "Looks";

/** The six Mood plates under their headline, and the `--mood` flag. */
export const MOOD_ROW: Entry = {
  id: "moods",
  headline: "One kitchen prompt in six moods.",
  command: moodFlag("lamplit"),
  figures: MOOD_PLATES.map(({ image, label }) => ({ caption: label, image })),
};

export const LOOKS_AND_MOODS: Chapter = {
  id: "looks-and-moods",
  title: "Looks and moods",
  intro: "Nine house styles you can add to any prompt. A mood sets the light.",
  nav: "Looks",
  tone: "ground",
  entries: [LOOK_ROW, MOOD_ROW],
};
