import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

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

export const metadata: Metadata = {
  title: "Motif",
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
