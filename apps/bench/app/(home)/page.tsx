import type { Metadata } from "next";
import type { ComponentType } from "react";

import { Close } from "@/components/home/close";
import { Edit } from "@/components/home/edit";
import { Hero } from "@/components/home/hero";
import { LooksAndMoods } from "@/components/home/looks-and-moods";
import { Make } from "@/components/home/make";
import { Masthead } from "@/components/home/masthead";
import { Price } from "@/components/home/price";
import { ReadAndConvert } from "@/components/home/read-and-convert";
import { SITE } from "@/lib/site/content";
import { CHAPTERS } from "@/lib/site/home/chapters";

/** The Open Graph and X tags are set in the root layout, beside the share
 * card. Setting `openGraph` here would replace them whole and drop the card. */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  description: SITE.description,
  title: { absolute: SITE.title },
};

/** Each chapter's layout, by the chapter's id. */
const LAYOUTS = new Map<string, ComponentType>([
  ["edit", Edit],
  ["looks-and-moods", LooksAndMoods],
  ["make", Make],
  ["price", Price],
  ["read-and-convert", ReadAndConvert],
]);

function layout(id: string): ComponentType {
  const found = LAYOUTS.get(id);
  if (found === undefined) {
    throw new Error(`The homepage has no layout for the chapter "${id}"`);
  }
  return found;
}

/** Home. The same page for everyone, so it is built once, at build time.
 * The chapters sit between the hero and the close, in the order `CHAPTERS`
 * gives. */
function HomePage() {
  return (
    <>
      <Masthead />
      <main>
        <Hero />
        {CHAPTERS.map((chapter) => {
          const Layout = layout(chapter.id);
          return <Layout key={chapter.id} />;
        })}
      </main>
      <Close />
    </>
  );
}

export default HomePage;
