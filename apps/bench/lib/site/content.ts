/**
 * Content for the public page at `/`. Import everything from here; the
 * neighbouring files only keep this one short.
 *
 * Every image is a real Motif output from `docs/tools/examples/`, web-sized into
 * `public/demo/`. Each capability's `command` is the one that produced its
 * asset. Where a fal tool made the asset in place of a Motif command,
 * `relatesTo` names that command and `notes` says how the two differ. The agent
 * surface is the CLI's own captured output.
 */

import { LOOKS } from "@howells/motif-sdk";

import {
  DESCRIBE_TASKS_EXCERPT,
  DID_YOU_MEAN_OUTPUT,
  HELP_EXCERPT,
} from "@/lib/site/cli-output";
import type { Asset, CapabilityGroup, LookEntry } from "@/lib/site/types";

export { CAPABILITIES } from "@/lib/site/capabilities";
export type {
  Asset,
  Capability,
  CapabilityGroup,
  Demo,
  LookEntry,
} from "@/lib/site/types";

export const SITE = {
  install: "npm install -g @howells/motif-cli",
  name: "Motif",
  summary:
    "Motif is a command-line tool for making, editing and reading images with fal.ai models.",
};

export const CAPABILITY_GROUPS: { id: CapabilityGroup; title: string }[] = [
  { id: "make", title: "Make" },
  { id: "edit", title: "Edit" },
  { id: "understand", title: "Understand" },
  { id: "tools", title: "Tools" },
];

/** Proof images for five looks, each made with the look's default model and
 * aspect ratio. */
const LOOK_PROOFS = new Map<string, { image: Asset; prompt: string }>([
  [
    "editorial",
    {
      image: {
        alt: "A worn wooden table laid with paint tins, jars and tied swatches in bottle green and oxblood",
        height: 1800,
        src: "/demo/looks/editorial.jpg",
        width: 1800,
      },
      prompt:
        "A materials library table with paint tins and swatch chains in bottle green and oxblood",
    },
  ],
  [
    "still-life",
    {
      image: {
        alt: "Three stoneware vessels, one glazed sage green and two pale stone, on a plaster ground",
        height: 1024,
        src: "/demo/looks/still-life.jpg",
        width: 1024,
      },
      prompt: "Three stoneware vessels, one glazed sage green, two pale stone",
    },
  ],
  [
    "lived-in",
    {
      image: {
        alt: "A sitting room with deep green painted bookshelves and an oatmeal linen sofa",
        height: 768,
        src: "/demo/looks/lived-in.jpg",
        width: 1024,
      },
      prompt:
        "A calm English sitting room with deep green painted bookshelves and an oatmeal linen sofa",
    },
  ],
  [
    "architectural",
    {
      image: {
        alt: "A hotel lobby with a curved travertine reception desk against oxblood plaster walls",
        height: 1800,
        src: "/demo/looks/architectural.jpg",
        width: 1450,
      },
      prompt:
        "A hotel lobby with a travertine reception desk against oxblood plaster walls",
    },
  ],
  [
    "homeowner",
    {
      image: {
        alt: "A phone snapshot of a kitchen with oak cabinets and a cream range cooker",
        height: 1350,
        src: "/demo/looks/homeowner.jpg",
        width: 1800,
      },
      prompt:
        "A real home kitchen with oak shaker cabinets and a cream range cooker",
    },
  ],
]);

export const LOOK_ENTRIES: LookEntry[] = LOOKS.map((look) => {
  const entry: LookEntry = {
    description: look.description,
    id: look.id,
    name: look.label,
  };
  const proof = LOOK_PROOFS.get(look.id);
  if (proof !== undefined) {
    entry.command = `motif "${proof.prompt}" --look ${look.id} -o ${look.id}.png --no-open --format json --fields model,aspect,cost,prompt`;
    entry.image = proof.image;
    entry.prompt = proof.prompt;
  }
  return entry;
});

export const AGENT_SURFACE = {
  describeTasksCommand: "motif --describe tasks --format json",
  describeTasksExcerpt: DESCRIBE_TASKS_EXCERPT,
  didYouMean: {
    command: 'motif remove "the car" x.png --format json',
    exitCode: 2,
    output: DID_YOU_MEAN_OUTPUT,
  },
  help: HELP_EXCERPT,
};
