import { Newsreader } from "next/font/google";

/** Newsreader sets the titles and numerals. Its optical-size axis draws the
 * 6rem title with fine display contrast and the chapter titles with sturdier
 * text contrast, all from one family. Instrument Serif has a single weight
 * and no optical sizes, so it only holds up at the largest size. */
export const newsreader = Newsreader({
  axes: ["opsz"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-newsreader",
});
