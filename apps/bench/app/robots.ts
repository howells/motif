import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site/content";

/** The public page is `/`. The bench app and its API sit behind it and have
 * nothing a search engine should list. */
function robots(): MetadataRoute.Robots {
  return {
    rules: { allow: "/", disallow: ["/bench", "/api"], userAgent: "*" },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}

export default robots;
