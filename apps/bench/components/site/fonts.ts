import { Faculty_Glyphic } from "next/font/google";

/** Faculty Glyphic sets the wordmark, the chapter heads and the row titles.
 * It is a glyphic sans with one weight, drawn with carved rather than drawn
 * terminals, and it holds the 120px wordmark and the 28px row title from the
 * same file. There is no second weight to reach for, which is the point: the
 * page separates display from body by family, not by weight. */
export const facultyGlyphic = Faculty_Glyphic({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-faculty",
  weight: "400",
});
