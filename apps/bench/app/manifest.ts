import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site/content";

/** Installable as an app: it opens on the Library, full screen, on paper. */
function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#faf9f7",
    description: SITE.description,
    display: "standalone",
    icons: [
      {
        purpose: "any",
        sizes: "192x192",
        src: "/pwa-icon/192",
        type: "image/png",
      },
      {
        purpose: "any",
        sizes: "512x512",
        src: "/pwa-icon/512",
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "512x512",
        src: "/pwa-icon/512-maskable",
        type: "image/png",
      },
    ],
    id: "/",
    name: SITE.name,
    scope: "/",
    short_name: SITE.name,
    start_url: "/make",
    theme_color: "#faf9f7",
  };
}

export default manifest;
