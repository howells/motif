import { describe, expect, it } from "vitest";

import { createMotif, TASK_IDS, TASKS } from "../src/index";
import type { TaskId, TaskInput } from "../src/index";
import { FAL_TOOLS, isFalToolId } from "../src/tools";

/**
 * Pins what `plan()` does for every Task and every Model it ranks: the
 * endpoint, body, price, queueing and Model chosen, or the refusal. One line
 * per case in `__snapshots__/plans.txt`, so a refactor of the planner that
 * moves a body key, a price or a refusal shows as a diff there.
 */

const IMAGE = "https://example.com/source.png";
const OTHER_IMAGE = "https://example.com/reference.png";
const VIDEO = "https://example.com/source.mp4";
const SOURCE_SIZE = { height: 800, width: 1000 };
const SOURCE_VIDEO = {
  fps: 24,
  frames: 96,
  height: 720,
  seconds: 4,
  width: 1280,
};

const motif = createMotif({ falKey: "test" });

interface Entry {
  mode?: string;
  model: string;
  requires?: readonly string[];
  sourceOptional?: true;
}

function entriesOf(task: TaskId): readonly Entry[] {
  const entries: readonly Entry[] = TASKS[task].models;
  return entries;
}

/** The smallest input that can serve this entry, before any option is added. */
function minimal(task: TaskId, entry: Entry): TaskInput {
  const video = isFalToolId(entry.model)
    ? FAL_TOOLS[entry.model].inputKind === "video"
    : false;
  const input: TaskInput = {
    mode: entry.mode,
    model: entry.model,
    sourceSize: SOURCE_SIZE,
  };
  if (task === "generate") {
    return { ...input, prompt: "a lighthouse at dusk" };
  }
  if (entry.sourceOptional !== true) {
    if (video) {
      input.video = VIDEO;
      input.sourceVideo = SOURCE_VIDEO;
    } else {
      input.image = IMAGE;
    }
  }
  if (entry.requires?.includes("mask") === true) {
    input.mask = OTHER_IMAGE;
  }
  if (entry.mode === "boxes") {
    input.boxes = [{ height: 100, width: 100, x: 10, y: 20 }];
  }
  if (entry.mode === "margin") {
    input.margin = { bottom: 8, left: 16, right: 16, top: 8 };
  }
  if (entry.mode === "sizes") {
    input.sizes = [{ height: 600, width: 800 }];
  }
  if (task === "restyle" || task === "try-on") {
    input.references = [OTHER_IMAGE];
  }
  if (task === "reframe" && entry.mode === undefined) {
    input.aspect = "16:9";
  }
  return input;
}

const VARIANTS: readonly [string, (input: TaskInput) => TaskInput][] = [
  ["bare", (input) => input],
  ["prompted", (input) => ({ ...input, prompt: "the shoe" })],
  [
    "no-source",
    ({ image: _image, video: _video, ...input }) => ({
      ...input,
      prompt: "the shoe",
    }),
  ],
  ["queued", (input) => ({ ...input, onProgress: () => {} })],
  ["mood", (input) => ({ ...input, mood: "dawn", prompt: "the room" })],
  ["mask", (input) => ({ ...input, mask: OTHER_IMAGE, prompt: "the shoe" })],
  ["transparent", (input) => ({ ...input, transparent: true })],
  [
    "transparent jpeg",
    (input) => ({ ...input, outputFormat: "jpeg", transparent: true }),
  ],
  [
    "transparent png",
    (input) => ({ ...input, outputFormat: "png", transparent: true }),
  ],
  ["jpeg", (input) => ({ ...input, outputFormat: "jpeg" })],
  ["png", (input) => ({ ...input, outputFormat: "png" })],
  ["webp", (input) => ({ ...input, outputFormat: "webp" })],
  ["gif", (input) => ({ ...input, outputFormat: "gif" })],
  ["1K", (input) => ({ ...input, prompt: "the shoe", resolution: "1K" })],
  ["2K", (input) => ({ ...input, prompt: "the shoe", resolution: "2K" })],
  ["4K", (input) => ({ ...input, prompt: "the shoe", resolution: "4K" })],
  ["ref1", (input) => ({ ...input, references: [OTHER_IMAGE] })],
  [
    "ref2",
    (input) => ({ ...input, references: [OTHER_IMAGE, IMAGE], prompt: "x" }),
  ],
  ["count 0", (input) => ({ ...input, count: 0, prompt: "the shoe" })],
  ["count 1.5", (input) => ({ ...input, count: 1.5, prompt: "the shoe" })],
  ["seed 1.5", (input) => ({ ...input, prompt: "the shoe", seed: 1.5 })],
  ["seed -1", (input) => ({ ...input, prompt: "the shoe", seed: -1 })],
  [
    "box outside",
    ({ image, ...input }) => ({
      ...input,
      boxes: [{ height: 100, width: 100, x: 5000, y: 20 }],
      image,
      prompt: "the shoe",
    }),
  ],
  ["params bogus", (input) => ({ ...input, params: { bogus_key: 1 } })],
  [
    "params aspect",
    (input) => ({ ...input, params: { aspect_ratio: "21:9" } }),
  ],
  ["params 4K", (input) => ({ ...input, params: { resolution: "4K" } })],
  ["params gif", (input) => ({ ...input, params: { output_format: "gif" } })],
  ["params count 0", (input) => ({ ...input, params: { num_images: 0 } })],
  ["scale 3", (input) => ({ ...input, scale: 3 })],
  ["scale -1", (input) => ({ ...input, scale: -1 })],
  ["aspect", (input) => ({ ...input, aspect: "3:2" })],
  ["aspect 21:9", (input) => ({ ...input, aspect: "21:9" })],
  ["aspect auto", (input) => ({ ...input, aspect: "auto" })],
  [
    "rich",
    (input) => ({
      ...input,
      count: 2,
      negativePrompt: "blur",
      outputFormat: "png",
      prompt: "the shoe",
      scale: 2,
      seed: 3,
    }),
  ],
];

/** Options the ranking must choose by: a Model that cannot carry one is skipped. */
const RANKED_OPTIONS: readonly {
  extra: Partial<TaskInput>;
  label: string;
  /** Plain tool Tasks take no prompt, so a format variant leaves it out. */
  promptless?: readonly TaskId[];
  tasks: readonly TaskId[];
}[] = [
  {
    extra: { aspect: "21:9" },
    label: "aspect 21:9",
    tasks: ["generate", "layers", "relight", "reframe", "vary"],
  },
  {
    extra: { aspect: "8:1" },
    label: "aspect 8:1",
    tasks: ["generate", "layers", "relight", "reframe", "vary"],
  },
  {
    extra: { outputFormat: "jpeg" },
    label: "fmt jpeg",
    promptless: ["cutout", "restore", "upscale"],
    tasks: ["cutout", "relight", "restore", "upscale"],
  },
  {
    extra: { outputFormat: "webp" },
    label: "fmt webp",
    promptless: ["cutout", "restore", "upscale"],
    tasks: ["cutout", "relight", "restore", "upscale"],
  },
  {
    extra: { resolution: "1K" },
    label: "res 1K",
    tasks: ["generate", "relight", "reframe", "vary"],
  },
  {
    extra: { resolution: "2K" },
    label: "res 2K",
    tasks: ["generate", "relight", "reframe", "vary"],
  },
];

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sorted);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sorted(entry)])
    );
  }
  return value;
}

function line(task: TaskId, label: string, input: TaskInput): string {
  const planned = motif.plan(task, input, { dryRun: true });
  const prefix = `${task} ${input.mode ?? "-"} ${label}`;
  if (planned.isErr()) {
    const { code, details, message } = planned.error;
    return `${prefix} => ERR ${String(code)} ${message} ${JSON.stringify(sorted(details))}`;
  }
  const { body, chosenBy, cost, endpoint, mode, model, prompt, queued, tier } =
    planned.value;
  return `${prefix} => ${model} ${endpoint} queued=${String(queued)} by=${chosenBy} tier=${tier} mode=${String(mode)} cost=${JSON.stringify(sorted(cost))} prompt=${JSON.stringify(prompt)} body=${JSON.stringify(sorted(body))}`;
}

function table(task: TaskId): string {
  const lines: string[] = [];
  for (const entry of entriesOf(task)) {
    const base = minimal(task, entry);
    for (const [label, vary] of VARIANTS) {
      lines.push(
        line(
          task,
          `${entry.model} ${label}`,
          vary({ ...base, mode: base.mode })
        )
      );
    }
  }
  // The Model the ranking picks, unnamed, at each Tier and with References.
  const modes = [...new Set(entriesOf(task).map((entry) => entry.mode))];
  for (const mode of modes) {
    const first = entriesOf(task).find((entry) => entry.mode === mode);
    if (first === undefined) {
      continue;
    }
    const { model: _model, ...base } = minimal(task, first);
    for (const tier of ["fast", "balanced", "quality"] as const) {
      lines.push(
        line(task, `ranked ${tier}`, { ...base, prompt: "the shoe", tier }),
        line(task, `ranked ${tier} refs`, {
          ...base,
          prompt: "the shoe",
          references: [OTHER_IMAGE],
          tier,
        })
      );
    }
  }
  for (const mode of modes) {
    const first = entriesOf(task).find((entry) => entry.mode === mode);
    if (first === undefined) {
      continue;
    }
    const { model: _model, ...base } = minimal(task, first);
    for (const { extra, label, promptless, tasks } of RANKED_OPTIONS) {
      if (!tasks.includes(task)) {
        continue;
      }
      for (const tier of ["fast", "quality"] as const) {
        lines.push(
          line(task, `ranked ${tier} ${label}`, {
            ...base,
            ...extra,
            prompt:
              promptless?.includes(task) === true ? undefined : "the shoe",
            tier,
          })
        );
      }
    }
  }
  if (task === "generate" || task === "vary") {
    const base = minimal(task, entriesOf(task)[0] ?? { model: "" });
    const { model: _model, ...unnamed } = base;
    for (const look of ["portrait", "object", "editorial"]) {
      lines.push(
        line(task, `look ${look}`, { ...unnamed, look, prompt: "a vase" }),
        line(task, `look ${look} mood`, {
          ...unnamed,
          look,
          mood: "dawn",
          prompt: "a vase",
        }),
        line(task, `look ${look} refs`, {
          ...unnamed,
          look,
          prompt: "a vase",
          references: [OTHER_IMAGE],
        })
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

describe("plan table", () => {
  it.each(TASK_IDS)("plans %s as pinned", async (task) => {
    await expect(table(task)).toMatchFileSnapshot(
      `./__snapshots__/plans/${task}.txt`
    );
  });
});
