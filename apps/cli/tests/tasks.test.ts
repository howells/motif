import { describe, expect, it } from "vitest";

import {
  COMMAND_TASKS,
  TASK_INDEX,
  helpTaskList,
} from "../src/commands/verbs/tasks";

/** The task words a did-you-mean must route, and where they must go. */
const REQUIRED_TASK_WORDS = {
  ask: ["caption", "describe-image", "detect", "count", "ocr"],
  enhance: ["upscale", "restore", "denoise", "sharpen"],
  erase: ["remove", "delete", "inpaint", "erase-object"],
  layers: ["split", "separate", "layer"],
  reframe: ["extend", "expand", "outpaint", "crop", "resize", "ratio"],
  segment: ["mask", "cutout", "select"],
  "series run": ["set", "batch", "consistent"],
  sheet: ["grid", "montage", "contact-sheet", "collage"],
  vectorize: ["svg", "trace"],
};

describe("task table", () => {
  it("routes every required task word to its command", () => {
    for (const [command, words] of Object.entries(REQUIRED_TASK_WORDS)) {
      for (const word of words) {
        expect(TASK_INDEX[word], word).toBe(command);
      }
    }
  });

  it("gives every row a sentence, an alternative and task words", () => {
    for (const row of COMMAND_TASKS) {
      expect(row.whenToUse, row.command).toMatch(/\.$/);
      expect(row.notFor.length, row.command).toBeGreaterThan(0);
      expect(row.tasks.length, row.command).toBeGreaterThan(0);
    }
  });

  it("never shadows a word the CLI already routes as a command", () => {
    const routed = new Set(COMMAND_TASKS.map((row) => row.usage.split(" ")[1]));
    for (const word of Object.keys(TASK_INDEX)) {
      expect(routed.has(word), word).toBeFalsy();
    }
  });

  it("keeps help lines inside 80 columns", () => {
    for (const line of helpTaskList().split("\n")) {
      expect(line.length, line).toBeLessThanOrEqual(80);
    }
  });
});
