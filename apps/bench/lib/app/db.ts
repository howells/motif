import { createAppSql } from "@motif/bench-db/app-sql";
import type { AppSql } from "@motif/bench-db/app-sql";
import { getAppCredentials } from "@motif/bench-env/runtime";

/** The App database, or `null` when this server has no database credential.
 * Callers turn `null` into an explicit "not set up" state; there is no local
 * or in-memory substitute. */
export const getAppSql = (): AppSql | null => {
  const { databaseUrl } = getAppCredentials();
  return databaseUrl === null ? null : createAppSql(databaseUrl);
};

/** Which parts of the App this server can run, by credential presence only.
 * Safe to send to the browser: it carries no values. */
export interface Capabilities {
  readonly database: boolean;
  readonly provider: boolean;
  readonly signIn: boolean;
  readonly storage: boolean;
}

export const getCapabilities = (): Capabilities => {
  const credentials = getAppCredentials();
  return {
    database: credentials.databaseUrl !== null,
    provider: credentials.falKey !== null,
    signIn: credentials.workos !== null,
    storage: credentials.blobToken !== null,
  };
};
