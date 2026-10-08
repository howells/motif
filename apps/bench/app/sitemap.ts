import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site/content";

/** One public page. */
function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE.url }];
}

export default sitemap;
