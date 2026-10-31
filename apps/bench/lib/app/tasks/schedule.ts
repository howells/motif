import type { AppSql } from "@motif/bench-db/app-sql";
import { getAppCredentials } from "@motif/bench-env/runtime";
import { after } from "next/server";

import { advanceGeneration, liveWorkerDeps } from "./execute";

/**
 * Run the worker for these Generations after the response is sent, inside
 * the route's own lifetime (`after` uses the host's waitUntil). This is not
 * where state lives: each Generation's row is already written, and any later
 * poll that finds one stalled takes it over.
 */
export const scheduleGenerations = (
  sql: AppSql,
  ownerId: string,
  ids: readonly string[]
): void => {
  const { falKey } = getAppCredentials();
  if (falKey === null) {
    return;
  }
  const deps = liveWorkerDeps(falKey);
  after(async () => {
    await Promise.all(
      ids.map(async (id) => {
        try {
          await advanceGeneration(sql, ownerId, id, deps);
        } catch (error) {
          console.error(
            `[app worker] ${id} stopped; the next poll takes it over`,
            error
          );
        }
      })
    );
  });
};
