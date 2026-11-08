import { describe, expect, it } from "vitest";

import { entryWithId, figureAt } from "./lookup";
import type { Chapter } from "./types";

const image = {
  alt: "A vase.",
  height: 10,
  src: "/demo/vase/vase.jpg",
  width: 10,
};

const chapter = {
  id: "edit",
  title: "Edit",
  intro: "Change pictures you already have.",
  tone: "ground",
  entries: [
    {
      id: "erase",
      command: { docs: "/docs/commands/erase", text: "motif erase" },
      figures: [{ caption: "Before", image }],
    },
    {
      id: "upscale",
      command: { docs: "/docs/commands/upscale", text: "motif upscale" },
      figures: [],
    },
  ],
} as const satisfies Chapter;

describe("looking up homepage content", () => {
  it("finds an entry by its id, wherever it sits in the chapter", () => {
    expect(entryWithId(chapter, "upscale").command.text).toBe("motif upscale");
  });

  it("fails, naming the chapter and the id, when the chapter has no such entry", () => {
    const loose: Chapter = chapter;
    expect(() => entryWithId(loose, "restore")).toThrow(
      'The edit chapter has no entry "restore"'
    );
  });

  it("finds a figure by its place in the entry", () => {
    expect(figureAt(entryWithId(chapter, "erase"), 0).caption).toBe("Before");
  });

  it("fails, naming the entry and the place, when the entry has no such figure", () => {
    expect(() => figureAt(entryWithId(chapter, "erase"), 1)).toThrow(
      'Entry "erase" has no figure 1'
    );
  });
});
