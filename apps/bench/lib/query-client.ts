import { QueryClient } from "@tanstack/react-query";

export const createBenchQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      // Never replay mutations globally. Queries opt out only when their
      // route/SDK transport already owns a bounded retry policy.
      mutations: { retry: false },
    },
  });
