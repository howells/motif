import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { QueryProvider } from "@/lib/query-provider";

import "./globals.css";

export const metadata: Metadata = {
  description: "Motif image-model benchmark harness.",
  title: "Motif Bench",
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body>
      <QueryProvider>
        <div className="bench-shell">
          <header className="bench-header">
            <h1>
              <Link
                href="/"
                style={{ color: "inherit", textDecoration: "none" }}
              >
                Motif Bench
              </Link>
            </h1>
            <span className="subtitle">Image-model benchmark harness</span>
          </header>
          {children}
        </div>
      </QueryProvider>
    </body>
  </html>
);

export default RootLayout;
