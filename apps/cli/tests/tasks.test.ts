import { describe, expect, it } from "vitest";

import {
  COMMAND_TASKS,
  TASK_INDEX,
  helpTaskList,
  taskCorrection,
} from "../src/commands/verbs/tasks";

function invocation(positionals: string[]): string | undefined {
  return taskCorrection(positionals)?.invocation;
}

describe("task table", () => {
  it("gives every Task verb a row", async () => {
    const { TASK_IDS } = await import("@howells/motif-sdk");
    for (const task of TASK_IDS) {
      expect(
        COMMAND_TASKS.map((row) => row.command),
        task
      ).toContain(task);
    }
  });

  it("never shadows a word the CLI already routes as a command", () => {
    const routed = new Set(COMMAND_TASKS.map((row) => row.usage.split(" ")[1]));
    for (const word of Object.keys(TASK_INDEX)) {
      expect(routed.has(word), word).toBe(false);
    }
  });

  it("rewrites positionals led by a task word onto its command", () => {
    expect(invocation(["remove", "the car", "x.png"])).toBe(
      'motif erase "the car" x.png'
    );
    expect(invocation(["grid", "a.png", "b.png"])).toBe(
      "motif sheet a.png b.png"
    );
    // An unquoted prompt joins back into the text placeholder.
    expect(invocation(["Remove", "the", "car", "x.png"])).toBe(
      'motif erase "the car" x.png'
    );
    expect(invocation(["batch", "brutalist", "towers"])).toBe(
      'motif series run "brutalist towers"'
    );
    // A usage without placeholders takes none of the caller's arguments.
    expect(invocation(["latest", "room.jpg"])).toBe("motif --last");
    expect(taskCorrection(["a cat", "x.png"])).toBeNull();
  });

  it("keeps help lines inside 80 columns", () => {
    for (const line of helpTaskList().split("\n")) {
      expect(line.length, line).toBeLessThanOrEqual(80);
    }
  });
});
