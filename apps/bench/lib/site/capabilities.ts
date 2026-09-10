/**
 * Every capability shown on the demo page, each with a real output.
 *
 * Each `command` is the one that produced its asset, with file paths
 * shortened to file names. Motif commands come from the demo runs in
 * `commands.json`; the `motif tool run` chapters from `docs/tools/regenerate.sh`
 * or `scripts/run-demos.mjs`. A tool run stays only where it shows something
 * the Motif command doesn't. Import from `@/lib/site/content`.
 */

import {
  DETECT_OUTPUT,
  HISTORY_OUTPUT,
  LAST_OUTPUT,
  STUDIO_SCREEN,
} from "@/lib/site/cli-output";
import { SERIES_CAPABILITY } from "@/lib/site/series";
import {
  APOTHECARY,
  INTERIOR,
  LABEL,
  MARK,
  SMALL_VESSEL,
  VASE,
} from "@/lib/site/sources";
import { TOOL_CAPABILITIES } from "@/lib/site/tools";
import type { Capability } from "@/lib/site/types";

const GENERATE_PROMPT =
  "editorial still life, three amber glass apothecary bottles of descending height and a white ceramic bowl on a travertine shelf, raking afternoon sunlight casting long shadows on a warm plaster wall, muted palette";

const VASE_PROMPT =
  "A pale stoneware vase on a plain linen ground, soft daylight";

const ERASE_PROMPT = "the small amber bottle on the right of the group";

const VIDEO_INPUT = JSON.stringify({
  command: "video",
  imagePath: "source-apothecary.jpg",
  prompt:
    "Soft daylight drifts slowly across the wall behind the bottles. The camera stays still.",
});

export const CAPABILITIES: Capability[] = [
  // Make
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
    caption: "The same shelf at dusk, with the bottles in cobalt blue glass.",
    command:
      'motif "The same shelf at dusk, the bottles in cobalt blue glass" -e source-apothecary.jpg -m banana -o edit.png --no-open --format json',
    demo: {
      after: {
        alt: "The same shelf at dusk, the three bottles in cobalt blue glass and low orange light on the wall",
        height: 1000,
        src: "/demo/edit/dusk.jpg",
        width: 1000,
      },
      before: APOTHECARY,
      kind: "pair",
    },
    group: "make",
    id: "edit-with-prompt",
    notes: "No -a was given, so the edit came back square.",
    title: "Edit an image with a prompt",
  },
  {
    caption:
      "A celadon vase made straight onto a transparent background, with no cut-out step.",
    command:
      'motif "A ceramic vase with a pale celadon glaze, studio product shot" -m gpt --transparent -o vase-transparent.png --no-open --format json',
    demo: {
      kind: "set",
      outputs: [
        {
          alt: "A celadon crackle-glaze vase on a transparent background",
          height: 1024,
          src: "/demo/vase/transparent.png",
          width: 1024,
        },
      ],
    },
    group: "make",
    id: "transparent",
    title: "Make an image with a transparent background",
  },
  {
    caption: "Two new takes of the same prompt and model.",
    command: `motif --vary "${VASE_PROMPT}" -m banana2 -n 2 -o vary.png --no-open --format json`,
    demo: {
      kind: "set",
      outputs: [
        {
          alt: "A small speckled white vase of dried grasses and seed heads on a linen cloth",
          height: 1000,
          src: "/demo/vase/vary-1.jpg",
          width: 1000,
        },
        {
          alt: "A speckled cream vase of dried wheat and honesty on a linen runner by a window",
          height: 1000,
          src: "/demo/vase/vary-2.jpg",
          width: 1000,
        },
      ],
    },
    group: "make",
    id: "vary",
    notes:
      "--vary sends no image. It runs the last prompt and model again, so each take is a new picture.",
    title: "Make new takes of the last prompt",
  },
  SERIES_CAPABILITY,
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
      "Five seconds from the shelf photograph. The camera stays still and the shadows shift slightly.",
    command: `echo '${VIDEO_INPUT}' | motif --video-no-audio -o apothecary.mp4 --no-open --format json`,
    demo: {
      kind: "video",
      label: "Output, 5 seconds, no sound",
      poster: {
        alt: "A frame from the video: the amber bottles and white bowl on the shelf in raking light",
        height: 781,
        src: "/demo/video/poster.jpg",
        width: 1400,
      },
      source: APOTHECARY,
      src: "/demo/video/apothecary.mp4",
    },
    group: "make",
    id: "video",
    notes: "Video reads its prompt from JSON on standard input.",
    title: "Make a short video from an image",
  },

  // Edit
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
      "The room redrawn at 16:9, with a little more wall and floor around the bench.",
    command:
      "motif reframe --og source-interior.jpg -o reframe.png --no-open --format json",
    demo: {
      after: {
        alt: "The same room redrawn slightly wider, with more wall above the bench and more floor below",
        height: 736,
        src: "/demo/reframe/interior.jpg",
        width: 1312,
      },
      before: INTERIOR,
      kind: "pair",
    },
    group: "edit",
    id: "reframe",
    notes:
      "The source was already close to 16:9, so the change is small. bria-expand, under Tools, adds canvas by a set amount instead.",
    title: "Change an image's shape",
    tool: "ideogram-reframe",
  },
  {
    caption:
      "A 360px, heavily compressed copy of the vessel, enlarged to 720px.",
    command:
      "motif enhance --upscale derived-upscale.jpg -o enhanced.png --no-open --format json",
    demo: {
      after: {
        alt: "The vessel at 720px, its flutes and the plinth's veining defined",
        height: 720,
        src: "/demo/upscale/enhanced.jpg",
        width: 720,
      },
      before: SMALL_VESSEL,
      kind: "pair",
    },
    group: "edit",
    id: "upscale",
    notes:
      "The source was shrunk to 360px at JPEG quality 35 first, so there was detail to recover.",
    title: "Upscale a small image",
    tool: "topaz-precision",
  },
  {
    caption: "The same 360px copy enlarged to 720px with one flag.",
    command:
      "motif --up derived-upscale.jpg -o upscaled.png --no-open --format json",
    demo: {
      after: {
        alt: "The vessel at 720px, smoother, with softer flutes",
        height: 720,
        src: "/demo/upscale/up.jpg",
        width: 720,
      },
      before: SMALL_VESSEL,
      kind: "pair",
    },
    group: "edit",
    id: "up",
    notes:
      "--up runs a Clarity upscale. Without a file it upscales the last image.",
    title: "Upscale quickly",
  },
  {
    caption:
      "The fine grain on the walls and ceiling is smoothed, and the sign, faces and edges stay sharp.",
    command:
      "motif enhance --denoise source-noisy.jpg -o denoised.png --no-open --format json",
    demo: {
      after: {
        alt: "The same bar after denoising, the grain smoothed and the sign and faces still sharp",
        height: 781,
        src: "/demo/denoise/denoised.jpg",
        width: 1400,
      },
      before: {
        alt: "A grainy low-light photograph of a crowded bar under a neon sign reading THE OWL'S NEST",
        height: 781,
        src: "/demo/denoise/source.jpg",
        width: 1400,
      },
      detail: {
        after: {
          alt: "The same ceiling, lamp and sign after denoising, the grain smoothed and the lettering still sharp",
          height: 300,
          src: "/demo/denoise/denoised-crop.jpg",
          width: 400,
        },
        before: {
          alt: "A full-size detail of the grainy ceiling, a pendant lamp and the neon sign",
          height: 300,
          src: "/demo/denoise/source-crop.jpg",
          width: 400,
        },
      },
      kind: "pair",
    },
    group: "edit",
    id: "denoise",
    notes:
      "The grain is too fine to see in the whole frame, so the detail below shows the same 400x300 region of each file at full size.",
    title: "Remove noise from a photo",
    tool: "topaz-denoise",
  },
  {
    caption: "The vase cut out of the room it was made in.",
    command: `motif "${VASE_PROMPT}" -m banana2 -o vase.png --no-open --format json\nmotif --rmbg --no-open --format json`,
    demo: {
      after: {
        alt: "The same vase alone on a transparent background",
        height: 1000,
        src: "/demo/vase/nobg.png",
        width: 1000,
      },
      before: VASE,
      kind: "pair",
    },
    group: "edit",
    id: "remove-background",
    notes:
      "--rmbg works on the last image, here the vase made by the line before it.",
    title: "Remove the background",
    tool: "birefnet",
  },
  {
    caption:
      "Four layers: the wall and shelf, the small bottle, the two tall bottles and the bowl.",
    command:
      "motif layers source-apothecary.jpg -o layers/ --no-open --format json",
    demo: {
      kind: "set",
      outputs: [
        {
          alt: "The wall and shelf with the objects gone, their shadows still faintly on the wall",
          height: 480,
          src: "/demo/layers/qwen-1.jpg",
          width: 864,
        },
        {
          alt: "The small amber bottle on transparency",
          height: 480,
          src: "/demo/layers/qwen-2.png",
          width: 864,
        },
        {
          alt: "The two tall amber bottles on transparency",
          height: 480,
          src: "/demo/layers/qwen-3.png",
          width: 864,
        },
        {
          alt: "The white bowl on transparency",
          height: 480,
          src: "/demo/layers/qwen-4.png",
          width: 864,
        },
      ],
      source: APOTHECARY,
    },
    group: "edit",
    id: "layers",
    notes: "The layers come back at 864x480, smaller than the 1400x781 source.",
    title: "Split an image into layers",
    tool: "qwen-layered",
  },
  {
    caption: "The wordmark, rule and monogram traced to SVG paths.",
    command:
      "motif vectorize source-mark.jpg -o mark.svg --no-open --format json",
    demo: {
      after: {
        alt: "The SALVAGE wordmark, rule and monogram as a vector drawing",
        height: 1400,
        src: "/demo/vectorize/mark.svg",
        width: 1400,
      },
      before: MARK,
      kind: "pair",
    },
    group: "edit",
    id: "vectorize",
    title: "Trace an image to SVG",
    tool: "recraft-vectorize",
  },

  // Understand
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
    caption: "A plain question, answered in a sentence.",
    command: 'motif ask "What is on the shelf?" source-apothecary.jpg',
    demo: {
      kind: "text",
      output: "Three amber glass bottles and a white bowl are on the shelf.",
      source: APOTHECARY,
    },
    group: "understand",
    id: "ask",
    title: "Ask a question about an image",
  },
  {
    caption:
      "One box for each of the three bottles, as fractions of the image's width and height.",
    command:
      'motif ask --detect "bottle" source-apothecary.jpg --no-open --format json',
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
          x0: 0.46923828125,
          x1: 0.53857421875,
          y0: 0.6044921875,
          y1: 0.8720703125,
        },
      ],
      kind: "boxes",
      output: DETECT_OUTPUT,
      source: APOTHECARY,
    },
    group: "understand",
    id: "detect",
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

  ...TOOL_CAPABILITIES,

  // Everything else
  {
    caption: "The newest entry in history, as JSON.",
    command: "motif --last --format json",
    demo: {
      kind: "terminal",
      label: "Output",
      output: LAST_OUTPUT,
      wrap: true,
    },
    group: "more",
    id: "last",
    title: "See the last image",
  },
  {
    caption:
      "The five newest entries, one JSON line each, with only the fields asked for.",
    command:
      "motif --history --limit 5 --fields id,prompt,model,cost --format ndjson",
    demo: {
      kind: "terminal",
      label: "Output",
      output: HISTORY_OUTPUT,
      wrap: true,
    },
    group: "more",
    id: "history",
    title: "List recent images",
  },
  {
    caption: "The first screen of motif studio on a fresh install.",
    command: "motif studio",
    demo: { kind: "terminal", label: "Screen", output: STUDIO_SCREEN },
    group: "more",
    id: "studio",
    title: "Open the terminal Studio",
  },
];
