// The Task registry is data, so the only thing a test can hold is its shape: every ranked Model
// is a Model the SDK knows, no Task ranks the same Model twice, and generation and editing
// curate the same eligible Models while ordering them by their own evidence.

import { describe, expect, it } from "vitest";

import { MODELS } from "../src/models";
import type {
  RankedModel,
  TaskDefinition,
  TaskId,
  TaskMode,
} from "../src/tasks";
import { TASK_IDS, TASKS, TIERS } from "../src/tasks";
import { isFalToolId } from "../src/tools";

const entries: readonly (readonly [TaskId, TaskDefinition])[] = TASK_IDS.map(
  (task) => [task, TASKS[task]] as const
);

/** A Task's Model ids best first, grouped by Tier. */
function byTier(task: "generate" | "vary") {
  return Object.fromEntries(
    TIERS.map((tier) => [
      tier,
      TASKS[task].models
        .filter((entry) => entry.tier === tier)
        .map(({ model }) => model),
    ])
  );
}

describe(TASKS, () => {
  it("matches TASK_IDS", () => {
    expect([...TASK_IDS]).toStrictEqual(Object.keys(TASKS));
  });

  it.each(entries)("%s ranks only known Models", (_task, definition) => {
    for (const { model } of definition.models) {
      expect(
        Object.hasOwn(MODELS, model) || isFalToolId(model),
        `${model} is neither a MODELS key nor a fal tool id`
      ).toBe(true);
    }
  });

  it.each(entries)("%s ranks each Model once per mode", (_task, definition) => {
    const ids = definition.models.map(
      ({ model, mode }) => `${model}|${mode ?? ""}`
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(entries)("%s has at least one Model", (_task, definition) => {
    expect(definition.models.length).toBeGreaterThan(0);
  });

  it.each(entries)(
    "%s lists every entry's mode in its modes",
    (_task, definition) => {
      const modes: readonly TaskMode[] = definition.modes ?? [];
      const modeIds = new Set(modes.map((mode: TaskMode): string => mode.id));
      for (const entry of definition.models) {
        if (entry.mode !== undefined) {
          expect(
            modeIds.has(entry.mode),
            `${entry.model} names mode ${entry.mode}, missing from modes`
          ).toBe(true);
        }
      }
    }
  );

  it.each(entries)(
    "%s has a ranked entry for every listed mode",
    (_task, definition) => {
      const models: readonly RankedModel[] = definition.models;
      const modes: readonly TaskMode[] = definition.modes ?? [];
      for (const mode of modes) {
        expect(
          models.some((entry: RankedModel): boolean => entry.mode === mode.id),
          `mode ${mode.id} has no ranked entry`
        ).toBe(true);
      }
    }
  );

  it.each(entries)(
    "%s requires only capabilities an entry also supports",
    (_task, definition) => {
      for (const entry of definition.models) {
        const supports: readonly string[] = entry.supports ?? [];
        const requires: readonly string[] = entry.requires ?? [];
        for (const capability of requires) {
          expect(
            supports,
            `${entry.model} requires ${capability} but does not list it in supports`
          ).toContain(capability);
        }
      }
    }
  );

  it.each(entries)("%s is hand-ranked on an ISO date", (_task, definition) => {
    expect(definition.rankedFrom).toBe("hand");
    expect(definition.rankedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(definition.rankedAt))).toBe(false);
  });

  it("orders the image rankings by Arena, read 2026-10-29 (MOT-72)", () => {
    expect(TASKS.generate.rankedAt).toBe("2026-10-29");
    expect(TASKS.vary.rankedAt).toBe("2026-10-29");
    expect(byTier("generate")).toStrictEqual({
      balanced: [
        "banana21",
        "grok-image-2",
        "muse-image",
        "banana2",
        "qwen3",
        "mai-image-2.5",
        "banana",
        "ideogram4",
        "flux2-flex",
        "recraft41",
        "flux2-pro",
        "krea3",
        "grok-image-quality",
        "ideogram3-transparent",
      ],
      fast: ["banana2-lite", "grok-image", "seedream5-lite", "flux2-turbo"],
      quality: [
        "sunburst",
        "flare",
        "gpt2",
        "seedream5",
        "gpt",
        "mai-image-2.5-pro",
      ],
    });
    expect(byTier("vary")).toStrictEqual({
      balanced: [
        "grok-image-2",
        "banana21",
        "krea3",
        "mai-image-2.5",
        "muse-image",
        "grok-image-quality",
        "banana",
        "banana2",
        "qwen3",
        "flux2-pro",
        "flux2-flex",
      ],
      fast: ["grok-image", "banana2-lite", "seedream5-lite"],
      quality: [
        "sunburst",
        "flare",
        "gpt2",
        "seedream5",
        "gpt",
        "mai-image-2.5-pro",
      ],
    });
  });

  it("offers vary the same edit-capable choices as generate", () => {
    expect(
      [...TASKS.vary.models].sort((a, b) => a.model.localeCompare(b.model))
    ).toStrictEqual(
      TASKS.generate.models
        .filter(({ model }) => MODELS[model]?.supportsEdit === true)
        .sort((a, b) => a.model.localeCompare(b.model))
    );
  });
});
