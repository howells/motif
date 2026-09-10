/**
 * One real series run, with its contact sheet and the `series list` and
 * `series show` output that followed. Commands and output are as captured,
 * in the CLI's own key order, with `…` where entries are left out; the images
 * are web-sized copies of the run's outputs. Import from `@/lib/site/content`.
 */

import type { Asset, Capability } from "@/lib/site/types";

const THEME = "A ceramics studio on the Suffolk coast, from clay to kiln";
const SLUG = "a-ceramics-studio-on-the-suffolk-coast-from-clay-to-kiln";

/** Where `series run` saved the images, written once as `$D` in the sheet
 * command rather than six times over. */
const OUTPUT_DIR = `~/.motif/series/${SLUG}/outputs`;

/** Each scene prompt's framing, in the order the run used them. */
const SCENES: { alt: string; slot: string }[] = [
  {
    alt: "A long pottery workshop with clay pots on shelves under tall windows and an open kiln at the far end",
    slot: "wide establishing composition",
  },
  {
    alt: "Blocks of red, buff and white clay on a bench beside a thrown pot on a wooden wheel head",
    slot: "hero subject composition",
  },
  {
    alt: "A lump of red clay on a worn bench beside a bowl of slip and wooden modelling tools",
    slot: "close material and texture study",
  },
  {
    alt: "Rows of unfired terracotta pots on a long bench by the windows, a kiln behind them",
    slot: "human-scale environmental view",
  },
  {
    alt: "A brick kiln with its door open in the workshop, seen from low down",
    slot: "low-angle perspective",
  },
  {
    alt: "A dark stoneware pot on a bench under a window, with the coast outside",
    slot: "quiet atmospheric detail",
  },
];

const FILES = SCENES.map(
  (_scene, index) =>
    `00${index + 1}-a-ceramics-studio-on-the-suffolk-coast-0${index + 1}.png`
);

const LIST_OUTPUT = `{
  "total": 3,
  "series": [
    {
      "name": "${THEME}",
      "slug": "${SLUG}",
      "look": "editorial",
      "mood": "raking",
      "model": "banana",
      "outputCount": 6,
      "refCount": 0
    },
    …
  ]
}`;

const SHOW_OUTPUT = `{
  "command": "series-show",
  "slug": "${SLUG}",
  "look": "editorial",
  "mood": "raking",
  "model": "banana",
  "defaultAspect": "1:1",
  "defaultResolution": "2K",
  "outputCount": 6,
  "outputs": [
    {
      "filename": "${FILES[0]}",
      "cost": 0.15,
      "refsUsed": [],
      "timestamp": "2026-09-10T23:04:02.260Z"
    },
    {
      "filename": "${FILES[1]}",
      "cost": 0.15,
      "refsUsed": [
        "series-anchor"
      ],
      "timestamp": "2026-09-10T23:04:31.587Z"
    },
    …
  ]
}`;

const image = (index: number, alt: string): Asset => ({
  alt,
  height: 1000,
  src: `/demo/series/0${index + 1}.jpg`,
  width: 1000,
});

export const SERIES_CAPABILITY: Capability = {
  caption:
    "A series keeps a shared style, references and model defaults together, and series run makes a set of images from one theme inside it.",
  command: `motif series run "${THEME}" --count 6 -m banana --look editorial --mood raking --no-open --format json`,
  demo: {
    kind: "series",
    list: { command: "motif series list --format json", output: LIST_OUTPUT },
    scenePrompt: `Image 1 of 6 in a cohesive visual series about ${THEME}; wide establishing composition; shared visual language, palette, lighting, lens, composition rhythm, and post-processing across the full set; no text, no watermark. Editorial photograph in the register of Atelier Ellis, Aman hotels, Kinfolk magazine and Aesop, pigment-rich mineral colour on named matte surfaces, quiet composition with generous negative space, shallow depth of field, shot on film with fine grain, restrained and materially rich. No text, no logos, no people. Low raking daylight from the left, long soft shadows that reveal texture.`,
    scenes: SCENES.map((scene, index) => ({
      image: image(index, scene.alt),
      slot: scene.slot,
    })),
    sheet: {
      command: `D=${OUTPUT_DIR}\nmotif sheet ${FILES.map((file) => `$D/${file}`).join(" ")} --cols 3 -o series-sheet.jpg --no-open --format json`,
      image: {
        alt: "The six series images on one contact sheet, three to a row, each captioned with its model, look, mood and cost",
        height: 1192,
        src: "/demo/series/sheet.jpg",
        width: 1632,
      },
    },
    show: {
      command: `motif series show ${SLUG} --format json`,
      output: SHOW_OUTPUT,
    },
  },
  group: "make",
  id: "series",
  notes:
    "Each scene prompt takes the next framing from a fixed list, in order. Images 2 to 6 were also given image 1 as a reference.",
  title: "Make a consistent set of images from a theme",
};
