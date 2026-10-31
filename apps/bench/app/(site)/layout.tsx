import type { ReactNode } from "react";

import { Shell } from "@/components/app/shell";
import { getViewer } from "@/lib/app/auth/viewer";
import { QueryProvider } from "@/lib/query-provider";

/** Every page but the retired Bench sits in the one shell. Who is looking is
 * decided here, on the server, for each request. */
async function SiteLayout({ children }: { readonly children: ReactNode }) {
  const viewer = await getViewer();
  return (
    <QueryProvider>
      <Shell viewer={viewer}>{children}</Shell>
    </QueryProvider>
  );
}

export default SiteLayout;
