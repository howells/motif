/** The themed scenes of a `series run`, and the Series a run continues or creates. */

import type { ASPECT_RATIOS, RESOLUTIONS } from "@howells/motif-sdk";

import {
  createSeries,
  loadSeries,
  seriesExists,
  slugify,
} from "../../utils/series";
import type { SeriesConfig } from "../../utils/series";
import { hasText } from "../../utils/text";

export const SERIES_RUN_MAX_COUNT = 24;
const SERIES_RUN_SCENE_FOCI = [
  "wide establishing composition",
  "hero subject composition",
  "close material and texture study",
  "human-scale environmental view",
  "low-angle perspective",
  "quiet atmospheric detail",
  "symmetrical frontal composition",
  "oblique side-light composition",
] as const;

/**
 * The theme as it reads mid-sentence: its first letter lower-cased unless the
 * second character is a capital, so "A ceramics studio" becomes "a ceramics
 * studio" and "BBC archive" stays as it is.
 */
export function midSentenceTheme(theme: string): string {
  const [first = "", second = ""] = theme;
  const acronym = second !== second.toLowerCase();
  return acronym ? theme : `${first.toLowerCase()}${theme.slice(1)}`;
}

export function buildSeriesRunStylePrompt(
  theme: string,
  style?: string
): string {
  const base = style?.trim();
  if (hasText(base)) {
    return base;
  }
  return [
    `Cohesive visual series about ${midSentenceTheme(theme)}`,
    "consistent tone, style, color palette, lighting, lens language, framing discipline, material treatment, and post-processing across every image",
  ].join(": ");
}

export function buildSeriesRunScenes(theme: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const focus = SERIES_RUN_SCENE_FOCI[index % SERIES_RUN_SCENE_FOCI.length];
    return [
      `Image ${index + 1} of ${count} in a cohesive visual series about ${midSentenceTheme(theme)}`,
      focus,
      "shared visual language, palette, lighting, lens, composition rhythm, and post-processing across the full set",
      "no text, no watermark",
    ].join("; ");
  });
}

export async function loadOrCreateRunSeries(options: {
  aspect: (typeof ASPECT_RATIOS)[number];
  look?: string;
  mood?: string;
  resolution: (typeof RESOLUTIONS)[number];
  series?: string;
  stylePrompt: string;
  theme: string;
}): Promise<SeriesConfig> {
  if (hasText(options.series)) {
    return await loadSeries(options.series);
  }

  // The same theme again continues the series it made the first time.
  const slug = slugify(options.theme);
  if (seriesExists(slug)) {
    return await loadSeries(slug);
  }
  return await createSeries({
    defaultAspect: options.aspect,
    defaultResolution: options.resolution,
    look: options.look,
    mood: options.mood,
    name: options.theme,
    stylePrompt: options.stylePrompt,
  });
}
