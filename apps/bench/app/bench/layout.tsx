import type { Metadata } from "next";
import type { ReactNode } from "react";

import { BenchShell } from "@/components/shell/bench-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "@/lib/query-provider";

export const metadata: Metadata = {
  description: "Motif image-model benchmark harness.",
  title: "Motif Bench",
};

/** The shell lives here, not in a page. `/bench` and `/bench/runs/[id]` share
 * this layout, so mounting the shell at this level is what lets a run be
 * selected without a layout swap — the rail keeps its scroll position and the
 * prompt keeps its text across the navigation
 * (`docs/design/specs/design-bench-shell.md`). The pages themselves render
 * nothing but a `RouteRun`, which is passed straight through as `children`. */
const BenchLayout = ({ children }: { children: ReactNode }) => (
  <QueryProvider>
    <TooltipProvider>
      <BenchShell>{children}</BenchShell>
    </TooltipProvider>
  </QueryProvider>
);

export default BenchLayout;
