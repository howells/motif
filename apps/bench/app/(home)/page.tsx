import type { Metadata } from "next";

import { Close } from "@/components/home/close";
import { Hero } from "@/components/home/hero";
import { LooksAndMoods } from "@/components/home/looks-and-moods";
import { Make } from "@/components/home/make";
import { Masthead } from "@/components/home/masthead";
import { Price } from "@/components/home/price";
import { getViewer } from "@/lib/app/auth/viewer";
import { SITE } from "@/lib/site/content";

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

/** Home. A member sees the same page as anyone else; only the last link in
 * the masthead changes, from Sign in to Open the App. The chapters sit
 * between the hero and the close, in the order `HOME.chapters` gives. */
async function HomePage() {
  const viewer = await getViewer();
  return (
    <>
      <Masthead member={viewer.state === "member"} />
      <main>
        <Hero />
        <Make />
        <LooksAndMoods />
        <Price />
      </main>
      <Close />
    </>
  );
}

export default HomePage;
