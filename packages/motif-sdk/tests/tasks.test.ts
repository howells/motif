// The Task registry is data, so the only thing a test can hold is its shape: every ranked Model
// is a Model the SDK knows, no Task ranks the same Model twice, and `vary` stays the edit-capable
// slice of `generate` rather than drifting into a second hand-maintained list.

import { describe, expect, it } from "vitest";

import { MODELS } from "../src/models";
import { TASK_IDS, TASKS } from "../src/tasks";
import { isFalToolId } from "../src/tools";

const entries = TASK_IDS.map((task) => [task, TASKS[task]] as const);

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

  it.each(entries)("%s ranks each Model once", (_task, definition) => {
    const ids = definition.models.map(({ model }) => model);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(entries)("%s has at least one Model", (_task, definition) => {
    expect(definition.models.length).toBeGreaterThan(0);
  });

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
