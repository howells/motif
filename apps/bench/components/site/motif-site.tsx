import { Agents } from "@/components/site/agents";
import { Catalogue } from "@/components/site/catalogue";
import { Compare } from "@/components/site/compare";
import { dmMono, facultyGlyphic } from "@/components/site/fonts";
import { Hero } from "@/components/site/hero";
import { Looks } from "@/components/site/looks";
import { Footer, Masthead } from "@/components/site/masthead";
import { Matrix } from "@/components/site/matrix";
import { Moods } from "@/components/site/moods";

/** The public page.
 *
 * Masthead, hero, then the catalogue: every command as a full-width band,
 * grouped Make / Edit / Understand / The tool itself. Looks, moods, the
 * comparison, the provider table and the JSON stay after it.
 *
 * The page prerenders. Client islands are the carousels, the held
 * comparisons, the clip, the moods and the comparison. */
export function MotifSite() {
  return (
    <div className={`site ${facultyGlyphic.variable} ${dmMono.variable}`}>
      <Masthead />
      <main>
        <Hero />
        <Catalogue />
        <Looks />
        <Moods />
        <Compare />
        <Matrix />
        <Agents />
      </main>
      <Footer />
    </div>
  );
}
