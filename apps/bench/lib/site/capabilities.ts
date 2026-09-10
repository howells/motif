/**
 * Every capability shown on the demo page, each with a real output.
 *
 * Each `command` is the one that produced its asset, taken from
 * `docs/tools/regenerate.sh` or `scripts/run-demos.mjs` (which runs
 * `scripts/demo-manifest.json`), with file paths shortened to file names.
 * Import from `@/lib/site/content`.
 */

import type { Asset, Capability } from "@/lib/site/types";

// Sources, shared by several capabilities.

const APOTHECARY: Asset = {
  alt: "Three amber bottles and a white bowl on a travertine shelf, raking sunlight",
  height: 781,
  src: "/demo/sources/apothecary.jpg",
  width: 1400,
};

const INTERIOR: Asset = {
  alt: "An interior with a bench, linen and a plaster wall",
  height: 781,
  src: "/demo/sources/interior.jpg",
  width: 1400,
};

const LABEL: Asset = {
  alt: "A letterpress label reading SALVAGE & CO on textured paper",
  height: 781,
  src: "/demo/sources/label.jpg",
  width: 1400,
};

const VESSEL: Asset = {
  alt: "A ribbed stoneware vessel on a stone plinth",
  height: 1400,
  src: "/demo/sources/vessel.jpg",
  width: 1400,
};

const LINEN: Asset = {
  alt: "A macro photograph of folded linen weave",
  height: 1400,
  src: "/demo/sources/linen.jpg",
  width: 1400,
};

const MONOCHROME: Asset = {
  alt: "A black-and-white photograph of a woman in a wool coat beside a parked car on a wet cobbled street",
  height: 781,
  src: "/demo/sources/monochrome.jpg",
  width: 1400,
};

const FIGURE: Asset = {
  alt: "A person in loose oatmeal linen standing in a bare plaster room",
  height: 1400,
  src: "/demo/sources/figure.jpg",
  width: 939,
};

const MARK: Asset = {
  alt: "The word SALVAGE in a heavy olive sans-serif above a rule and a circular S monogram",
  height: 1400,
  src: "/demo/sources/mark.jpg",
  width: 1400,
};

const GENERATE_PROMPT =
  "editorial still life, three amber glass apothecary bottles of descending height and a white ceramic bowl on a travertine shelf, raking afternoon sunlight casting long shadows on a warm plaster wall, muted palette";

const ERASE_PROMPT = "the small amber bottle on the right of the group";

export const CAPABILITIES: Capability[] = [
  {
    caption:
      "A 16:9 still life made from the prompt alone, with no reference image.",
    command: `motif "${GENERATE_PROMPT}" -m banana -a 16:9 -r 2K --no-open -o source-apothecary.jpg`,
    demo: { kind: "set", outputs: [APOTHECARY] },
    group: "make",
    id: "generate",
    title: "Make an image from a prompt",
  },
  {
    caption: "Five images on one captioned sheet, three to a row.",
    command:
      "motif sheet editorial.jpg still-life.jpg lived-in.jpg architectural.jpg homeowner.jpg -o sheet.png",
    demo: {
      kind: "set",
      outputs: [
        {
          alt: "A contact sheet of five look images, each captioned with its file name: editorial, still-life and lived-in on the top row, architectural and homeowner below",
          height: 1192,
          src: "/demo/sheet.jpg",
          width: 1632,
        },
      ],
    },
    group: "make",
    id: "sheet",
    title: "Lay images out on a contact sheet",
  },
  {
    caption:
      "The small bottle is gone and the shelf rebuilt, but its shadow is still on the wall.",
    command: `motif erase "${ERASE_PROMPT}" source-apothecary.jpg --no-open -o out-erased.jpg`,
    demo: {
      after: {
        alt: "The same shelf with the small bottle gone but its shadow still on the wall",
        height: 781,
        src: "/demo/erase/object-removal.jpg",
        width: 1400,
      },
      before: APOTHECARY,
      kind: "pair",
    },
    group: "edit",
    id: "erase",
    notes:
      "motif erase runs object-removal at $0.024. finegrain-eraser also removes the shadow, at $0.27.",
    title: "Remove an object",
    tool: "object-removal",
  },
  {
    caption: "The small bottle and the shadow it cast are both gone.",
    command: `motif tool run finegrain-eraser source-apothecary.jpg --prompt "${ERASE_PROMPT}" -o out-erased-finegrain.jpg`,
    demo: {
      after: {
        alt: "The same shelf with the small bottle and its shadow both gone",
        height: 781,
        src: "/demo/erase/finegrain-eraser.jpg",
        width: 1400,
      },
      before: APOTHECARY,
      kind: "pair",
    },
    group: "edit",
    id: "erase-shadow",
    notes:
      "The help for motif erase recommends finegrain-eraser for objects with a visible shadow.",
    relatesTo: "motif erase",
    title: "Remove an object and its shadow",
    tool: "finegrain-eraser",
  },
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
    group: "edit",
    id: "extend",
    notes:
      "motif reframe calls ideogram-reframe, and none of its output is shown here. Its help recommends bria-expand for outpainting by a set margin.",
    relatesTo: "motif reframe",
    title: "Extend the canvas",
    tool: "bria-expand",
  },
  {
    caption:
      "A 360px, heavily compressed copy of the vessel, enlarged to full size.",
    command:
      "motif tool run topaz-precision -i derived-upscale.jpg --format json -o out-upscale.jpg",
    demo: {
      after: {
        alt: "The same vessel enlarged, with the ribs and the plinth's edges defined",
        height: 1400,
        src: "/demo/upscale/after.jpg",
        width: 1400,
      },
      before: {
        alt: "A small, heavily compressed copy of the ribbed stoneware vessel on its plinth",
        height: 360,
        src: "/demo/upscale/before.jpg",
        width: 360,
      },
      kind: "pair",
    },
    group: "edit",
    id: "upscale",
    notes:
      "motif enhance --upscale makes this same topaz-precision call. The source was shrunk to 360px at JPEG quality 35 first, so there was detail to recover.",
    relatesTo: "motif enhance --upscale",
    title: "Upscale a small image",
    tool: "topaz-precision",
  },
  {
    caption:
      "The vessel on a transparent background, with the plinth and wall removed.",
    command: "motif tool run bria-rmbg source-vessel.jpg -o out-nobg.png",
    demo: {
      after: {
        alt: "The ribbed stoneware vessel alone on a transparent background",
        height: 1400,
        src: "/demo/background-removal/vessel.png",
        width: 1400,
      },
      before: VESSEL,
      kind: "pair",
    },
    group: "edit",
    id: "remove-background",
    notes:
      "motif --rmbg does the same job on the last image, using BiRefNet. This one was made with bria-rmbg.",
    relatesTo: "motif --rmbg",
    title: "Remove the background",
    tool: "bria-rmbg",
  },
  {
    caption:
      "Each bottle and the bowl come back as separate cut-outs, along with the empty shelf behind them.",
    command:
      "motif tool run seedream-layerize -i source-apothecary.jpg --format json -o layers-objects/",
    demo: {
      kind: "set",
      outputs: [
        {
          alt: "The travertine shelf and plaster wall, empty, with the raking light intact",
          height: 781,
          src: "/demo/layers/plate.jpg",
          width: 1400,
        },
        {
          alt: "An amber glass bottle cut out on transparency",
          height: 800,
          src: "/demo/layers/layer-2.png",
          width: 371,
        },
        {
          alt: "A darker amber glass bottle cut out on transparency",
          height: 800,
          src: "/demo/layers/layer-3.png",
          width: 337,
        },
        {
          alt: "The white ceramic bowl cut out on transparency",
          height: 542,
          src: "/demo/layers/layer-4.png",
          width: 800,
        },
        {
          alt: "An amber glass pump bottle cut out on transparency",
          height: 800,
          src: "/demo/layers/layer-5.png",
          width: 305,
        },
      ],
      source: APOTHECARY,
    },
    group: "edit",
    id: "layers",
    notes:
      "motif layers calls qwen-layered, and none of its output is shown here. seedream-layerize also names each layer in its JSON response.",
    relatesTo: "motif layers",
    title: "Split an image into layers",
    tool: "seedream-layerize",
  },
  {
    caption: "The wordmark, rule and monogram traced to SVG paths.",
    command:
      "motif tool run recraft-vectorize -i source-mark.jpg --format json -o out-vectorize.svg",
    demo: {
      after: {
        alt: "The SALVAGE wordmark, rule and monogram as a vector drawing",
        height: 2048,
        src: "/demo/vectorize/mark.svg",
        width: 2048,
      },
      before: MARK,
      kind: "pair",
    },
    group: "edit",
    id: "vectorize",
    notes: "motif vectorize makes this same recraft-vectorize call.",
    relatesTo: "motif vectorize",
    title: "Trace an image to SVG",
    tool: "recraft-vectorize",
  },
  {
    caption: "The bowl, found by name and cut out on a transparent background.",
    command:
      'motif segment "the white ceramic bowl" source-apothecary.jpg --no-open -o segment/',
    demo: {
      after: {
        alt: "The bowl isolated on transparency",
        height: 781,
        src: "/demo/segment/bowl.png",
        width: 1400,
      },
      before: APOTHECARY,
      kind: "pair",
    },
    group: "understand",
    id: "segment",
    title: "Cut out a named object",
    tool: "sam3-image",
  },
  {
    caption: "Counts the bottles and names what the bowl is made of.",
    command: `motif tool run moondream-query -i source-apothecary.jpg --format json --json '{"prompt":"How many bottles are there, and what is the vessel on the right made of?"}'`,
    demo: {
      kind: "text",
      output: "3 bottles and a white ceramic bowl",
      source: APOTHECARY,
    },
    group: "understand",
    id: "ask",
    notes:
      'motif ask makes this same moondream-query call. The model\'s reasoning: "I see three bottles. To the right of the bottles, I see a white bowl. The bowl appears to be made of ceramic."',
    relatesTo: "motif ask",
    title: "Ask a question about an image",
    tool: "moondream-query",
  },
  {
    caption:
      "One box for each of the three bottles, as fractions of the image's width and height.",
    command: `motif tool run moondream-detect -i source-apothecary.jpg --format json --json '{"prompt":"bottle"}'`,
    demo: {
      boxes: [
        {
          label: "bottle",
          x0: 0.233154296875,
          x1: 0.325439453125,
          y0: 0.49609375,
          y1: 0.87890625,
        },
        {
          label: "bottle",
          x0: 0.34765625,
          x1: 0.43359375,
          y0: 0.490234375,
          y1: 0.884765625,
        },
        {
          label: "bottle",
          x0: 0.468994140625,
          x1: 0.538818359375,
          y0: 0.60546875,
          y1: 0.87109375,
        },
      ],
      kind: "boxes",
      source: APOTHECARY,
    },
    group: "understand",
    id: "detect",
    notes: "motif ask --detect makes this same moondream-detect call.",
    relatesTo: "motif ask --detect",
    title: "Find objects in an image",
    tool: "moondream-detect",
  },
  {
    caption: "The words on the label, transcribed.",
    command: "motif tool run got-ocr --inputs source-label.jpg --format json",
    demo: {
      kind: "text",
      output: "SALVAGE& CO BOTANICAL EXTRACT NO. 04",
      source: LABEL,
    },
    group: "understand",
    id: "ocr",
    notes:
      "The label reads SALVAGE & CO. The transcription runs the ampersand into the word before it.",
    title: "Read the text in an image",
    tool: "got-ocr",
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
