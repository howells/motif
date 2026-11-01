"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { api } from "@/lib/app/client/api";
import { BudgetReply } from "@/lib/app/client/schemas";
import type { SpendData } from "@/lib/app/client/schemas";

/** This month's spending as the signed-in person may see it. Shared by the
 * rail's meter and Settings, so one invalidation moves both. */
export const SPEND_KEY = ["budget"] as const;

export const fetchSpend = async (): Promise<SpendData> => {
  const body = await api("/api/app/budget", BudgetReply);
  return body.budget;
};

/** Queries whose answer changes when a run settles: what was spent, and
 * what the Library holds. */
export const SETTLED_KEYS: readonly (readonly string[])[] = [
  SPEND_KEY,
  ["library"],
];

/** Whether something that was running has just stopped. */
export const justSettled = (was: boolean, now: boolean): boolean => was && !now;

/**
 * Bring everything a finished run changes up to date: the spend and the
 * Library refetch, and `refresh` redraws the server-drawn rail (its Inbox
 * count) without reloading the page.
 */
export const afterSettle = async (
  queryClient: QueryClient,
  refresh: () => void
): Promise<void> => {
  await Promise.all(
    SETTLED_KEYS.map(async (queryKey) => {
      await queryClient.invalidateQueries({ queryKey });
    })
  );
  refresh();
};

/** Call `afterSettle` the moment `active` goes from true to false. */
export const useAfterSettle = (active: boolean): void => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const previous = useRef(active);
  useEffect(() => {
    const was = previous.current;
    previous.current = active;
    if (justSettled(was, active)) {
      void afterSettle(queryClient, () => {
        router.refresh();
      });
    }
  }, [active, queryClient, router]);
};
