/**
 * The Tools chapters: fal tools with no Motif command of their own, run with
 * `motif tool run`, plus bria-expand, kept because it does something
 * `motif reframe` doesn't. Commands come from `docs/tools/regenerate.sh` or
 * `scripts/run-demos.mjs`. Import from `@/lib/site/content`.
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
    command: `motif tool run bria-expand -i source-interior.jpg --format json -o out-expand.jpg --json '{"canvas_size":[1536,1536]}'`,
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
    notes:
      "motif reframe redraws the whole image at a new ratio. bria-expand keeps the original and adds canvas around it.",
    relatesTo: "motif reframe",
    title: "Extend the canvas by a set size",
    tool: "bria-expand",
  },
  {
    caption:
      "All the text is gone, with the paper and plaster behind it rebuilt.",
    command:
      "motif tool run text-removal -i source-label.jpg --format json -o out-text-removal.jpg",
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
    title: "Remove text from an image",
    tool: "text-removal",
  },
  {
    caption:
      "The label with its text removed. The words come back as data, with their positions and likely fonts.",
    command:
      "motif tool run ideogram-layerize-text source-label.jpg -o layers/",
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
    notes:
      "The text comes back in the text_containers and text_html fields, not as image layers.",
    title: "Separate text from artwork",
    tool: "ideogram-layerize-text",
  },
  {
    caption: "The black-and-white street photograph given plausible colour.",
    command:
      "motif tool run ddcolor -i source-monochrome.jpg --format json -o out-colourise.jpg",
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
    title: "Colourise a black-and-white photo",
    tool: "ddcolor",
  },
  {
    caption:
      "The room as a depth map, with near surfaces light and far ones dark.",
    command:
      "motif tool run depth-anything source-interior.jpg -o out-depth.jpg",
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
    title: "Make a depth map",
    tool: "depth-anything",
  },
  {
    caption: "The vessel and plinth reduced to white lines on black.",
    command: "motif tool run lineart source-vessel.jpg -o out-lineart.jpg",
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
    title: "Turn a photo into line art",
    tool: "lineart",
  },
  {
    caption: "The figure's stance as a coloured skeleton on black.",
    command:
      "motif tool run dwpose -i source-figure.jpg --format json -o out-pose.jpg",
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
    title: "Trace a person's pose",
    tool: "dwpose",
  },
  {
    caption:
      "Base colour, normal and roughness maps from one photograph of linen.",
    command: "motif tool run patina source-linen.jpg -o pbr/",
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
    notes:
      "patina also writes metalness and height maps, which aren't shown. The roughness map still carries a lighter band from the light on the fold.",
    title: "Make material maps from a photo",
    tool: "patina",
  },
];
