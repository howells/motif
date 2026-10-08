import type { Metadata } from "next";

import { MotifSite } from "@/components/site/motif-site";
import { SITE } from "@/lib/site/content";

/** The share card itself comes from `opengraph-image.tsx` beside this file,
 * which Next adds to both the Open Graph and the X tags. */
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

/** The public page. It reads only static content and the SDK's Task table, so
 * it prerenders. */
function HomePage() {
  return <MotifSite />;
}

export default HomePage;
