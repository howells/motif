import { describe, expect, it } from "vitest";

import { besidePlacement, revealViewport } from "./viewport";

const PANE = { height: 800, width: 900 };
const AT_REST = { x: 0, y: 0, zoom: 1 };

describe(revealViewport, () => {
  it("leaves a node that is already in view alone", () => {
    expect(
      revealViewport({ height: 300, width: 272, x: 100, y: 100 }, AT_REST, PANE)
    ).toBeNull();
  });

  it("pans left just enough to show a node the panel now covers", () => {
    // The pane shrank to 900 px when the panel opened; the node's right
    // edge sits at 1100 px.
    const next = revealViewport(
      { height: 300, width: 272, x: 828, y: 100 },
      AT_REST,
      PANE
    );
    expect(next).toStrictEqual({ x: -232, y: 0, zoom: 1 });
    // Its right edge now sits a margin inside the pane.
    expect(828 + 272 + (next?.x ?? 0)).toBe(PANE.width - 32);
  });

  it("works at the canvas's own zoom", () => {
    const next = revealViewport(
      { height: 300, width: 272, x: 1600, y: 100 },
      { x: 0, y: 0, zoom: 0.5 },
      PANE
    );
    expect(next?.zoom).toBe(0.5);
    expect(1600 * 0.5 + 272 * 0.5 + (next?.x ?? 0)).toBe(PANE.width - 32);
  });

  it("brings in a node above or left of the pane", () => {
    expect(
      revealViewport(
        { height: 300, width: 272, x: -400, y: -50 },
        AT_REST,
        PANE
      )
    ).toStrictEqual({ x: 432, y: 82, zoom: 1 });
  });

  it("zooms out to fit a node wider than the pane", () => {
    const next = revealViewport(
      { height: 400, width: 1600, x: 0, y: 0 },
      AT_REST,
      PANE
    );
    expect(next?.zoom).toBeCloseTo((900 - 64) / 1600);
  });
});

describe(besidePlacement, () => {
  const from = { height: 313, width: 272, x: 0, y: 0 };
  const size = { height: 313, width: 272 };

  it("puts a new node to the right, level with the node it's wired from", () => {
    expect(besidePlacement(from, size, [from])).toStrictEqual({ x: 336, y: 0 });
  });

  it("moves down past a node already there", () => {
    const taken = { height: 313, width: 272, x: 336, y: 0 };
    expect(besidePlacement(from, size, [from, taken])).toStrictEqual({
      x: 336,
      y: 345,
    });
  });
});
