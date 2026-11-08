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
import { getViewer } from "@/lib/app/auth/viewer";
import { SITE } from "@/lib/site/content";
import { CHAPTERS } from "@/lib/site/home/chapters";

/** The share card itself comes from `opengraph-image.tsx` beside the root
 * layout, which Next adds to both the Open Graph and the X tags. */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  description: SITE.description,
  openGraph: {
    description: SITE.description,
    locale: "en_GB",
    siteName: SITE.name,
    title: SITE.title,
    type: "website",
    url: "/",
  },
  title: { absolute: SITE.title },
  twitter: {
    card: "summary_large_image",
    description: SITE.description,
    title: SITE.title,
  },
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

/** Home. A member sees the same page as anyone else; only the last link in
 * the masthead changes, from Sign in to Open the App. The chapters sit
 * between the hero and the close, in the order `CHAPTERS` gives. */
async function HomePage() {
  const viewer = await getViewer();
  return (
    <>
      <Masthead member={viewer.state === "member"} />
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
