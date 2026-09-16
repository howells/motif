/**
 * Content for the public page at `/`. Import everything from here; the
 * neighbouring files only keep this one short.
 *
 * Every image is a real Motif output, web-sized into `public/demo/`. Each
 * capability's `command` is the verb command for its asset; the Model that
 * made it is kept as data and never shown. The agent surface is the CLI's own
 * captured output.
 */

import { CREATIVE_TAXONOMY, LOOKS } from "@howells/motif-sdk";

import { CAPABILITIES } from "@/lib/site/capabilities";
import {
  DESCRIBE_ERRORS_EXCERPT,
  DESCRIBE_TASKS_EXCERPT,
  DID_YOU_MEAN_OUTPUT,
  DRY_RUN_OUTPUT,
  HELP_EXCERPT,
} from "@/lib/site/cli-output";
import { LOOK_PROOFS, MOOD_IMAGES, MOOD_RUN } from "@/lib/site/looks";
import type { CapabilityGroup, LookEntry, MoodEntry } from "@/lib/site/types";

export { CAPABILITIES } from "@/lib/site/capabilities";
export type {
  Asset,
  Capability,
  CapabilityGroup,
  Demo,
  LookEntry,
  MoodEntry,
  SeriesDemo,
  Transcript,
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
  { id: "tools", title: "Maps and more" },
  { id: "more", title: "Everything else" },
];

/** Every section and chapter anchor on the page. The first three are fixed in
 * the looks, moods and appendix components. A repeat fails the build, since
 * the contents links would land on the wrong one. */
const ANCHORS = [
  "looks",
  "moods",
  "agents",
  ...CAPABILITY_GROUPS.map((group) => group.id),
  ...CAPABILITIES.map((capability) => capability.id),
];
const repeated = ANCHORS.find((id, index) => ANCHORS.indexOf(id) !== index);
if (repeated !== undefined) {
  throw new Error(`Two sections share the id "${repeated}"`);
}

const FIELDS = "--no-open --format json --fields model,aspect,cost,prompt";

/** Every look in catalogue order. A look without a proof image fails the
 * build, so a new look in the SDK can't ship without one. */
export const LOOK_ENTRIES: LookEntry[] = LOOKS.map((look) => {
  const proof = LOOK_PROOFS.get(look.id);
  if (proof === undefined) {
    throw new Error(`No proof image for the "${look.id}" look`);
  }
  return {
    acceptsMood: look.acceptsMood,
    command: `motif "${proof.prompt}" --look ${look.id} -o ${look.id}.png ${FIELDS}`,
    description: look.description,
    id: look.id,
    image: proof.image,
    name: look.label,
    prompt: proof.prompt,
  };
});

export const MOOD_ENTRIES: MoodEntry[] = CREATIVE_TAXONOMY.mood.map((mood) => {
  const image = MOOD_IMAGES.get(mood.id);
  if (image === undefined) {
    throw new Error(`No proof image for the "${mood.id}" mood`);
  }
  return {
    command: `motif "${MOOD_RUN.prompt}" --look ${MOOD_RUN.look} --mood ${mood.id} --seed ${MOOD_RUN.seed} -o ${mood.id}.png ${FIELDS}`,
    description: mood.description,
    id: mood.id,
    image,
    name: mood.label,
  };
});

export const AGENT_SURFACE = {
  describeErrors: {
    command: "motif --describe errors --format json",
    output: DESCRIBE_ERRORS_EXCERPT,
  },
  describeTasksCommand: "motif --describe tasks --format json",
  describeTasksExcerpt: DESCRIBE_TASKS_EXCERPT,
  didYouMean: {
    command: 'motif remove "the car" x.png --format json',
    exitCode: 2,
    output: DID_YOU_MEAN_OUTPUT,
  },
  dryRun: {
    command:
      'motif erase "the small amber bottle" source-apothecary.jpg --dry-run --format json --fields cost,costBasis,valid',
    output: DRY_RUN_OUTPUT,
  },
  help: HELP_EXCERPT,
};
