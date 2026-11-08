import { describe, expect, it } from "vitest";
import { z } from "zod";

import { HOME } from "./content";

// Test files sit outside the app's tsconfig, so the content module reaches
// this file untyped. Parse the part under test instead of trusting it.
const Entry = z.object({
  command: z.object({ text: z.string() }),
  figures: z.array(z.object({ caption: z.string().optional() })),
  original: z.string().optional(),
  sides: z.array(z.string()).optional(),
});

const Home = z.object({
  chapters: z.array(z.object({ entries: z.array(Entry), title: z.string() })),
});

const home: unknown = HOME;

function edit(): z.infer<typeof Entry>[] {
  const found = Home.parse(home).chapters.find(
    (chapter) => chapter.title === "Edit"
  );
  if (found === undefined) {
    throw new Error("The homepage has no Edit chapter");
  }
  return found.entries;
}

describe("the Edit chapter", () => {
  it("shows the eight edits in the order the design sets them", () => {
    expect(edit().map((entry) => entry.command.text)).toStrictEqual([
      "motif erase",
      "motif cutout",
      "motif reframe",
      "motif upscale",
      "motif relight",
      "motif restyle",
      "motif try-on",
      "motif restore",
    ]);
  });

  it("labels every picture as the design does, Before and After included", () => {
    // Captions under each picture, then the words under a picture split down
    // the middle, or inside the outline drawn over one.
    const labels = edit().map((entry) => [
      ...entry.figures.flatMap((figure) =>
        figure.caption === undefined ? [] : [figure.caption]
      ),
      ...(entry.sides ?? []),
      ...(entry.original === undefined ? [] : [entry.original]),
    ]);
    expect(labels).toStrictEqual([
      ["Before", "After"],
      [],
      ["The original photo"],
      ["360 pixels", "1,440 pixels"],
      ["Flat daylight", "Evening light"],
      ["Your photo", "The reference"],
      ["Wearing it", "The person", "The jacket"],
      ["Before", "After"],
    ]);
  });
});
