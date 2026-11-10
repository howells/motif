/**
 * What the command pages say that the CLI itself does not: how the commands
 * are grouped, the plain headline each page leads with, the one-line wording
 * the Paper boards settled on, and one worked example per command with the images that show it.
 *
 * Everything else on a command page (synopsis, options, Models, prices, the
 * dry run) is read from `motif --describe` and the SDK by `generate-commands.ts`, so
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
  /** Why the page shows no generated dry run, in a sentence, for a command
   * whose dry run needs something the page cannot make. */
  readonly dryRunNote?: string;
  readonly example: Example;
  /** The page's title: the job in plain words, sentence case, no full stop.
   * Where the homepage has a headline for the Task these are its words; the
   * breadcrumb, sidebar and pagination keep the command id. */
  readonly headline: string;
  readonly id: string;
  /** The lede, where the board words it differently from the index line. */
  readonly lede?: string;
  /** For a command with subcommands: the one whose synopsis and options lead
   * the page. */
  readonly leads?: string;
  /** The line on the All commands page, from the Paper board. Leave it out
   * where the CLI's own description says the same. */
  readonly summary?: string;
  /** The CLI has no `--describe` entry for it: it is interactive, and no agent
   * calls it. The page shows the example as its synopsis. */
  readonly undescribed?: true;
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
          args: 'motif "amber bottles and a brass dish on a walnut shelf"',
          note: "Two bottles and a dish, made from the sentence.",
          pictures: [
            {
              alt: "Two amber glass bottles, one holding dried flowers, and a small brass dish on a walnut shelf, with low sun across a green wall",
              caption: "Result",
              file: "hero.jpg",
            },
          ],
        },
        headline: "A picture from a sentence",
        id: "generate",
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
        headline: "Variations",
        id: "vary",
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
        headline: "A matching set",
        id: "series",
        leads: "run",
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
        headline: "Remove an object",
        id: "erase",
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
        headline: "Remove the background",
        id: "cutout",
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
        headline: "Extend the frame",
        id: "reframe",
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
        headline: "Upscale up to four times",
        id: "upscale",
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
        headline: "Repair a damaged photo",
        id: "restore",
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
        headline: "Relight a photo",
        id: "relight",
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
        headline: "Match the style of another picture",
        id: "restyle",
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
        headline: "Put a garment on a person",
        id: "try-on",
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
        headline: "Ask about a picture",
        id: "ask",
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
        headline: "Select one object",
        id: "segment",
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
        headline: "Depth, pose and edge maps",
        id: "map",
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
        headline: "Materials for 3D",
        id: "material",
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
        headline: "Seamless textures",
        id: "tile",
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
        headline: "Split a picture into layers",
        id: "layers",
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
        headline: "Convert to SVG",
        id: "vectorize",
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
        headline: "A 3D model from a photo",
        id: "mesh",
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
        headline: "Film from a still",
        id: "animate",
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
        headline: "Make a contact sheet",
        id: "sheet",
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
        headline: "Work in the terminal Studio",
        id: "studio",
        summary: "The interactive terminal Studio",
        undescribed: true,
      },
      {
        example: {
          args: "motif --describe erase --format json",
          note: "Read one command's schema before you call it.",
        },
        headline: "Read the CLI's schema",
        id: "describe",
        summary: "Print the CLI schema as JSON",
      },
      {
        example: {
          args: "motif --last",
          note: "Shows the path, prompt, Model and cost of the latest Generation.",
        },
        headline: "See the latest Generation",
        id: "last",
        summary: "Show the latest Generation",
      },
      {
        example: {
          args: "motif --history --limit 5",
          note: "Lists the last five Generations, with what each cost.",
        },
        headline: "See past Generations and spend",
        id: "history",
        summary: "Past Generations and spend",
      },
      {
        dryRunNote:
          "`--dry-run` reports what the run would collect and where the files would go, without contacting fal. It needs the record of a run that is waiting, so there is no sample here.",
        example: {
          args: "motif resume 8f2a1c3e-91d4-4b6a-a7f0-52c19e7d3b04",
          note: "A queued run fal accepted but Motif could not finish prints its request id. This collects it and finishes it as the original command would, with nothing billed twice. With no id it lists the runs that can be collected.",
        },
        headline: "Collect a run that did not finish",
        id: "resume",
      },
    ],
    folder: "terminal",
    name: "Terminal",
  },
];
