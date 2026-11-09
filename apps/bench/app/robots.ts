import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site/content";

function robots(): MetadataRoute.Robots {
  return {
    rules: { allow: "/", userAgent: "*" },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}

export default robots;
