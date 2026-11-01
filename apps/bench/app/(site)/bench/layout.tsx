import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { BenchShell } from "@/components/shell/bench-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getViewer } from "@/lib/app/auth/viewer";

export const metadata: Metadata = {
  description: "Motif image-model benchmark harness.",
  robots: { follow: false, index: false },
  title: "Bench",
};

/** The Bench lives inside the site's shell, so the rail, the account and the
 * bottom bar are the App's own, and the query client comes from the site
 * layout above. What this layout adds is the Bench itself, mounted here and
 * not in a page: `/bench` and `/bench/runs/[id]` share it, so selecting a run
 * is a change of selection inside one shell and never a remount. The rail of
 * runs keeps its scroll position and the prompt keeps its text. The pages
 * render nothing but a `RouteRun`, passed straight through as `children`.
 *
 * Past Bench runs are the owner's alone; anyone else gets a 404 rather than
 * learning the page exists. */
const BenchLayout = async ({ children }: { children: ReactNode }) => {
  const viewer = await getViewer();
  if (viewer.state !== "member" || viewer.member.role !== "owner") {
    notFound();
  }
  return (
    <TooltipProvider>
      <BenchShell>{children}</BenchShell>
    </TooltipProvider>
  );
};

export default BenchLayout;
