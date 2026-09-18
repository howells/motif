import type { CatalogueGroup } from "@/lib/site/catalogue";
import {
  APOTHECARY,
  INTERIOR,
  LOOKS,
  SERIES,
  VASE,
  plate,
} from "@/lib/site/catalogue-plates";
import { TOOL } from "@/lib/site/catalogue-tool";

const MAKE: CatalogueGroup = {
  body: "These make a new picture. Nothing goes in but a sentence, a theme or a shape, and a file comes back.",
  count: "Seven commands",
  name: "Make",
  entries: [
    {
      frames: LOOKS,
      id: "generate",
      summary: "Make an image from a prompt.",
      treatment: "carousel",
      usage: 'motif "prompt"',
      verb: "generate",
    },
    {
      frames: [
        plate(
          "/demo/vase/vary-1.jpg",
          "The same vase with dried stems in it, one of the variations",
          1000,
          1000
        ),
        plate(
          "/demo/vase/vary-2.jpg",
          "The same vase, another variation",
          1000,
          1000
        ),
        plate(
          "/demo/vary/vary-1.png",
          "The same vase, a further variation",
          2048,
          2048
        ),
        plate(
          "/demo/vary/vary-2.png",
          "The same vase, a fourth variation",
          2048,
          2048
        ),
      ],
      id: "vary",
      source: VASE,
      summary: "Variations of an image.",
      treatment: "takes",
      usage: "motif vary [image]",
      verb: "vary",
    },
    {
      frames: SERIES,
      id: "series-run",
      summary: "A consistent set from a theme.",
      treatment: "set",
      usage: 'motif series run "theme"',
      verb: "series run",
    },
    {
      id: "sheet",
      result: plate(
        "/demo/sheet.jpg",
        "Five images laid out in a grid with their filenames printed under each one",
        1632,
        1192
      ),
      summary: "A captioned contact sheet.",
      treatment: "plate",
      usage: "motif sheet <images...>",
      verb: "sheet",
    },
    {
      duration: "0:05",
      id: "animate",
      result: plate(
        "/demo/video/poster.jpg",
        "A frame from the clip: the shelf of bottles as the light moves across it",
        1400,
        781
      ),
      summary: "Turn an image into a video.",
      treatment: "motion",
      usage: 'motif animate "prompt" [image]',
      verb: "animate",
      video: "/demo/video/apothecary.mp4",
    },
    {
      id: "tile",
      result: plate(
        "/demo/tile/wall.jpg",
        "A Cotswold dry stone wall with lichen, the tile that repeats",
        1024,
        1024,
        "the tile"
      ),
      summary: "A seamlessly tiling texture.",
      treatment: "repeat",
      usage: 'motif tile "prompt" [image]',
      verb: "tile",
    },
    {
      id: "mesh",
      plain: true,
      result: plate(
        "/demo/mesh/rigged.png",
        "The same person as a textured 3D mesh, rigged and standing on transparency",
        512,
        512,
        "the mesh, rigged"
      ),
      source: plate(
        "/demo/sources/figure.jpg",
        "A person in a cream shirt and trousers in a plaster-walled room",
        939,
        1400,
        "the photograph"
      ),
      summary: "A textured 3D mesh, rigged with --rig.",
      treatment: "pair",
      usage: "motif mesh [image] [--rig]",
      verb: "mesh",
    },
  ],
};

const EDIT: CatalogueGroup = {
  body: "These take a picture and give back a changed one. The source is never overwritten, so every row here is a pair.",
  count: "Ten commands",
  name: "Edit",
  entries: [
    {
      id: "erase",
      result: plate(
        "/demo/text-removal/label.jpg",
        "The same label with the printing gone and the paper texture carried through",
        1400,
        756,
        "erased"
      ),
      source: plate(
        "/demo/sources/label.jpg",
        "A torn paper label on a plaster wall reading Salvage and Co, botanical extract number four",
        1400,
        781,
        "the source"
      ),
      summary: "Remove something, fill the gap.",
      treatment: "held",
      usage: 'motif erase "what" [image]',
      verb: "erase",
    },
    {
      id: "cutout",
      plain: true,
      result: plate(
        "/demo/vase/nobg.png",
        "The vase alone, the linen and the window gone",
        1000,
        1000
      ),
      source: VASE,
      summary: "Remove the background.",
      treatment: "pair",
      usage: "motif cutout [image-or-video]",
      verb: "cutout",
    },
    {
      id: "reframe",
      result: plate(
        "/demo/expand/bria-expand.jpg",
        "The same bench and vases with new canvas above and below, now square",
        1400,
        1400,
        "1400 × 1400, extended"
      ),
      source: plate(
        "/demo/sources/interior.jpg",
        "A wooden bench with a folded throw and two vases against a sunlit wall",
        1400,
        781,
        "1400 × 781, the source"
      ),
      summary: "Extend to a new aspect ratio.",
      treatment: "pair",
      usage: "motif reframe [image] --og",
      verb: "reframe",
    },
    {
      id: "upscale",
      result: plate(
        "/demo/upscale/4x.jpg",
        "The same vessel at four times the size, the fluting and the glaze now resolved",
        1440,
        1440,
        "1440 × 1440"
      ),
      source: plate(
        "/demo/upscale/source.jpg",
        "A small, soft 360 pixel photograph of a fluted cream vessel on a plinth",
        360,
        360,
        "360 × 360"
      ),
      summary: "Make it larger.",
      treatment: "matched",
      usage: "motif upscale [image-or-video]",
      verb: "upscale",
    },
    {
      id: "restore",
      result: plate(
        "/demo/restore/sharpened.png",
        "The same portrait with detail recovered: wrinkles, beard and knit crisp, compression gone, tone untouched",
        2048,
        2048,
        "restored"
      ),
      source: plate(
        "/demo/restore/damaged.jpg",
        "A portrait softened, blocked and dulled: blur, JPEG artefacts and flat tone",
        2048,
        2048,
        "damaged"
      ),
      summary: "Fix noise, blur, damage, colour.",
      treatment: "matched",
      usage: "motif restore [image]",
      verb: "restore",
    },
    {
      id: "relight",
      result: plate(
        "/demo/relight/even.png",
        "The same kitchen with the daylight evened out: hotspots tamed, shadows lifted, nothing moved",
        1024,
        1024,
        "motif relight kitchen.jpg --even"
      ),
      source: plate(
        "/demo/relight/kitchen.jpg",
        "A country kitchen in flat neutral daylight, the source for the relight",
        2048,
        2048,
        "the source kitchen"
      ),
      summary: "Relight to a described light or a mood.",
      treatment: "matched",
      usage: 'motif relight [image] "light"',
      verb: "relight",
    },
    {
      id: "restyle",
      result: plate(
        "/demo/restyle/interior.jpg",
        "The same room redrawn as a pencil and wash drawing",
        1400,
        781
      ),
      source: INTERIOR,
      summary: "Redraw in a reference's style.",
      treatment: "pair",
      usage: "motif restyle [image] --like <image>",
      verb: "restyle",
    },
    {
      id: "try-on",
      frames: [
        plate(
          "/demo/try-on/person.jpg",
          "A woman in a white t-shirt and linen trousers in a plain studio room, the try-on subject",
          2048,
          2048,
          "the person"
        ),
        plate(
          "/demo/try-on/garment.jpg",
          "A rust-coloured chore jacket photographed flat",
          1000,
          1000,
          "--garment garment.jpg"
        ),
        plate(
          "/demo/try-on/dressed.png",
          "The same woman in the same room, now wearing the rust chore jacket",
          2048,
          2048,
          "wearing it"
        ),
      ],
      summary: "Dress a person in a garment.",
      treatment: "trio",
      usage: "motif try-on [image] --garment <image>",
      verb: "try-on",
    },
    {
      frames: [
        plate(
          "/demo/layers/backdrop.png",
          "The backdrop plane: the plaster wall out of focus, nothing else",
          640,
          640
        ),
        plate(
          "/demo/layers/plinth.png",
          "The plinth plane: the stone surface and the pot's shadow, the pot lifted away",
          640,
          640
        ),
        plate(
          "/demo/layers/pot.png",
          "The pot plane: the ribbed vessel alone on transparency",
          640,
          640
        ),
      ],
      id: "layers",
      source: plate(
        "/demo/sources/vessel.jpg",
        "A ribbed stoneware pot on a white plinth against a plaster wall",
        1400,
        1400,
        "the flattened picture"
      ),
      summary: "Split into transparent layers.",
      treatment: "stack",
      usage: "motif layers [image]",
      verb: "layers",
    },
    {
      id: "vectorize",
      result: plate(
        "/demo/vectorize/mark.svg",
        "The generated emblem traced to a clean SVG, every line drawn rather than sampled",
        1024,
        1024
      ),
      source: plate(
        "/demo/sources/mark.jpg",
        "A generated apothecary emblem in olive ink on warm paper",
        1024,
        1024
      ),
      summary: "Trace to a clean SVG.",
      treatment: "matched",
      usage: "motif vectorize [image]",
      verb: "vectorize",
    },
  ],
};

const UNDERSTAND: CatalogueGroup = {
  body: "These read a picture and give back what they found. A mask, a map, a set of maps, or an answer in words.",
  count: "Four commands",
  name: "Understand",
  entries: [
    {
      id: "segment",
      plain: true,
      result: plate(
        "/demo/segment/bowl.png",
        "The white bowl on its own, masked out of the shelf at the edge it actually has",
        1400,
        781,
        '"the white bowl"'
      ),
      source: APOTHECARY,
      summary: "Mask or cut out a named thing.",
      treatment: "lifted",
      usage: 'motif segment "what" [image-or-video]',
      verb: "segment",
    },
    {
      answer: "Three bottles, one bowl.",
      id: "ask",
      question: "how many vessels are on the shelf?",
      source: APOTHECARY,
      summary: "Caption, count, find or ask.",
      treatment: "ask",
      usage: 'motif ask "question" [image]',
      verb: "ask",
    },
    {
      frames: [
        plate(
          "/demo/sources/interior.jpg",
          "A wooden bench with a folded throw and two vases against a sunlit wall",
          1400,
          781,
          "the photograph"
        ),
        plate(
          "/demo/depth/interior.jpg",
          "A depth map of the same room: the bench pale, the wall behind it black",
          1400,
          781,
          "depth"
        ),
        plate(
          "/demo/lineart/vessel.jpg",
          "A line drawing of a vessel, a different subject from the room",
          1400,
          1400,
          "line — vessel"
        ),
        plate(
          "/demo/pose/figure.jpg",
          "A pose map of a standing figure, a different subject from the room",
          933,
          1400,
          "pose — figure"
        ),
      ],
      id: "map",
      summary: "Depth, edge, normal or pose map.",
      treatment: "carousel",
      usage: "motif map [image]",
      verb: "map",
    },
    {
      frames: [
        plate(
          "/demo/sources/linen.jpg",
          "A photograph of folded cream cotton, lit from the side",
          1400,
          1400,
          "the photograph"
        ),
        plate(
          "/demo/materials/basecolor.jpg",
          "The base colour map of the same cloth",
          1400,
          1400,
          "base colour"
        ),
        plate(
          "/demo/materials/normal.jpg",
          "The normal map of the same cloth, its weave and folds read as surface direction",
          1400,
          1400,
          "normal"
        ),
        plate(
          "/demo/materials/roughness.jpg",
          "The roughness map of the same cloth",
          1400,
          1400,
          "roughness"
        ),
      ],
      id: "material",
      summary: "PBR maps from a surface photo.",
      treatment: "carousel",
      usage: "motif material [image]",
      verb: "material",
    },
  ],
};

export const CATALOGUE: readonly CatalogueGroup[] = [
  MAKE,
  EDIT,
  UNDERSTAND,
  TOOL,
];
