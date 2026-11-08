import { CREATIVE_TAXONOMY, LOOKS } from "@howells/motif-sdk";
import { describe, expect, it } from "vitest";

import { HOME } from "./content";
import { LOOK_PLATES, LOOKS_AND_MOODS, MOOD_PLATES } from "./looks-and-moods";

const lookIds = LOOKS.map((look) => look.id);
const moodIds = CREATIVE_TAXONOMY.mood.map((mood) => mood.id);

describe("the Looks and moods chapter", () => {
  it("shows a plate for every Look Motif has, and no other", () => {
    expect(LOOK_PLATES.map((plate) => plate.look).toSorted()).toStrictEqual(
      lookIds.toSorted()
    );
  });

  it("shows a plate for every Mood Motif has, and no other", () => {
    expect(MOOD_PLATES.map((plate) => plate.mood).toSorted()).toStrictEqual(
      moodIds.toSorted()
    );
  });

  const chapter = LOOKS_AND_MOODS;

  it("is on the page, and the masthead links to it as Looks", () => {
    expect(HOME).toHaveProperty("chapters", expect.arrayContaining([chapter]));
    expect(chapter.nav).toBe("Looks");
  });

  it("captions the plates with the board's words, in its order", () => {
    expect(
      chapter.entries.map((entry) =>
        entry.figures.map((figure) => figure.caption)
      )
    ).toStrictEqual([
      [
        "Editorial",
        "Portrait",
        "Still life",
        "Architectural",
        "Interior",
        "Object",
        "Illustration",
        "Surface",
        "Abstract",
      ],
      ["Window", "Dawn", "Raking sun", "Overcast", "Lamplit", "Nocturne"],
    ]);
  });

  it("shows --look and --mood with a value Motif accepts", () => {
    const shown = chapter.entries.map((entry) => entry.command.text);
    expect(shown).toStrictEqual(["--look editorial", "--mood lamplit"]);
    const [look, mood] = shown.map((text) => text.split(" ")[1]);
    expect(lookIds).toContain(look);
    expect(moodIds).toContain(mood);
  });
});
