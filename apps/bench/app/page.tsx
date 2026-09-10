import type { Metadata } from "next";

import { MotifSite } from "@/components/site/motif-site";
import { SITE } from "@/lib/site/content";

export const metadata: Metadata = {
  description: SITE.summary,
  title: SITE.name,
};

/** The public page. It reads only static content, so it prerenders. */
function HomePage() {
  return <MotifSite />;
}

export default HomePage;
