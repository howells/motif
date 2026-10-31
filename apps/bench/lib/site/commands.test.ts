import { describe, expect, it } from "vitest";

import { PHASE_ONE_TASKS } from "../app/tasks/request";
import { CATALOGUE } from "./catalogue";
import { APP_TASK_IDS, COMMAND_COUNT, COMMAND_GROUPS } from "./commands";

describe("the Commands index", () => {
  it("lists every catalogue command exactly once", () => {
    const listed = COMMAND_GROUPS.flatMap((group) =>
      group.entries.map((entry) => entry.id)
    );
    const catalogue = CATALOGUE.flatMap((group) =>
      group.entries.map((entry) => entry.id)
    );
    expect(listed.toSorted()).toStrictEqual(catalogue.toSorted());
    expect(COMMAND_COUNT).toBe(catalogue.length);
  });

  it("offers in the App exactly the Tasks the server accepts", () => {
    expect(
      [...APP_TASK_IDS].toSorted((a, b) => a.localeCompare(b))
    ).toStrictEqual(
      [...PHASE_ONE_TASKS].toSorted((a, b) => a.localeCompare(b))
    );
  });
});
