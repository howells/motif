// Relative, not `@/`, so the Make tests (outside the app's tsconfig) can
// read the chapter's type.
import { cliCommand, taskCommand } from "./commands";
import type { Chapter, Figure, ImageRef } from "./types";

/** The Make chapter, as the Paper file "Motif" sets it: desktop sections 03
 * (Make), 04 (Seamless textures) and 05 (Make, continued); phone 04 to 06. */

const VASE: ImageRef = {
  alt: "A cream stoneware vase on a linen cloth by a window.",
  height: 1000,
  src: "/demo/vase/vase.jpg",
  width: 1000,
};

function picture(image: ImageRef): Figure {
  return { image };
}

function seriesFrame(number: string, alt: string): Figure {
  return picture({
    alt,
    height: 1000,
    src: `/demo/series/${number}.jpg`,
    width: 1000,
  });
}

export const MAKE: Chapter = {
  id: "make",
  title: "Make",
  intro: "Start from a sentence, or from something you already have.",
  nav: "What it does",
  tone: "ground",
  entries: [
    {
      id: "from-a-sentence",
      headline: "A picture from a sentence.",
      body: "Describe it as you'd brief a photographer. Motif picks the model best suited to that kind of picture.",
      command: taskCommand("generate", 'motif "…"'),
      figures: [
        picture({
          alt: "Jars of pigment and folded green and plum cloths laid out on a worn wooden table in a white studio.",
          height: 1800,
          src: "/demo/looks/editorial.jpg",
          width: 1800,
        }),
        picture({
          alt: "A woman in a linen shirt against a pale plaster wall, looking at the camera.",
          height: 2048,
          src: "/demo/looks/portrait.jpg",
          width: 2048,
        }),
        picture({
          alt: "A cream Georgian house behind clipped hedges and a striped lawn.",
          height: 2048,
          src: "/demo/looks/architectural.jpg",
          width: 1650,
        }),
      ],
    },
    {
      id: "from-your-photos",
      headline: "One picture from several of yours.",
      body: "Add photos of things you own and say how to arrange them. The still life on the left was made from these four.",
      command: taskCommand(
        "generate",
        'motif "…" -e cup.jpg -e linen.jpg -e vase.jpg -e bottle.jpg'
      ),
      phone: {
        body: "Add photos of things you own and say how to arrange them. The still life above was made from the four below it.",
        command: taskCommand("generate", 'motif "…" -e cup.jpg -e vase.jpg …'),
      },
      figures: [
        picture({
          alt: "A still life of a ribbed cup, a cream vase and an amber bottle on folded linen against an olive wall.",
          height: 2048,
          src: "/demo/showcase/still-life.jpg",
          width: 1632,
        }),
        picture({
          alt: "A ribbed cream cup on a white stone plinth.",
          height: 1400,
          src: "/demo/sources/vessel.jpg",
          width: 1400,
        }),
        picture({
          alt: "Folds of plain cream linen.",
          height: 1400,
          src: "/demo/sources/linen.jpg",
          width: 1400,
        }),
        picture(VASE),
        picture({
          alt: "Three amber glass bottles and a white bowl on a stone shelf.",
          height: 781,
          src: "/demo/sources/apothecary.jpg",
          width: 1400,
        }),
      ],
    },
    {
      id: "variations",
      headline: "Variations.",
      body: "Give it one picture and get several new versions of it.",
      command: taskCommand("vary", "motif vary"),
      figures: [
        { caption: "Yours", image: VASE },
        {
          caption: "Variation one",
          image: {
            alt: "A rounder stoneware vase holding dried flowers, on a linen cloth by a window.",
            height: 1000,
            src: "/demo/vase/vary-1.jpg",
            width: 1000,
          },
        },
        {
          caption: "Variation two",
          image: {
            alt: "A pale green vase holding dried grasses and honesty, on linen in front of a curtain.",
            height: 1000,
            src: "/demo/vase/vary-2.jpg",
            width: 1000,
          },
        },
      ],
    },
    {
      id: "matching-set",
      headline: "A matching set.",
      body: "Name a theme and how many pictures you want. They come back in the same light and colour.",
      command: cliCommand("series", "motif series run"),
      figures: [
        seriesFrame(
          "01",
          "A potter's workshop with shelves of pots, a long workbench and a kiln."
        ),
        seriesFrame(
          "02",
          "Blocks of clay and a thrown pot on a wooden bench beside a wheel."
        ),
        seriesFrame(
          "03",
          "A lump of clay, a small bowl and wooden tools on a worn table."
        ),
        seriesFrame("04", "Unglazed pots crowded on a workbench by a window."),
        seriesFrame(
          "05",
          "A brick kiln with its door open in the corner of the workshop."
        ),
        seriesFrame("06", "A dark stoneware pot on a long bench by a window."),
      ],
    },
    {
      id: "no-background",
      headline: "No background.",
      body: "The picture comes back transparent, so there's nothing to cut out.",
      command: taskCommand("generate", 'motif "…" --transparent'),
      figures: [
        picture({
          alt: "A sprig of eucalyptus on a transparent background.",
          height: 1024,
          src: "/demo/showcase/eucalyptus.png",
          width: 1024,
        }),
      ],
    },
    {
      id: "lettering",
      headline: "Lettering, spelled right.",
      body: "Put the words in your prompt and they appear as written. This label came from the prompt.",
      command: taskCommand("generate", 'motif "a bottle label that reads…"'),
      phone: {
        command: taskCommand("generate", 'motif "a label that reads…"'),
      },
      figures: [
        picture({
          alt: "An amber bottle whose cream label reads “Motif”, beside a sprig of dried herb against a terracotta wall.",
          height: 2048,
          src: "/demo/showcase/bottle-label.jpg",
          width: 1632,
        }),
      ],
    },
    {
      id: "seamless-textures",
      headline: "Seamless textures.",
      body: "Stone, plaster, linen or paper that repeats with no visible join. Here, one travertine tile is laid four times.",
      command: taskCommand("tile", "motif tile"),
      figures: [
        picture({
          alt: "A tile of pale travertine, laid four times side by side with no visible join.",
          height: 1024,
          src: "/demo/showcase/travertine.jpg",
          width: 1024,
        }),
      ],
    },
    {
      id: "film",
      headline: "Film from a still.",
      body: "A few seconds long. Here the light moves across the shelf and the bottles stay where they are.",
      command: taskCommand("animate", "motif animate"),
      figures: [
        {
          film: { play: "Play the film", src: "/demo/video/apothecary.mp4" },
          image: {
            alt: "Three amber bottles and a white bowl on a stone shelf, with sunlight falling across the wall.",
            height: 781,
            src: "/demo/video/poster.jpg",
            width: 1400,
          },
        },
      ],
    },
  ],
};
