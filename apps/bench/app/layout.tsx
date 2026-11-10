import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import { SITE } from "@/lib/site/content";

import "./globals.css";

/** Inter as a *variable* font, deliberately: pinning `weight: [400, 500]`
 * would snap every weight to one of the two files. */
const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
});

/** Every relative URL in the metadata below this segment, the share card's
 * included, resolves against the canonical address. */
export const metadata: Metadata = {
  applicationName: SITE.name,
  metadataBase: new URL(SITE.url),
  openGraph: {
    description: SITE.description,
    locale: "en_GB",
    siteName: SITE.name,
    title: SITE.title,
    type: "website",
  },
  title: SITE.name,
  twitter: {
    card: "summary_large_image",
    description: SITE.description,
    title: SITE.title,
  },
};

export const viewport: Viewport = {
  themeColor: "#faf9f7",
  width: "device-width",
};

/** The document and the theme, nothing else. */
const RootLayout = ({ children }: { children: ReactNode }) => (
  <html className={inter.variable} lang="en">
    <body>{children}</body>
  </html>
);

export default RootLayout;
