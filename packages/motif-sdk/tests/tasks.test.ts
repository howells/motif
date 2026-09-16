// The Task registry is data, so the only thing a test can hold is its shape: every ranked Model
// is a Model the SDK knows, no Task ranks the same Model twice, and `vary` stays the edit-capable
// slice of `generate` rather than drifting into a second hand-maintained list.

import { describe, expect, it } from "vitest";

import { MODELS } from "../src/models";
import type {
  RankedModel,
  TaskDefinition,
  TaskId,
  TaskMode,
} from "../src/tasks";
import { TASK_IDS, TASKS } from "../src/tasks";
import { isFalToolId } from "../src/tools";

const entries: readonly (readonly [TaskId, TaskDefinition])[] = TASK_IDS.map(
  (task) => [task, TASKS[task]] as const
);

describe(TASKS, () => {
  it("matches TASK_IDS", () => {
    expect([...TASK_IDS]).toStrictEqual(Object.keys(TASKS));
  });

  it.each(entries)("%s ranks only known Models", (_task, definition) => {
    for (const { model } of definition.models) {
      expect(
        Object.hasOwn(MODELS, model) || isFalToolId(model),
        `${model} is neither a MODELS key nor a fal tool id`
      ).toBeTruthy();
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
          ).toBeTruthy();
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
        ).toBeTruthy();
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
            supports.includes(capability),
            `${entry.model} requires ${capability} but does not list it in supports`
          ).toBeTruthy();
        }
      }
    }
  );

  it.each(entries)("%s is hand-ranked on an ISO date", (_task, definition) => {
    expect(definition.rankedFrom).toBe("hand");
    expect(definition.rankedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(definition.rankedAt))).toBeFalsy();
  });

  it("ranks vary as generate filtered to edit-capable Models", () => {
    expect(TASKS.vary.models).toStrictEqual(
      TASKS.generate.models.filter(
        ({ model }) => MODELS[model]?.supportsEdit === true
      )
    );
  });
});
