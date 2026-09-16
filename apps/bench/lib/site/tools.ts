/**
 * The later chapters: modes and tiers of the verbs, and the map and material
 * commands. Commands match `scripts/demo-manifest.json`; `model` records which
 * Model made each asset, as provenance only. Import from `@/lib/site/content`.
 */

import {
  FIGURE,
  INTERIOR,
  LABEL,
  LINEN,
  MONOCHROME,
  VESSEL,
} from "@/lib/site/sources";
import type { Capability } from "@/lib/site/types";

export const TOOL_CAPABILITIES: Capability[] = [
  {
    caption:
      "The 16:9 room becomes a square, with new wall above and new floor below.",
    command:
      "motif reframe source-interior.jpg --square --tier fast -o out-expand.jpg --format json",
    demo: {
      after: {
        alt: "The same interior extended to a square, with more wall above the bench and more floor below it",
        height: 1400,
        src: "/demo/expand/bria-expand.jpg",
        width: 1400,
      },
      before: INTERIOR,
      kind: "pair",
    },
    group: "tools",
    id: "tool-expand",
    model: "bria-expand",
    notes:
      "The default tier redraws the whole image at the new ratio. The fast tier keeps the original and adds canvas around it.",
    title: "Extend the canvas around the original",
  },
  {
    caption:
      "All the text is gone, with the paper and plaster behind it rebuilt.",
    command:
      "motif erase --text source-label.jpg -o out-text-removal.jpg --format json",
    demo: {
      after: {
        alt: "The deckle-edged paper on plaster, blank, with all the type removed",
        height: 756,
        src: "/demo/text-removal/label.jpg",
        width: 1400,
      },
      before: LABEL,
      kind: "pair",
    },
    group: "tools",
    id: "tool-text-removal",
    model: "text-removal",
    title: "Remove text from an image",
  },
  {
    caption:
      "The label with its text removed. The words come back as data, with their positions and likely fonts.",
    command: "motif layers --text source-label.jpg -o layers/",
    demo: {
      after: {
        alt: "The same label with the type gone, paper grain and plaster intact",
        height: 785,
        src: "/demo/type-layers/plate.jpg",
        width: 1400,
      },
      before: LABEL,
      kind: "pair",
    },
    group: "tools",
    id: "tool-type-layers",
    model: "ideogram-layerize-text",
    notes:
      "The text comes back in the text_containers and text_html fields, not as image layers.",
    title: "Separate text from artwork",
  },
  {
    caption: "The black-and-white street photograph given plausible colour.",
    command:
      "motif restore --colour source-monochrome.jpg -o out-colourise.jpg --format json",
    demo: {
      after: {
        alt: "The same street photograph in colour, with a plum car and a brown tweed coat",
        height: 781,
        src: "/demo/colourise/street.jpg",
        width: 1400,
      },
      before: MONOCHROME,
      kind: "pair",
    },
    group: "tools",
    id: "tool-colourise",
    model: "ddcolor",
    title: "Colourise a black-and-white photo",
  },
  {
    caption:
      "The room as a depth map, with near surfaces light and far ones dark.",
    command: "motif map source-interior.jpg -o out-depth.jpg",
    demo: {
      after: {
        alt: "The same interior as a greyscale depth map",
        height: 781,
        src: "/demo/depth/interior.jpg",
        width: 1400,
      },
      before: INTERIOR,
      kind: "pair",
    },
    group: "tools",
    id: "tool-depth",
    model: "depth-anything",
    title: "Make a depth map",
  },
  {
    caption: "The vessel and plinth reduced to white lines on black.",
    command: "motif map --lineart source-vessel.jpg -o out-lineart.jpg",
    demo: {
      after: {
        alt: "The same vessel as white line art on black",
        height: 1400,
        src: "/demo/lineart/vessel.jpg",
        width: 1400,
      },
      before: VESSEL,
      kind: "pair",
    },
    group: "tools",
    id: "tool-lineart",
    model: "lineart",
    title: "Turn a photo into line art",
  },
  {
    caption: "The figure's stance as a coloured skeleton on black.",
    command: "motif map --pose source-figure.jpg -o out-pose.jpg --format json",
    demo: {
      after: {
        alt: "A coloured stick-figure skeleton of the standing pose on black",
        height: 1400,
        src: "/demo/pose/figure.jpg",
        width: 933,
      },
      before: FIGURE,
      kind: "pair",
    },
    group: "tools",
    id: "tool-pose",
    model: "dwpose",
    title: "Trace a person's pose",
  },
  {
    caption:
      "Base colour, normal and roughness maps from one photograph of linen.",
    command: "motif material source-linen.jpg -o pbr/",
    demo: {
      kind: "set",
      outputs: [
        {
          alt: "The linen weave with the lighting mostly evened out",
          height: 1400,
          src: "/demo/materials/basecolor.jpg",
          width: 1400,
        },
        {
          alt: "A blue-violet tangent-space normal map of the weave",
          height: 1400,
          src: "/demo/materials/normal.jpg",
          width: 1400,
        },
        {
          alt: "A greyscale roughness map, dark across the weave",
          height: 1400,
          src: "/demo/materials/roughness.jpg",
          width: 1400,
        },
      ],
      source: LINEN,
    },
    group: "tools",
    id: "tool-materials",
    model: "patina",
    notes:
      "It also writes metalness and height maps, which aren't shown. The roughness map still carries a lighter band from the light on the fold.",
    title: "Make material maps from a photo",
  },
  {
    caption:
      "The figure as a textured 3D mesh with a skeleton already inside, ready to pose or animate.",
    command: "motif mesh source-figure.jpg --rig -o mesh-rig/",
    demo: {
      kind: "set",
      outputs: [
        {
          alt: "A render of the mesh: the person standing in loose pale linen, on a transparent background",
          height: 512,
          src: "/demo/mesh/rigged.png",
          width: 512,
        },
      ],
      source: FIGURE,
    },
    group: "tools",
    id: "mesh-rig",
    model: "meshy-v7",
    notes:
      "The mesh comes back as GLB and FBX files for a 3D tool. The image here is the preview render that comes with them.",
    title: "Make a rigged 3D figure from a photo",
  },
];
