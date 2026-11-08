import { EDIT } from "@/lib/site/home/edit";
import { LOOKS_AND_MOODS } from "@/lib/site/home/looks-and-moods";
import { MAKE } from "@/lib/site/home/make";
import { PRICE } from "@/lib/site/home/price";
import { READ_AND_CONVERT } from "@/lib/site/home/read-and-convert";
import type { Chapter } from "@/lib/site/home/types";

/** The chapters between the hero and the close, in page order. Each chapter
 * keeps its words in a file of its own beside this one. */
export const CHAPTERS: readonly Chapter[] = [
  MAKE,
  EDIT,
  READ_AND_CONVERT,
  LOOKS_AND_MOODS,
  PRICE,
];
