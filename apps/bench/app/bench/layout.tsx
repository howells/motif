import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { BenchShell } from "@/components/shell/bench-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getViewer } from "@/lib/app/auth/viewer";
import { QueryProvider } from "@/lib/query-provider";

export const metadata: Metadata = {
  description: "Motif image-model benchmark harness.",
  robots: { follow: false, index: false },
  title: "Motif Bench",
};

/** The shell lives here, not in a page. `/bench` and `/bench/runs/[id]` share
 * this layout, so mounting the shell at this level is what lets a run be
 * selected without a layout swap — the rail keeps its scroll position and the
 * prompt keeps its text across the navigation
 * (`docs/design/specs/design-bench-shell.md`). The pages themselves render
 * nothing but a `RouteRun`, which is passed straight through as `children`.
 *
 * Past Bench runs are the owner's alone; anyone else gets a 404 rather than
 * learning the page exists. New runs start from Compare in the App. */
const BenchLayout = async ({ children }: { children: ReactNode }) => {
  const viewer = await getViewer();
  if (viewer.state !== "member" || viewer.member.role !== "owner") {
    notFound();
  }
  return (
    <QueryProvider>
      <TooltipProvider>
        <BenchShell>{children}</BenchShell>
      </TooltipProvider>
    </QueryProvider>
  );
};

export default BenchLayout;
