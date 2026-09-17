import type { Metadata } from "next";

import { MotifSite } from "@/components/site/motif-site";
import { SITE } from "@/lib/site/content";

export const metadata: Metadata = {
  description: SITE.description,
  title: SITE.name,
};

/** The public page. It reads only static content and the SDK's Task table, so
 * it prerenders. */
function HomePage() {
  return <MotifSite />;
}

export default HomePage;
