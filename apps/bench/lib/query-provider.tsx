"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

import { createBenchQueryClient } from "@/lib/query-client";

export const QueryProvider = ({ children }: { children: ReactNode }) => {
  // Stable per-component singleton created in the useState initializer
  // (never module scope, so each request/client gets its own); no setter
  // is needed.
  // oxlint-disable-next-line react/hook-use-state -- initializer-only singleton, intentionally no setter
  const [queryClient] = useState(createBenchQueryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
