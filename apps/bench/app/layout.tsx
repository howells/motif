import { BENCH_ROUTES } from "@motif/bench-core";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "@/lib/query-provider";

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
  description: "Motif image-model benchmark harness.",
  title: "Motif Bench",
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html className={inter.variable} lang="en">
    <body>
      <QueryProvider>
        <TooltipProvider>
          <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-9 px-4 pt-10 pb-24 sm:px-6 sm:pt-14">
            <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border pb-4">
              <h1>
                <Link className="no-underline" href="/">
                  Motif Bench
                </Link>
              </h1>
              <p className="text-muted">
                <span className="bench-numeric">{BENCH_ROUTES.length}</span>{" "}
                models · fal
              </p>
            </header>
            {children}
          </div>
        </TooltipProvider>
      </QueryProvider>
    </body>
  </html>
);

export default RootLayout;
