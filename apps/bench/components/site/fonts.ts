import { DM_Mono, Faculty_Glyphic } from "next/font/google";

/** Faculty Glyphic sets the wordmark, the chapter heads and the row titles.
 * It is a glyphic sans with one weight, drawn with carved rather than drawn
 * terminals, and it holds the 56px wordmark and the 22px row title from the
 * same file. There is no second weight to reach for, which is the point: the
 * page separates display from body by family, not by weight. */
export const facultyGlyphic = Faculty_Glyphic({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-faculty",
  weight: "400",
});

/** DM Mono sets every command on the page.
 *
 * The bench app's stack starts at SF Mono, which draws a long hyphen: at 13px
 * `--look` closes up into what reads as a single dash, and a reader taking a
 * flag off the page would type it wrong. DM Mono keeps the two marks apart,
 * and is light and narrow enough to sit under the photographs without
 * announcing itself. Scoped to `.site` via `--font-mono`, so /bench keeps the
 * system stack it was built on. */
export const dmMono = DM_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: "400",
});
