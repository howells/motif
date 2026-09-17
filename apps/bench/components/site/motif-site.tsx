import { Agents } from "@/components/site/agents";
import { Commands } from "@/components/site/commands";
import { Compare } from "@/components/site/compare";
import { dmMono, facultyGlyphic } from "@/components/site/fonts";
import { Hero } from "@/components/site/hero";
import { Looks } from "@/components/site/looks";
import { Footer, Masthead } from "@/components/site/masthead";
import { Matrix } from "@/components/site/matrix";
import { Moods } from "@/components/site/moods";

/** The public page.
 *
 * The order is an argument: one shelf and six commands to show what the thing
 * does, the whole command surface to show how much of it there is, looks and
 * moods to show the control you get over the result, a comparison to show the
 * source is never lost, the provider table to say where it all runs, and the
 * JSON for the readers who are machines.
 *
 * Everything is static except the three plates that change under the reader's
 * hand, so the page prerenders and the client bundle carries only the hero,
 * the moods and the comparison. */
export function MotifSite() {
  return (
    <div className={`site ${facultyGlyphic.variable} ${dmMono.variable}`}>
      <Masthead />
      <main>
        <Hero />
        <Commands />
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
