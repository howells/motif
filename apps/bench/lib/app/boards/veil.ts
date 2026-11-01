/**
 * The veil over a node's old image while a run works on it, and how dark the
 * lines read on it. The CSS (`.board-veil` in app.css) paints the same
 * alpha; a test holds the two together and checks the contrast.
 */

/** How much of the paper tone covers the image beneath. */
export const VEIL_ALPHA = 0.88;

/** The paper tone itself, as the App's `--ground` token. */
export const PAPER = { b: 247, g: 249, r: 250 } as const;

/** The ink tone, as the App's `--ink` token. */
export const INK = { b: 26, g: 27, r: 28 } as const;

/** How much of the ink each earlier line keeps, nearest the current line
 * first. The lowest is set by contrast: below about 0.66 a line no longer
 * reaches AA over the veil laid on a black image. */
export const RECEDE = [0.88, 0.76, 0.68] as const;
