import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import { BenchShell } from "@/components/shell/bench-shell";
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

/** The shell lives here, not in a page. `/` and `/runs/[id]` share this root
 * layout, so mounting the shell at this level is what lets a run be selected
 * without a layout swap — the rail keeps its scroll position and the prompt
 * keeps its text across the navigation
 * (`docs/design/specs/design-bench-shell.md`). The pages themselves render
 * nothing but a `RouteRun`, which is passed straight through as `children`. */
const RootLayout = ({ children }: { children: ReactNode }) => (
  <html className={inter.variable} lang="en">
    <body>
      <QueryProvider>
        <TooltipProvider>
          <BenchShell>{children}</BenchShell>
        </TooltipProvider>
      </QueryProvider>
    </body>
  </html>
);

export default RootLayout;
