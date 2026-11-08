import { cliCommand, taskCommand } from "./commands";
import type { Chapter, Entry } from "./types";

/** The Read and convert chapter, on the mount: what Motif reads out of a
 * picture and what it turns a picture into. The words follow the Paper file
 * "Motif" exactly. */

const ASK = {
  id: "ask",
  headline: "Ask about a picture.",
  body: "Get captions, alt text, counts or the words on a label. A question costs a fraction of a penny.",
  command: taskCommand("ask", "motif ask"),
  // From a real `motif ask` on this picture. If the picture or the question
  // changes, run it again and use the new answer word for word.
  exchange: {
    question: {
      speaker: "You",
      text: "How many blocks of clay are there, and where are they?",
    },
    answer: {
      speaker: "Motif",
      text: "There are four blocks of clay arranged on a wooden work surface.",
    },
  },
  figures: [
    {
      image: {
        alt: "Four blocks of raw clay on a board by a studio window, beside a clay pot on a round wooden turntable.",
        height: 1000,
        src: "/demo/series/02.jpg",
        width: 1000,
      },
    },
  ],
} as const satisfies Entry;

const SEGMENT = {
  id: "segment",
  headline: "Select one object.",
  body: "Say “the white bowl” and you get the bowl alone, cut along its real edge. Works on video too.",
  command: taskCommand("segment", "motif segment"),
  figures: [
    {
      image: {
        alt: "Three clear glass bottles, faded back, and a cream ceramic bowl picked out at full strength on a white stone ledge.",
        height: 781,
        src: "/demo/showcase/segment-focus.jpg",
        width: 1400,
      },
    },
  ],
} as const satisfies Entry;

const LAYERS = {
  id: "layers",
  headline: "Split a picture into layers.",
  body: "The wall, the plinth and the pot each become a separate transparent layer you can move or replace.",
  command: taskCommand("layers", "motif layers"),
  figures: [
    {
      image: {
        alt: "A still life pulled apart into three tilted transparent sheets: a plaster wall, a stone plinth and a ribbed pot.",
        height: 1160,
        src: "/demo/showcase/layers-exploded.png",
        width: 1004,
      },
    },
  ],
} as const satisfies Entry;

const MAPS = {
  id: "map",
  headline: "Depth, pose and edge maps.",
  body: "Use them to hold a picture's structure while another tool changes the rest.",
  command: taskCommand("map", "motif map"),
  figures: [
    {
      caption: "Depth",
      image: {
        alt: "A depth map of a pottery studio: the kiln near the camera in pale grey, the shelves behind it fading to black.",
        height: 1000,
        src: "/demo/depth/studio.png",
        width: 1000,
      },
    },
    {
      caption: "Pose",
      image: {
        alt: "A standing figure drawn as a stick skeleton of coloured joints and limbs on black.",
        height: 1024,
        src: "/demo/pose/figure.jpg",
        width: 1024,
      },
    },
    {
      caption: "Edges",
      image: {
        alt: "The outlines of a ribbed pot on a plinth, traced in white lines on black.",
        height: 1400,
        src: "/demo/edges/vessel.jpg",
        width: 1400,
      },
    },
  ],
} as const satisfies Entry;

const MATERIALS = {
  id: "material",
  headline: "Materials for 3D.",
  body: "A photo of linen becomes the maps a 3D app needs to render it.",
  command: taskCommand("material", "motif material"),
  figures: [
    {
      caption: "Colour",
      image: {
        alt: "Folds of natural cream linen, its weave visible, lit evenly.",
        height: 1400,
        src: "/demo/materials/basecolor.jpg",
        width: 1400,
      },
    },
    {
      caption: "Bumps",
      image: {
        alt: "The same linen as a blue and violet normal map, its folds and weave as shifts of colour.",
        height: 1400,
        src: "/demo/materials/normal.jpg",
        width: 1400,
      },
    },
    {
      caption: "Shine",
      image: {
        alt: "The same linen as a roughness map in dark greys.",
        height: 1400,
        src: "/demo/materials/roughness.jpg",
        width: 1400,
      },
    },
  ],
} as const satisfies Entry;

const VECTORIZE = {
  id: "vectorize",
  headline: "Convert to SVG.",
  body: "Logos, icons and illustrations traced as SVG, sharp at any size.",
  command: taskCommand("vectorize", "motif vectorize"),
  figures: [
    {
      caption: "Original, zoomed in",
      image: {
        alt: "Close on an olive-green drawing of a sprig printed on textured paper, its edges soft with the paper's grain.",
        height: 840,
        src: "/demo/showcase/mark-pixels-zoom.png",
        width: 628,
      },
    },
    {
      caption: "SVG, zoomed in",
      image: {
        alt: "The same sprig traced as flat olive-green shapes with clean, sharp edges on a plain ground.",
        height: 840,
        src: "/demo/showcase/mark-vector-zoom.png",
        width: 628,
      },
    },
  ],
} as const satisfies Entry;

const MESH = {
  id: "mesh",
  headline: "A 3D model from a photo.",
  body: "It comes textured, with a skeleton if you want to pose it.",
  command: taskCommand("mesh", "motif mesh"),
  figures: [
    {
      caption: "The photo",
      image: {
        alt: "A woman in a loose linen top and trousers standing in a bare room with a tall window.",
        height: 1400,
        src: "/demo/sources/figure.jpg",
        width: 939,
      },
    },
    {
      caption: "The 3D model, rigged",
      image: {
        alt: "The same woman as a textured 3D model, standing on her own with no room around her.",
        height: 512,
        src: "/demo/mesh/rigged.png",
        width: 512,
      },
    },
  ],
} as const satisfies Entry;

const SHEET = {
  id: "sheet",
  headline: "Make a contact sheet.",
  body: "Point it at a folder. Each picture can carry its name or price.",
  command: cliCommand("sheet", "motif sheet"),
  figures: [
    {
      image: {
        alt: "A contact sheet of nine pictures in three rows, each labelled underneath with its file name and some with a price.",
        height: 1776,
        src: "/demo/sheet.jpg",
        width: 1632,
      },
    },
  ],
} as const satisfies Entry;

export const READ_AND_CONVERT: Chapter = {
  id: "read-and-convert",
  title: "Read and convert",
  intro:
    "Ask what's in a picture, or turn it into layers, maps, vectors and 3D.",
  tone: "mount",
  entries: [ASK, SEGMENT, LAYERS, MAPS, MATERIALS, VECTORIZE, MESH, SHEET],
};
