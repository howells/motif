import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { INK, PAPER, RECEDE, VEIL_ALPHA } from "./veil";

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const mix = (top: Rgb, bottom: Rgb, alpha: number): Rgb => ({
  b: top.b * alpha + bottom.b * (1 - alpha),
  g: top.g * alpha + bottom.g * (1 - alpha),
  r: top.r * alpha + bottom.r * (1 - alpha),
});

const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (c: Rgb): number =>
  0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);

const contrast = (a: Rgb, b: Rgb): number => {
  const [high, low] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
};

const BLACK: Rgb = { b: 0, g: 0, r: 0 };
const WHITE: Rgb = { b: 255, g: 255, r: 255 };
const MUTED: Rgb = { b: 90, g: 92, r: 95 };

describe("the veil over an old image", () => {
  it("is the alpha the stylesheet paints, in the paper tone", () => {
    const css = readFileSync(
      new URL("../../../app/app.css", import.meta.url),
      "utf-8"
    );
    const rule = /\.board-veil\s*\{[^}]*\}/u.exec(css)?.[0] ?? "";
    expect(rule).toContain(
      `rgb(${PAPER.r} ${PAPER.g} ${PAPER.b} / ${Math.round(VEIL_ALPHA * 100)}%)`
    );
    expect(VEIL_ALPHA).toBeGreaterThanOrEqual(0.82);
    expect(VEIL_ALPHA).toBeLessThanOrEqual(0.88);
  });

  it.each([
    ["black", BLACK],
    ["white", WHITE],
  ])("keeps every line AA (4.5:1) over a %s image", (_name, image) => {
    const ground = mix(PAPER, image, VEIL_ALPHA);
    const current = contrast(INK, ground);
    expect(current).toBeGreaterThanOrEqual(4.5);
    for (const share of RECEDE) {
      const line = mix(INK, ground, share);
      expect(contrast(line, ground)).toBeGreaterThanOrEqual(4.5);
    }
    // The label and clock above the lines are the muted tone.
    expect(contrast(MUTED, ground)).toBeGreaterThanOrEqual(4.5);
  });

  it("lets earlier lines recede, none below the floor the contrast allows", () => {
    expect([...RECEDE]).toStrictEqual([...RECEDE].toSorted((a, b) => b - a));
    expect(Math.min(...RECEDE)).toBeGreaterThanOrEqual(0.66);
  });
});

const readStylesheet = (name: string) =>
  readFileSync(new URL(`../../../app/${name}`, import.meta.url), "utf-8");

const serifUsers = (css: string) =>
  [
    ...css.matchAll(/([^{}]+)\{[^{}]*font-family:\s*var\(--font-display\)/gu),
  ].map((match) => match[1]?.trim().replaceAll(/\s+/gu, " "));

describe("the product's type", () => {
  it("keeps the serif for the two heading roles and the wordmark alone", () => {
    expect(serifUsers(readStylesheet("globals.css"))).toStrictEqual([
      ".type-display",
      ".type-heading, .app-wordmark",
    ]);
    expect(serifUsers(readStylesheet("app.css"))).toStrictEqual([]);
    expect(serifUsers(readStylesheet("site.css"))).toStrictEqual([]);
  });
});
