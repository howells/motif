import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HOME } from "./content";
import { MAKE } from "./make";

// The Make chapter, checked against the Paper file's words (desktop
// sections 03 to 05, phone 04 to 06), copied by hand from the artboards, so
// a change on either side shows up here.

describe("the Make chapter", () => {
  it("comes first, with its title, intro and masthead link", () => {
    // The homepage's own types are out of reach from here; reading it as
    // plain data is enough to find the chapter's place.
    const home: unknown = HOME;
    expect(home).toHaveProperty(["chapters", 0], MAKE);
    const { intro, nav, title, tone } = MAKE;
    expect({ intro, nav, title, tone }).toStrictEqual({
      intro: "Start from a sentence, or from something you already have.",
      nav: "What it does",
      title: "Make",
      tone: "ground",
    });
  });

  it("runs its entries in the artboards' order", () => {
    expect(MAKE.entries.map((entry) => entry.headline)).toStrictEqual([
      "A picture from a sentence.",
      "One picture from several of yours.",
      "Variations.",
      "A matching set.",
      "No background.",
      "Lettering, spelled right.",
      "Seamless textures.",
      "Film from a still.",
    ]);
  });

  it("gives the phone its own words where its board differs", () => {
    const phone = MAKE.entries.flatMap((entry) =>
      entry.phone === undefined
        ? []
        : [
            {
              body: entry.phone.body,
              command: entry.phone.command?.text,
              id: entry.id,
            },
          ]
    );
    expect(phone).toStrictEqual([
      {
        body: "Add photos of things you own and say how to arrange them. The still life above was made from the four below it.",
        command: 'motif "…" -e cup.jpg -e vase.jpg …',
        id: "from-your-photos",
      },
      {
        body: undefined,
        command: 'motif "a label that reads…"',
        id: "lettering",
      },
    ]);
  });

  it("plays a film that exists for the film entry", () => {
    const film = MAKE.entries.find((entry) => entry.id === "film")?.figures[0]
      ?.film;
    expect(film?.play).toBe("Play the film");
    const file = path.resolve(
      import.meta.dirname,
      "../../../public",
      `.${film?.src ?? ""}`
    );
    expect(film?.src.endsWith(".mp4")).toBe(true);
    expect(existsSync(file)).toBe(true);
  });

  it("prints each entry's command as the desktop board does", () => {
    expect(MAKE.entries.map((entry) => entry.command.text)).toStrictEqual([
      'motif "…"',
      'motif "…" -e cup.jpg -e linen.jpg -e vase.jpg -e bottle.jpg',
      "motif vary",
      "motif series run",
      'motif "…" --transparent',
      'motif "a bottle label that reads…"',
      "motif tile",
      "motif animate",
    ]);
  });

  it("captions only the variations, under each picture", () => {
    const captions = MAKE.entries.flatMap((entry) =>
      entry.figures.flatMap((figure) =>
        figure.caption === undefined ? [] : [`${entry.id}: ${figure.caption}`]
      )
    );
    expect(captions).toStrictEqual([
      "variations: Yours",
      "variations: Variation one",
      "variations: Variation two",
    ]);
  });
});
