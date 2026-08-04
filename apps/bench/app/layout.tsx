import type { Metadata } from "next";
import type { ReactNode } from "react";

import { QueryProvider } from "@/lib/query-provider";

export const metadata: Metadata = {
  description: "Motif image-model benchmark harness.",
  title: "Motif Bench",
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body>
      <QueryProvider>{children}</QueryProvider>
    </body>
  </html>
);

export default RootLayout;
