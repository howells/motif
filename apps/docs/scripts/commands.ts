/**
 * What the command pages say that the CLI itself does not: how the commands
 * are grouped, the one-line wording the Paper boards settled on, which
 * commands also run in the App, and one worked example per command with the
 * images that show it.
 *
 * Everything else on a command page (synopsis, options, Models, prices, the
 * dry run) is read from the CLI and the SDK by `generate-commands.ts`, so
 * nothing here can drift from what the tool does. This file holds only the
 * words and pictures that no schema carries.
 */

export interface Picture {
  readonly alt: string;
  readonly caption: string;
  /** A file under `public/images/commands`. */
  readonly file: string;
  /** Show every picture in the group at this ratio (`"1400 / 781"`), cropping
   * the rare pair that differs by a few pixels. Leave unset to show each
   * picture whole. */
  readonly ratio?: string;
}

export interface Example {
  /** What you type after `motif`, as the page shows it. */
  readonly args: string;
  /** Files the command names, mapped to the picture they stand in for, so the
   * dry run has real inputs to read. Keys are the names `args` uses. */
  readonly inputs?: Readonly<Record<string, string>>;
  /** One sentence under the Example heading. */
  readonly note: string;
  /** What the command prints, where that is the point of the example. */
  readonly output?: string;
  /** Show only these keys of the dry run, through `jq`, where the command has
   * no `--fields` and the whole plan would fill the page. */
  readonly pick?: readonly string[];
  readonly pictures?: readonly Picture[];
}

export interface CommandSpec {
  readonly example: Example;
  readonly id: string;
  /** Runs in the App as well as the terminal. */
  readonly inApp: boolean;
  /** The line on the All commands page, from the Paper board. */
  readonly summary: string;
  /** The lede, where the board words it differently from the index line. */
  readonly lede?: string;
}

export interface GroupSpec {
  readonly commands: readonly CommandSpec[];
  readonly folder: string;
  readonly name: string;
}

const before = (file: string, alt: string): Picture => ({
  alt,
  caption: "Before",
  file,
});

const after = (file: string, alt: string): Picture => ({
  alt,
  caption: "After",
  file,
});

export const GROUPS: readonly GroupSpec[] = [
  {
    commands: [
      {
        example: {
          args: 'motif "amber apothecary bottles and a stoneware bowl on a stone shelf"',
          note: "Three bottles and a bowl, made from the prompt.",
          pictures: [
            {
              alt: "Three amber glass bottles and a white bowl on a stone shelf in raking daylight",
              caption: "Result",
              file: "apothecary.jpg",
            },
          ],
        },
        id: "generate",
        inApp: true,
        summary: "Make an image from a prompt",
      },
      {
        example: {
          args: "motif vary vase.jpg -n 2",
          inputs: { "vase.jpg": "vase.jpg" },
          note: "Another take on the same vase.",
          pictures: [
            before("vase.jpg", "A stone vase on a linen cloth"),
            after("vase-vary.jpg", "The same vase with dried stems in it"),
          ],
        },
        id: "vary",
        inApp: true,
        summary: "Variations of an image",
      },
      {
        example: {
          args: 'motif series run "pottery on a plaster shelf" --count 4',
          note: "A themed set that keeps one style from the first image to the last.",
          pick: ["count", "estimatedCost"],
          pictures: [
            {
              alt: "The first image in a set of pottery on a plaster shelf",
              caption: "First",
              file: "series-1.jpg",
            },
            {
              alt: "The second image in the same set",
              caption: "Second",
              file: "series-2.jpg",
            },
          ],
        },
        id: "series",
        inApp: false,
        summary: "A consistent set from a theme",
      },
    ],
    folder: "make",
    name: "Make",
  },
  {
    commands: [
      {
        example: {
          args: "motif erase --text label.jpg",
          inputs: { "label.jpg": "label.jpg" },
          note: "Take the printed label off the card and keep the paper.",
          pictures: [
            {
              ...before(
                "label.jpg",
                "A paper card printed with the name Salvage and Co on a plaster ground"
              ),
              ratio: "1400 / 781",
            },
            after(
              "label-erased.jpg",
              "The same card, blank, with its shadow and edges unchanged"
            ),
          ],
        },
        id: "erase",
        inApp: true,
        lede: "Remove something and fill the gap.",
        summary: "Remove something, fill the gap",
      },
      {
        example: {
          args: "motif cutout vase.jpg",
          inputs: { "vase.jpg": "vase.jpg" },
          note: "The vase on transparency, at the edge it actually has.",
          pictures: [
            before("vase.jpg", "A stone vase on a linen cloth"),
            after("vase-cutout.png", "The vase alone on a transparent ground"),
          ],
        },
        id: "cutout",
        inApp: true,
        summary: "Remove the background",
      },
      {
        example: {
          args: "motif reframe room.jpg --square",
          inputs: { "room.jpg": "interior.jpg" },
          note: "Extend a wide room to a square, with the new edges drawn in.",
          pictures: [
            before("interior.jpg", "A bright room in a wide frame"),
            after(
              "interior-reframed.jpg",
              "The same room extended to a square"
            ),
          ],
        },
        id: "reframe",
        inApp: true,
        summary: "Extend to a new aspect ratio",
      },
      {
        example: {
          args: "motif upscale small.jpg --scale 4",
          inputs: { "small.jpg": "upscale-source.jpg" },
          note: "A small file at four times the size, with the detail kept.",
          pictures: [
            before(
              "upscale-source.jpg",
              "A small photograph of a ribbed vessel on a plinth"
            ),
            after(
              "upscale-result.jpg",
              "The same photograph enlarged four times"
            ),
          ],
        },
        id: "upscale",
        inApp: true,
        summary: "Make it larger",
      },
      {
        example: {
          args: "motif restore damaged.jpg",
          inputs: { "damaged.jpg": "damaged.jpg" },
          note: "A soft, blurred photograph brought back into focus.",
          pictures: [
            before(
              "damaged.jpg",
              "A blurred photograph of a green jug on a shelf"
            ),
            after("restored.jpg", "The same photograph, sharp again"),
          ],
        },
        id: "restore",
        inApp: false,
        summary: "Fix noise, blur, damage and colour",
      },
      {
        example: {
          args: 'motif relight kitchen.jpg "even overcast light"',
          inputs: { "kitchen.jpg": "kitchen.jpg" },
          note: "The same kitchen, lit evenly instead of by one hard window.",
          pictures: [
            before("kitchen.jpg", "A kitchen lit by hard window light"),
            after("relit.jpg", "The same kitchen in even overcast light"),
          ],
        },
        id: "relight",
        inApp: false,
        summary: "Relight to a described light or a Mood",
      },
      {
        example: {
          args: "motif restyle room.jpg --like reference.jpg",
          inputs: {
            "reference.jpg": "restyle-reference.jpg",
            "room.jpg": "interior.jpg",
          },
          note: "Redraw the room in the style of a second image.",
          pictures: [
            before("interior.jpg", "A bright room photographed"),
            {
              alt: "The style reference",
              caption: "Reference",
              file: "restyle-reference.jpg",
            },
            after(
              "restyle-result.jpg",
              "The room redrawn in the reference's style"
            ),
          ],
        },
        id: "restyle",
        inApp: false,
        summary: "Redraw in a reference's style",
      },
      {
        example: {
          args: "motif try-on person.jpg --garment jacket.jpg",
          inputs: {
            "jacket.jpg": "garment.jpg",
            "person.jpg": "person.jpg",
          },
          note: "Dress the person in the jacket.",
          pictures: [
            before(
              "person.jpg",
              "A person in a white t-shirt and linen trousers"
            ),
            {
              alt: "A rust-coloured chore jacket photographed flat",
              caption: "Garment",
              file: "garment.jpg",
            },
            after("dressed.jpg", "The person wearing the rust jacket"),
          ],
        },
        id: "try-on",
        inApp: false,
        summary: "Dress a person in a garment",
      },
    ],
    folder: "edit",
    name: "Edit",
  },
  {
    commands: [
      {
        example: {
          args: 'motif ask "how many vessels are on the shelf?" shelf.jpg',
          inputs: { "shelf.jpg": "apothecary.jpg" },
          note: "A question about the picture, answered from the picture.",
          output: "Three bottles, one bowl.",
          pictures: [
            {
              alt: "Three amber glass bottles and a white bowl on a stone shelf",
              caption: "The image",
              file: "apothecary.jpg",
            },
          ],
        },
        id: "ask",
        inApp: false,
        summary: "Caption, count, find or ask",
      },
      {
        example: {
          args: 'motif segment "the bowl" shelf.jpg',
          inputs: { "shelf.jpg": "apothecary.jpg" },
          note: "The bowl alone, on transparency, at the edge it actually has.",
          pictures: [
            before(
              "apothecary.jpg",
              "Three amber bottles and a white bowl on a shelf"
            ),
            after("bowl.png", "The white bowl cut out on its own"),
          ],
        },
        id: "segment",
        inApp: false,
        summary: "Mask or cut out a named thing",
      },
      {
        example: {
          args: "motif map room.jpg",
          inputs: { "room.jpg": "interior.jpg" },
          note: "A depth map of the room: near is light, far is dark.",
          pictures: [
            before("interior.jpg", "A bright room"),
            after("interior-depth.jpg", "A depth map of the same room"),
          ],
        },
        id: "map",
        inApp: false,
        summary: "Depth, edge, normal or pose map",
      },
    ],
    folder: "analyse",
    name: "Analyse",
  },
  {
    commands: [
      {
        example: {
          args: "motif material linen.jpg",
          inputs: { "linen.jpg": "linen.jpg" },
          note: "A flat photograph of linen becomes a set of PBR maps. This is the base colour.",
          pictures: [
            before("linen.jpg", "A flat photograph of woven linen"),
            after("linen-basecolor.jpg", "The base colour map of the linen"),
          ],
        },
        id: "material",
        inApp: false,
        summary: "PBR maps from a surface photo",
      },
      {
        example: {
          args: 'motif tile "a seamless limestone wall"',
          note: "A texture that repeats with no visible seam.",
          pictures: [
            {
              alt: "A limestone wall texture that tiles",
              caption: "Result",
              file: "tile.jpg",
            },
          ],
        },
        id: "tile",
        inApp: false,
        summary: "A seamlessly tiling texture",
      },
      {
        example: {
          args: "motif layers vessel.jpg",
          inputs: { "vessel.jpg": "vessel.jpg" },
          note: "A still life split into backdrop, plinth and pot, each on transparency. This is the pot.",
          pictures: [
            before(
              "vessel.jpg",
              "A ribbed vessel on a stone plinth against a warm wall"
            ),
            {
              alt: "The vessel alone on a transparent ground",
              caption: "One layer",
              file: "layer-pot.png",
            },
          ],
        },
        id: "layers",
        inApp: false,
        summary: "Split into transparent layers",
      },
      {
        example: {
          args: "motif vectorize mark.jpg",
          inputs: { "mark.jpg": "mark.jpg" },
          note: "A mark traced to clean paths.",
          pictures: [
            before(
              "mark.jpg",
              "A sprig inside a ring, printed in olive on paper"
            ),
            after("mark.svg", "The mark traced to a vector file"),
          ],
        },
        id: "vectorize",
        inApp: false,
        summary: "Trace to a clean SVG",
      },
      {
        example: {
          args: "motif mesh figure.jpg --rig",
          inputs: { "figure.jpg": "figure.jpg" },
          note: "A person as a textured 3D mesh with a skeleton.",
          pictures: [
            before("figure.jpg", "A person in linen standing in an empty room"),
            after("figure-rigged.png", "The rigged 3D mesh"),
          ],
        },
        id: "mesh",
        inApp: false,
        lede: "A textured 3D mesh, rigged if asked.",
        summary: "A textured 3D mesh, rigged if asked",
      },
      {
        example: {
          args: 'motif animate "the light moves across the shelf" shelf.jpg',
          inputs: { "shelf.jpg": "apothecary.jpg" },
          note: "Five seconds of drifting light, from the one still. This is a frame.",
          pictures: [
            before("apothecary.jpg", "The still image of the shelf"),
            after("apothecary-poster.jpg", "A frame from the video"),
          ],
        },
        id: "animate",
        inApp: false,
        summary: "Turn an image into a video",
      },
      {
        example: {
          args: "motif sheet looks/*.jpg --cols 3 -o sheet.png",
          note: "Nine images on one sheet, each captioned with its filename or its cost.",
          pictures: [
            {
              alt: "Nine images in a grid, each captioned",
              caption: "Result",
              file: "sheet.jpg",
            },
          ],
        },
        id: "sheet",
        inApp: true,
        summary: "A captioned contact sheet",
      },
    ],
    folder: "materials-and-files",
    name: "Materials and files",
  },
  {
    commands: [
      {
        example: {
          args: "motif studio",
          note: "Opens the interactive Studio in the terminal.",
        },
        id: "studio",
        inApp: false,
        summary: "The interactive terminal Studio",
      },
      {
        example: {
          args: "motif --describe erase --format json",
          note: "Read one command's schema before you call it.",
        },
        id: "describe",
        inApp: false,
        summary: "Print the CLI schema as JSON",
      },
      {
        example: {
          args: "motif --last",
          note: "Shows the path, prompt, Model and cost of the latest Generation.",
        },
        id: "last",
        inApp: true,
        summary: "Show the latest Generation",
      },
      {
        example: {
          args: "motif --history --limit 5",
          note: "Lists the last five Generations, with what each cost.",
        },
        id: "history",
        inApp: true,
        summary: "Past Generations and spend",
      },
    ],
    folder: "terminal",
    name: "Terminal",
  },
];
