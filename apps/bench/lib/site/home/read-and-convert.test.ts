import { describe, expect, it } from "vitest";

import { HOME } from "./content";
import { READ_AND_CONVERT } from "./read-and-convert";

// The chapter is read from its own module, which is typed through relative
// imports; the page's `HOME` is checked only for holding it.
describe("the Read and convert chapter", () => {
  it("is one of the homepage's chapters", () => {
    expect(HOME).toHaveProperty(
      "chapters",
      expect.arrayContaining([READ_AND_CONVERT])
    );
  });

  it("sits on the mount with the intro the Paper file gives it", () => {
    const { intro, tone } = READ_AND_CONVERT;
    expect({ intro, tone }).toStrictEqual({
      intro:
        "Ask what's in a picture, or turn it into layers, maps, vectors and 3D.",
      tone: "mount",
    });
  });

  it("shows each Task in the Paper file's order, with its words and command", () => {
    expect(
      READ_AND_CONVERT.entries.map((entry) => [
        entry.headline,
        entry.body,
        entry.command.text,
      ])
    ).toStrictEqual([
      [
        "Ask about a picture.",
        "Get captions, alt text, counts or the words on a label. A question costs a fraction of a penny.",
        "motif ask",
      ],
      [
        "Select one object.",
        "Say “the white bowl” and you get the bowl alone, cut along its real edge. Works on video too.",
        "motif segment",
      ],
      [
        "Split a picture into layers.",
        "The wall, the plinth and the pot each become a separate transparent layer you can move or replace.",
        "motif layers",
      ],
      [
        "Depth, pose and edge maps.",
        "Use them to hold a picture's structure while another tool changes the rest.",
        "motif map",
      ],
      [
        "Materials for 3D.",
        "A photo of linen becomes the maps a 3D app needs to render it.",
        "motif material",
      ],
      [
        "Convert to SVG.",
        "Logos, icons and illustrations traced as SVG, sharp at any size.",
        "motif vectorize",
      ],
      [
        "A 3D model from a photo.",
        "It comes textured, with a skeleton if you want to pose it.",
        "motif mesh",
      ],
      [
        "Make a contact sheet.",
        "Point it at a folder. Each picture can carry its name or price.",
        "motif sheet",
      ],
    ]);
  });
});

describe("the Ask entry", () => {
  it("shows the question and Motif's answer word for word", () => {
    const ask = READ_AND_CONVERT.entries.find(
      (entry) => entry.command.text === "motif ask"
    );
    expect(ask?.exchange).toStrictEqual({
      question: {
        speaker: "You",
        text: "How many blocks of clay are there, and where are they?",
      },
      answer: {
        speaker: "Motif",
        text: "There are four blocks of clay arranged on a wooden work surface.",
      },
    });
  });

  it("asks about the clay-blocks studio photo", () => {
    const ask = READ_AND_CONVERT.entries.find(
      (entry) => entry.command.text === "motif ask"
    );
    expect(ask?.figures.map((figure) => figure.image.src)).toStrictEqual([
      "/demo/series/02.jpg",
    ]);
  });
});

describe("the chapter's pictures", () => {
  it("captions the maps, materials, SVG and 3D pictures as the Paper file does", () => {
    expect(
      READ_AND_CONVERT.entries.map((entry) =>
        entry.figures.flatMap((figure) =>
          figure.caption === undefined ? [] : [figure.caption]
        )
      )
    ).toStrictEqual([
      [],
      [],
      [],
      ["Depth", "Pose", "Edges"],
      ["Colour", "Bumps", "Shine"],
      ["Original, zoomed in", "SVG, zoomed in"],
      ["The photo", "The 3D model, rigged"],
      [],
    ]);
  });

  it("shows the studio depth map, made with motif map and kept in the app", () => {
    const depth = READ_AND_CONVERT.entries
      .flatMap((entry) => entry.figures)
      .find((figure) => figure.caption === "Depth");
    expect(depth?.image.src).toBe("/demo/depth/studio.png");
  });
});
