/** The catalogue: every command Motif has, with the plate that shows what it
 * returns.
 *
 * Its own module rather than part of `content.ts`, because it is half the
 * page's words on its own. The wording is the CLI's: `summary` and `notFor`
 * are what `motif --describe tasks` prints, sentence-cased, and `usage` is
 * the signature verbatim. A page documenting a tool should not be able to
 * describe it differently from the tool itself. */

interface Plate {
  readonly alt: string;
  readonly height: number;
  readonly src: string;
  readonly width: number;
}

export const CATALOGUE_HEAD = {
  body: "One verb per job. Motif chooses the model and prices the run before it spends anything. Where a plate holds two pictures, the first is what went in.",
  title: "Every command",
} as const;

/** One command, one plate.
 *
 * Every command the CLI has, including the seven whose result is text rather
 * than a picture. The wording is the CLI's own: `summary` and `notFor` are
 * what `motif --describe tasks` prints, sentence-cased, and `usage` is the
 * signature verbatim. A page that documents a tool should not be able to
 * describe it differently from the tool itself.
 *
 * Plates are shown whole rather than cropped to the box, because a catalogue
 * entry is a reproduction of the result and a crop is a different picture. */
export interface CatalogueEntry {
  /** What the command returned. */
  readonly after?: Plate;
  /** What went in, set beside the result in the same mount. */
  readonly before?: Plate;
  readonly id: string;
  /** What this command is not for, and the one to reach for instead. */
  readonly notFor: string;
  /** Draw the plate as the file repeating, which is the only way a seamless
   * tile can prove itself. */
  readonly repeat?: boolean;
  /** For a command whose result is text: the words it hands back, set as
   * type. Nothing here is invented — each line is a real subcommand, field or
   * error code. */
  readonly specimen?: readonly string[];
  readonly summary: string;
  /** The signature, as `motif --describe` gives it. */
  readonly usage: string;
  readonly verb: string;
  /** The one result that moves. */
  readonly video?: string;
}

export interface CatalogueGroup {
  readonly body: string;
  readonly entries: readonly CatalogueEntry[];
  readonly name: string;
}

export const CATALOGUE: readonly CatalogueGroup[] = [
  {
    body: "These make a new picture.",
    name: "Make",
    entries: [
      {
        after: {
          alt: "Three ceramic vessels, one dark and two cream, on a plaster ledge in raking light",
          height: 1024,
          src: "/demo/looks/still-life.jpg",
          width: 1024,
        },
        id: "generate",
        notFor:
          "Variations of an image you already have (vary), or a consistent set of images (series run).",
        summary: "Make an image from a prompt.",
        usage: 'motif "prompt"',
        verb: "generate",
      },
      {
        after: {
          alt: "The same vase with dried stems in it, one of the variations",
          height: 1000,
          src: "/demo/vase/vary-1.jpg",
          width: 1000,
        },
        before: {
          alt: "A cream ceramic vase on a linen cloth by a window",
          height: 1000,
          src: "/demo/vase/vase.jpg",
          width: 1000,
        },
        id: "vary",
        notFor:
          "A specific change to an image described in words (generate with a reference), or a set of different scenes in one style (series run).",
        summary: "Variations of an image.",
        usage: "motif vary [image]",
        verb: "vary",
      },
      {
        after: {
          alt: "A captioned sheet of six pottery workshop interiors, all in one register",
          height: 1192,
          src: "/demo/series/sheet.jpg",
          width: 1632,
        },
        id: "series-run",
        notFor:
          "One image (generate), several takes of the same prompt (generate with -n), or variations of an image (vary).",
        summary: "A consistent set from a theme.",
        usage: 'motif series run "theme"',
        verb: "series run",
      },
      {
        after: {
          alt: "Five images laid out in a grid with their filenames printed under each one",
          height: 1192,
          src: "/demo/sheet.jpg",
          width: 1632,
        },
        id: "sheet",
        notFor:
          "Making the images (generate or series run), or combining images into one new picture (generate with several -e).",
        summary: "A captioned contact sheet.",
        usage: "motif sheet <images...>",
        verb: "sheet",
      },
      {
        after: {
          alt: "A frame from the clip: the shelf of bottles as the light moves across it",
          height: 781,
          src: "/demo/video/poster.jpg",
          width: 1400,
        },
        id: "animate",
        notFor: "A still image (generate), or variations of one (vary).",
        summary: "Turn an image into a video.",
        usage: 'motif animate "prompt" [image]',
        verb: "animate",
        video: "/demo/video/apothecary.mp4",
      },
      {
        after: {
          alt: "A Cotswold dry stone wall with lichen, the same file repeating without a visible join",
          height: 1024,
          src: "/demo/tile/wall.jpg",
          width: 1024,
        },
        id: "tile",
        notFor: "PBR maps of a surface (material).",
        repeat: true,
        summary: "A seamlessly tiling texture.",
        usage: 'motif tile "prompt" [image]',
        verb: "tile",
      },
      {
        after: {
          alt: "The same person as a textured 3D mesh, rigged and standing on transparency",
          height: 512,
          src: "/demo/mesh/rigged.png",
          width: 512,
        },
        before: {
          alt: "A person in a cream shirt and trousers in a plaster-walled room",
          height: 1400,
          src: "/demo/sources/figure.jpg",
          width: 939,
        },
        id: "mesh",
        notFor:
          "A flat image of an object (generate), or depth of a scene (map).",
        summary: "A textured 3D mesh, rigged with --rig.",
        usage: "motif mesh [image] [--rig]",
        verb: "mesh",
      },
    ],
  },
  {
    body: "These take a picture and give back a changed one.",
    name: "Edit",
    entries: [
      {
        after: {
          alt: "The same label with the printing gone and the paper texture carried through",
          height: 756,
          src: "/demo/text-removal/label.jpg",
          width: 1400,
        },
        before: {
          alt: "A torn paper label on a plaster wall reading Salvage and Co, botanical extract number four",
          height: 781,
          src: "/demo/sources/label.jpg",
          width: 1400,
        },
        id: "erase",
        notFor:
          "The whole background (cutout), or extending the canvas (reframe).",
        summary: "Remove something, fill the gap.",
        usage: 'motif erase "what" [image]',
        verb: "erase",
      },
      {
        after: {
          alt: "The vase alone, the linen and the window gone",
          height: 1000,
          src: "/demo/vase/nobg.png",
          width: 1000,
        },
        before: {
          alt: "A cream ceramic vase on a linen cloth by a window",
          height: 1000,
          src: "/demo/vase/vase.jpg",
          width: 1000,
        },
        id: "cutout",
        notFor:
          "Cutting one named thing out of a scene, such as the chair in a room (segment), or taking an object out and filling the gap (erase).",
        summary: "Remove the background.",
        usage: "motif cutout [image-or-video]",
        verb: "cutout",
      },
      {
        after: {
          alt: "The same room with more of the wall, the floor and the window drawn in around it",
          height: 736,
          src: "/demo/reframe/interior.jpg",
          width: 1312,
        },
        before: {
          alt: "A wooden bench with a folded throw and two vases against a sunlit wall",
          height: 781,
          src: "/demo/sources/interior.jpg",
          width: 1400,
        },
        id: "reframe",
        notFor: "A new image at a given ratio (generate with a ratio).",
        summary: "Extend to a new aspect ratio.",
        usage: "motif reframe [image] --og",
        verb: "reframe",
      },
      {
        after: {
          alt: "The same vessel at four times the size, the fluting and the glaze now resolved",
          height: 1440,
          src: "/demo/upscale/4x.jpg",
          width: 1440,
        },
        before: {
          alt: "A small, soft 360 pixel photograph of a fluted cream vessel on a plinth",
          height: 360,
          src: "/demo/upscale/source.jpg",
          width: 360,
        },
        id: "upscale",
        notFor:
          "Fixing noise, softness or colour without changing the size (restore).",
        summary: "Make it larger.",
        usage: "motif upscale [image-or-video]",
        verb: "upscale",
      },
      {
        after: {
          alt: "The same sign with the grain cleared and the neon and lettering clean",
          height: 300,
          src: "/demo/denoise/denoised-crop.jpg",
          width: 400,
        },
        before: {
          alt: "A grainy night photograph of a neon bar sign reading The Owl's Nest",
          height: 300,
          src: "/demo/denoise/source-crop.jpg",
          width: 400,
        },
        id: "restore",
        notFor: "Making an image larger (upscale).",
        summary: "Fix noise, blur, damage, colour.",
        usage: "motif restore [image]",
        verb: "restore",
      },
      {
        after: {
          alt: "The same bench and vases at dawn, the light now coming low through glazing",
          height: 772,
          src: "/demo/relight/dawn.jpg",
          width: 1400,
        },
        before: {
          alt: "A wooden bench with a folded throw and two vases against a sunlit wall",
          height: 781,
          src: "/demo/sources/interior.jpg",
          width: 1400,
        },
        id: "relight",
        notFor: "Regenerating the scene in a new light (generate with a mood).",
        summary: "Relight to a described light or a mood.",
        usage: 'motif relight [image] "light"',
        verb: "relight",
      },
      {
        after: {
          alt: "The same room redrawn as a pencil and wash drawing",
          height: 781,
          src: "/demo/restyle/interior.jpg",
          width: 1400,
        },
        before: {
          alt: "A wooden bench with a folded throw and two vases against a sunlit wall",
          height: 781,
          src: "/demo/sources/interior.jpg",
          width: 1400,
        },
        id: "restyle",
        notFor: "A house style kept across images (generate with a look).",
        summary: "Redraw in a reference's style.",
        usage: "motif restyle [image] --like <image>",
        verb: "restyle",
      },
      {
        after: {
          alt: "The same person in the same room, now wearing the rust chore jacket",
          height: 1400,
          src: "/demo/try-on/figure.jpg",
          width: 939,
        },
        before: {
          alt: "A rust-coloured chore jacket photographed flat",
          height: 1000,
          src: "/demo/try-on/garment.jpg",
          width: 1000,
        },
        id: "try-on",
        notFor: "Changing clothes by description (generate with a reference).",
        summary: "Dress a person in a garment.",
        usage: "motif try-on [image] --garment <image>",
        verb: "try-on",
      },
      {
        after: {
          alt: "The two bottles alone on transparency, lifted off the shelf they stood on",
          height: 480,
          src: "/demo/layers/qwen-3.png",
          width: 864,
        },
        before: {
          alt: "Two amber bottles and a white bowl on a stone shelf",
          height: 781,
          src: "/demo/erase/object-removal.jpg",
          width: 1400,
        },
        id: "layers",
        notFor:
          "Masking one named thing (segment), or removing the background (cutout).",
        summary: "Split into transparent layers.",
        usage: "motif layers [image]",
        verb: "layers",
      },
      {
        after: {
          alt: "The same mark as an SVG, its curves now drawn rather than sampled",
          height: 1400,
          src: "/demo/vectorize/mark.svg",
          width: 1400,
        },
        before: {
          alt: "The Salvage wordmark with a rule under it and a roundel below",
          height: 1400,
          src: "/demo/sources/mark.jpg",
          width: 1400,
        },
        id: "vectorize",
        notFor: "Drawing a new image from a prompt (generate).",
        summary: "Trace to a clean SVG.",
        usage: "motif vectorize [image]",
        verb: "vectorize",
      },
    ],
  },
  {
    body: "These read a picture and give back what they found.",
    name: "Understand",
    entries: [
      {
        after: {
          alt: "The white bowl on its own, masked out of the shelf at the edge it actually has",
          height: 781,
          src: "/demo/segment/bowl.png",
          width: 1400,
        },
        before: {
          alt: "Three amber bottles and a white bowl on a stone shelf",
          height: 781,
          src: "/demo/sources/apothecary.jpg",
          width: 1400,
        },
        id: "segment",
        notFor:
          "The background behind the subject (cutout), or boxes without masks (ask detect).",
        summary: "Mask or cut out a named thing.",
        usage: 'motif segment "what" [image-or-video]',
        verb: "segment",
      },
      {
        id: "ask",
        notFor: "Pixel masks of a named thing (segment).",
        /* Broken across two lines rather than set as one: the specimen holds
           its spacing, so a line longer than the mount is clipped rather than
           wrapped, and on a phone the cell is about 38 characters wide. */
        specimen: [
          'motif ask "how many vessels',
          '  are on the shelf?" shelf.jpg',
          "",
          "Three bottles, one bowl.",
        ],
        summary: "Caption, count, find or ask.",
        usage: 'motif ask "question" [image]',
        verb: "ask",
      },
      {
        after: {
          alt: "A depth map of the same room: the bench pale, the wall behind it black",
          height: 781,
          src: "/demo/depth/interior.jpg",
          width: 1400,
        },
        before: {
          alt: "A wooden bench with a folded throw and two vases against a sunlit wall",
          height: 781,
          src: "/demo/sources/interior.jpg",
          width: 1400,
        },
        id: "map",
        notFor:
          "Masks of a named thing (segment), or PBR material maps (material).",
        summary: "Depth, edge, normal or pose map.",
        usage: "motif map [image]",
        verb: "map",
      },
      {
        after: {
          alt: "The normal map of the same cloth, its weave and folds read as surface direction",
          height: 1400,
          src: "/demo/materials/normal.jpg",
          width: 1400,
        },
        before: {
          alt: "A photograph of folded cream cotton, lit from the side",
          height: 1400,
          src: "/demo/sources/linen.jpg",
          width: 1400,
        },
        id: "material",
        notFor:
          "A seamless texture without PBR maps (tile), or depth and normals of a scene (map).",
        summary: "PBR maps from a surface photo.",
        usage: "motif material [image]",
        verb: "material",
      },
    ],
  },
  {
    body: "These manage your work rather than an image.",
    name: "The tool itself",
    entries: [
      {
        id: "series",
        notFor:
          "A one-off themed set (series run creates or reuses a series for you), or a house register for one image (generate with --look).",
        specimen: [
          "motif series <subcommand>",
          "",
          "create      list      show",
          "gen         run       history",
          "ref-add     ref-remove",
          "delete",
        ],
        summary: "A reusable style and references.",
        usage: "motif series <subcommand>",
        verb: "series",
      },
      {
        id: "studio",
        notFor:
          "Agents and scripts, which call the commands directly with --format json.",
        specimen: [
          "motif studio",
          "",
          "Generate     Edit",
          "Gallery      Settings",
        ],
        summary: "The interactive terminal Studio.",
        usage: "motif studio",
        verb: "studio",
      },
      {
        id: "last",
        notFor: "Older generations (history).",
        specimen: ["motif --last", "", '{"command":"last","result":null}'],
        summary: "Show the last generation.",
        usage: "motif --last",
        verb: "--last",
      },
      {
        id: "history",
        notFor:
          "Only the most recent generation (last), or one series' images (motif series history <slug>).",
        specimen: [
          "motif --history --limit 10",
          "  --fields id,prompt,model,cost",
        ],
        summary: "List past generations and spend.",
        usage: "motif --history",
        verb: "--history",
      },
      {
        id: "describe",
        notFor: "The task routing alone (motif --describe tasks).",
        specimen: [
          "motif --describe --format json",
          "",
          "tasks    commands    enums",
          "errors   global_flags",
          "input_modes    security_posture",
        ],
        summary: "Print the CLI schema as JSON.",
        usage: "motif --describe [command]",
        verb: "--describe",
      },
      {
        id: "errors",
        notFor:
          "The error from a failed call, which already carries its code, details and suggestions on stderr.",
        /* Three of the twenty-two, and the count. Six lines is what a
           specimen holds inside the mount at the width where two of them
           first share a row. */
        specimen: [
          "motif --describe errors",
          "",
          "MISSING_API_KEY",
          "INVALID_OUTPUT_PATH",
          "NO_MODEL_AVAILABLE",
          "… 22 in all",
        ],
        summary: "List error codes and how to recover.",
        usage: "motif --describe errors",
        verb: "--describe errors",
      },
    ],
  },
];
