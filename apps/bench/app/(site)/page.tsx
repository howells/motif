import type { Metadata } from "next";

import { Hero } from "@/components/site/hero";
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

/** Home: the shelf and the six commands run against it. */
function HomePage() {
  return (
    <main>
      <Hero />
    </main>
  );
}

export default HomePage;
