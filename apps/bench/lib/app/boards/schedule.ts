import type { AppSql } from "@motif/bench-db/app-sql";
import { getAppCredentials } from "@motif/bench-env/runtime";
import { after } from "next/server";

import type { Member } from "../auth/members";
import { liveWorkerDeps } from "../tasks/execute";
import { driveRun, liveRunDeps } from "./run";

/**
 * Drive a Board run after the response is sent, inside the route's own
 * lifetime (`after` uses the host's waitUntil). The run's state is already
 * in the database; a later poll that finds it stalled takes it over.
 */
export const scheduleBoardRun = (
  sql: AppSql,
  member: Member,
  runId: string
): void => {
  const { falKey } = getAppCredentials();
  if (falKey === null) {
    return;
  }
  const deps = liveRunDeps(liveWorkerDeps(falKey));
  after(async () => {
    try {
      await driveRun(sql, member, runId, deps);
    } catch (error) {
      console.error(
        `[board run] ${runId} stopped; the next poll takes it over`,
        error
      );
    }
  });
};
