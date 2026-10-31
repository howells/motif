"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/app/client/api";
import { GenerationReply } from "@/lib/app/client/schemas";
import type { GenerationView } from "@/lib/app/views";

const IN_FLIGHT = new Set(["reserved", "submitting", "submitted"]);

export const isInFlight = (generation: GenerationView | undefined): boolean =>
  generation !== undefined && IN_FLIGHT.has(generation.status);

/** One Generation, polled every two seconds while it is still running. Each
 * poll also lets the server pick up a run whose worker stopped. */
export const useGeneration = (id: string | null) =>
  useQuery({
    enabled: id !== null,
    queryFn: async () => {
      const body = await api(
        `/api/app/generations/${id ?? ""}`,
        GenerationReply
      );
      return body.generation;
    },
    queryKey: ["generation", id],
    refetchInterval: (query) => (isInFlight(query.state.data) ? 2000 : false),
  });
