import { TASKS } from "@howells/motif-sdk";

import { CATALOGUE } from "@/lib/site/catalogue";

/** The content of the public page, drawn from the Paper file "Motif".
 *
 * Copy lives here rather than in the components so the page reads as one
 * document and the wording can be reviewed without opening JSX. Numbers do
 * not live here at all: the model counts come from the SDK's own Task table
 * (see `matrixRows`), so the page cannot drift from what the CLI will
 * actually run. */

interface Plate {
  readonly alt: string;
  readonly height: number;
  readonly src: string;
  readonly width: number;
}

export interface HeroStep {
  /** The line the `ask` step answers, set on the plate rather than beside it. */
  readonly answer?: string;
  readonly caption: string;
  readonly command: string;
  readonly id: string;
  readonly label: string;
  readonly plate: Plate;
  /** The phone board labels the same step in one or two words, so six fit a
   * 390 screen without a scroller. */
  readonly short: string;
  /** Present on the one step whose result is a clip; the plate is its poster. */
  readonly video?: string;
}

export const SITE = {
  description:
    "One command line over every image model. Name the job; Motif picks the model, prices the run before it spends and hands back the file.",
  install: "npm install -g @howells/motif-cli",
  name: "Motif",
  standfirst:
    "One command line over every image model. You name the job; Motif picks the model, prices the run before it spends and hands back the file. It runs on fal today, and the same commands will carry other providers.",
} as const;

export const MASTHEAD_LINKS = [
  { href: "https://www.npmjs.com/package/@howells/motif-cli", label: "npm" },
  { href: "https://github.com/howells/motif", label: "GitHub" },
  { href: "https://www.npmjs.com/package/@howells/motif-sdk", label: "SDK" },
] as const;

export const FOOTER_LINKS = [
  { href: "https://www.npmjs.com/package/@howells/motif-cli", label: "npm" },
  { href: "https://github.com/howells/motif", label: "GitHub" },
  {
    href: "https://www.npmjs.com/package/@howells/motif-sdk",
    label: "@howells/motif-sdk",
  },
  { href: "https://github.com/howells/motif#studio", label: "motif studio" },
] as const;

/** One shelf, six commands. Every plate is the same scene so the change each
 * command makes is the only thing that moves. Typed as a non-empty tuple so
 * the hero can index it without a guard on every read. */
export const HERO_STEPS: readonly [HeroStep, ...HeroStep[]] = [
  {
    caption: "Three bottles and a bowl, made from the prompt.",
    command:
      'motif "amber apothecary bottles and a stoneware bowl on a stone shelf"',
    id: "make",
    label: "Make a still life",
    short: "Make",
    plate: {
      alt: "Three amber glass bottles and a white bowl on a stone shelf in raking daylight",
      height: 781,
      src: "/demo/sources/apothecary.jpg",
      width: 1400,
    },
  },
  {
    caption: "The small bottle and the shadow it cast are both gone.",
    command: 'motif erase "the small amber bottle" shelf.jpg',
    id: "erase",
    label: "Remove the small bottle",
    short: "Erase",
    plate: {
      alt: "The same shelf with the smallest bottle removed and its shadow filled in",
      height: 781,
      src: "/demo/erase/finegrain-eraser.jpg",
      width: 1400,
    },
  },
  {
    caption: "The same shelf, the same shadows, the glass now cobalt.",
    command:
      'motif "the same shelf at dusk, the bottles in cobalt blue glass" -e shelf.jpg',
    id: "dusk",
    label: "Redraw it at dusk",
    short: "Dusk",
    plate: {
      alt: "The same shelf at dusk with the bottles rendered in cobalt blue glass",
      height: 1536,
      src: "/demo/edit/dusk-wide.jpg",
      width: 2752,
    },
  },
  {
    caption: "The bowl alone, on transparency, at the edge it actually has.",
    command: 'motif segment "the bowl" shelf.jpg',
    id: "cutout",
    label: "Cut out the bowl",
    short: "Cut out",
    plate: {
      alt: "The white bowl masked out of the scene and shown on its own",
      height: 781,
      src: "/demo/segment/bowl.png",
      width: 1400,
    },
  },
  {
    caption: "Five seconds of drifting light, from the one still.",
    command: 'motif animate "the light moves across the shelf" shelf.jpg',
    id: "video",
    label: "Turn it into a video",
    short: "Video",
    plate: {
      alt: "A still frame from the generated video of the shelf",
      height: 781,
      src: "/demo/video/poster.jpg",
      width: 1400,
    },
    video: "/demo/video/apothecary.mp4",
  },
  {
    answer: "Three bottles, one bowl.",
    caption: "A question about the picture, answered from the picture.",
    command: 'motif ask "how many vessels are on the shelf?" shelf.jpg',
    id: "ask",
    label: "Ask what is on it",
    short: "Ask",
    plate: {
      alt: "The shelf of bottles and a bowl, with the model's answer set over it",
      height: 781,
      src: "/demo/sources/apothecary.jpg",
      width: 1400,
    },
  },
];

export const LOOKS = [
  {
    body: "Daylight, restrained palette, space around the subject.",
    flag: "--look editorial",
    name: "Quiet editorial",
    plate: {
      alt: "Pigment jars and folded cloth on a scrubbed wooden table in daylight",
      height: 1800,
      src: "/demo/looks/editorial.jpg",
      width: 1800,
    },
    ratio: "840 / 560",
    width: 840,
  },
  {
    body: "Pencil under flat washes, the drawing still showing through.",
    flag: "--look drawing",
    name: "Palette drawing",
    plate: {
      alt: "A watercolour and pencil drawing of a dark green kitchen",
      height: 1024,
      src: "/demo/looks/drawing.jpg",
      width: 1024,
    },
    ratio: "420 / 560",
    width: 420,
  },
  {
    body: "Printed paper that has been handled: foxing, wear, a used press.",
    flag: "--look ephemera",
    name: "Period ephemera",
    plate: {
      alt: "An aged printed poster with foxing and worn edges",
      height: 1024,
      src: "/demo/looks/ephemera.jpg",
      width: 768,
    },
    ratio: "400 / 560",
    width: 400,
  },
] as const;

/** One kitchen, one prompt, one seed. Only `--mood` changes between plates. */
export const MOODS = [
  {
    id: "dawn",
    name: "Dawn",
    plate: {
      alt: "A rustic kitchen at dawn, cool light through the window",
      height: 768,
      src: "/demo/moods/dawn.jpg",
      width: 1024,
    },
  },
  {
    id: "overcast",
    name: "Overcast",
    plate: {
      alt: "The same kitchen under flat overcast light",
      height: 768,
      src: "/demo/moods/overcast.jpg",
      width: 1024,
    },
  },
  {
    id: "raking",
    name: "Raking",
    plate: {
      alt: "The same kitchen with low raking sun across the table",
      height: 768,
      src: "/demo/moods/raking.jpg",
      width: 1024,
    },
  },
  {
    id: "window",
    name: "Window",
    plate: {
      alt: "The same kitchen lit only from the window",
      height: 768,
      src: "/demo/moods/window.jpg",
      width: 1024,
    },
  },
  {
    id: "lamplit",
    name: "Lamplit",
    plate: {
      alt: "The same kitchen by lamplight and candles, the stove lit",
      height: 768,
      src: "/demo/moods/lamplit.jpg",
      width: 1024,
    },
  },
  {
    id: "nocturne",
    name: "Nocturne",
    plate: {
      alt: "The same kitchen at night, almost dark",
      height: 768,
      src: "/demo/moods/nocturne.jpg",
      width: 1024,
    },
  },
] as const;

export const MOOD_COMMAND =
  'motif "a family kitchen with a scrubbed oak table" --look lived-in --mood {mood} --seed 4217';

/** The try-on comparison. The result is what you see; the source is underneath
 * it, and holding the source thumbnail brings it up full size. */
export const COMPARE = {
  body: "The big image is the result. The small one sitting on it is what went in. Press and hold the source to see it full size; let go and the result comes back.",
  /** The two labels the board sets under the thumbnails, and the line that
   * replaces them while the source is held. */
  garmentLabel: "--garment",
  heldCaption: "The source, while you hold.",
  sourceLabel: "before",
  garment: {
    alt: "A rust-coloured chore jacket photographed flat",
    height: 1000,
    src: "/demo/try-on/garment.jpg",
    width: 1000,
  },
  result: {
    alt: "A person in a plaster-walled room wearing the rust chore jacket",
    height: 1400,
    src: "/demo/try-on/figure.jpg",
    width: 939,
  },
  source: {
    alt: "The same person in the same room, in the cream outfit they arrived in",
    height: 1400,
    src: "/demo/sources/figure.jpg",
    width: 939,
  },
  title: "Hold to compare",
} as const;

export const AGENT_EXAMPLES = [
  {
    label: "Price it before it spends",
    command: 'motif erase "the bottle" shelf.jpg --dry-run',
    output: '{"cost":0.024,"costBasis":"projected","valid":true}',
  },
  {
    label: "Wrong verb, exit 2",
    command: 'motif remove "the car" street.jpg',
    output: 'Unknown command "remove".\nDid you mean: erase, cutout, segment?',
  },
  {
    label: "Every command, as JSON",
    command: "motif --describe tasks --format json",
    output:
      '{"task":"erase","summary":"Remove something\nand fill the gap",\n"tiers":["fast","balanced","quality"]}',
  },
] as const;

/** The order the matrix reads in: the two commands that can leave fal first,
 * then the rest, then the two that need no model at all. */
const MATRIX_ORDER = [
  "generate",
  "vary",
  "animate",
  "erase",
  "cutout",
  "reframe",
  "upscale",
  "restore",
  "relight",
  "restyle",
  "try-on",
  "layers",
  "vectorize",
  "segment",
  "ask",
  "map",
  "material",
  "tile",
  "mesh",
] as const;

/** `generate` and `edit` are the only jobs the SDK's image layer carries
 * itself, so they are the only rows with anything outside the fal column. */
const DIRECT = new Set<string>(["generate", "vary"]);

/** What the fal column says for one row: a number of models to choose
 * between, or a note for the two commands that have no model of their own. */
export type MatrixFal =
  | { readonly count: number; readonly kind: "models"; readonly noun: string }
  | { readonly kind: "note"; readonly text: string };

export interface MatrixRow {
  readonly direct: string | undefined;
  readonly fal: MatrixFal;
  readonly summary: string;
  readonly verb: string;
}

/** The matrix says what each row does in the catalogue's words, so the two
 * halves of the page cannot describe the same command differently. The
 * catalogue writes a summary as a sentence; a table cell does not want the
 * full stop. */
const SUMMARIES = new Map(
  CATALOGUE.flatMap((group) =>
    group.entries.map(
      (entry) => [entry.verb, entry.summary.replace(/\.$/u, "")] as const
    )
  )
);

/** Built from the SDK's Task table, so the counts are the ones the CLI will
 * actually choose between. Transcribing them by hand is how a page starts
 * lying about the product it documents. */
export function matrixRows(): readonly MatrixRow[] {
  const ranked = MATRIX_ORDER.map((verb): MatrixRow => {
    const count = TASKS[verb].models.length;
    return {
      direct: DIRECT.has(verb) ? "Make, edit" : undefined,
      fal: { count, kind: "models", noun: count === 1 ? "model" : "models" },
      summary: SUMMARIES.get(verb) ?? TASKS[verb].summary,
      verb,
    };
  });

  return [
    ...ranked,
    {
      direct: undefined,
      fal: {
        kind: "note",
        text: `Same ${TASKS.generate.models.length} as generate`,
      },
      summary: "A consistent set from a theme",
      verb: "series run",
    },
    {
      direct: undefined,
      fal: { kind: "note", text: "No model; made here" },
      summary: "A captioned contact sheet",
      verb: "sheet",
    },
  ];
}

export const MATRIX = {
  body: "Every command runs on fal today, choosing from the number of models shown. Underneath the commands, the SDK can call four providers itself, for making and editing an image, so a prompt can go to Google, OpenAI or Replicate instead.",
  footnote:
    "Make, edit means the SDK calls that provider directly, with that provider's own key, and only for those two jobs. Transparent output already works this way, running on OpenAI rather than fal. Everything else goes through fal, which hosts models from Google, OpenAI, ByteDance, Ideogram, Topaz and others under one key.",
  title: "What runs where",
} as const;
