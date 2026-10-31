import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import { SITE } from "@/lib/site/content";

import "@blossom-carousel/react/style.css";
import "./globals.css";

/** Inter as a *variable* font, deliberately: the house theme sets body text
 * at weight 450 (`docs/design/specs/design-bench.md`), which only exists if
 * the weight axis is available to interpolate. Pinning `weight: [400, 500]`
 * here would silently snap the whole app to 400 or 500 and lose the
 * Patternmode character. */
const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
});

/** Every relative URL in the metadata below this segment, the share card's
 * included, resolves against the canonical address. */
export const metadata: Metadata = {
  appleWebApp: { capable: true, statusBarStyle: "default", title: SITE.name },
  applicationName: SITE.name,
  metadataBase: new URL(SITE.url),
  title: SITE.name,
};

/** `cover` lets the shell reach the screen's edges on a notched phone; the
 * safe-area insets in app.css keep content clear of them. */
export const viewport: Viewport = {
  themeColor: "#faf9f7",
  viewportFit: "cover",
  width: "device-width",
};

/** The document and the theme, nothing else. The bench's shell and its
 * providers mount in `app/bench/layout.tsx`, so `/` renders as an ordinary
 * scrolling page. */
const RootLayout = ({ children }: { children: ReactNode }) => (
  <html className={inter.variable} lang="en">
    <body>{children}</body>
  </html>
);

export default RootLayout;
