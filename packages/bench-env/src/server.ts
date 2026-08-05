import { EnvValidationError } from "@howells/envy";

import { loadWorkspaceDotenv } from "./dotenv";
import { parseServerEnv } from "./schema";
import type { ServerEnv } from "./schema";

const isPresent = (value: unknown): boolean => {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return value !== undefined && value !== null;
};

loadWorkspaceDotenv();

const validateServerEnv = (): ServerEnv => {
  try {
    // oxlint-disable-next-line no-restricted-properties -- this module IS the eager-parse env boundary
    return parseServerEnv(process.env);
  } catch (error) {
    console.error("❌ Invalid server environment variables:");
    if (error instanceof EnvValidationError) {
      console.error(error.issues);
      throw new Error(
        `Invalid server environment variables: ${error.message}`,
        { cause: error }
      );
    }
    console.error(error);
    throw new Error("Invalid server environment variables.", { cause: error });
  }
};

export const serverEnv = validateServerEnv();
export type { ServerEnv } from "./schema";

/**
 * Returns a validated, non-nullable server environment variable.
 * @throws {Error} When the requested variable is missing or empty.
 */
export const requireServerEnv = <Key extends keyof ServerEnv>(
  key: Key
): NonNullable<ServerEnv[Key]> => {
  const value = serverEnv[key];
  if (!isPresent(value)) {
    throw new Error(`Missing required environment variable: ${key}.`);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- runtime presence check above narrows; env-boundary pattern
  return value as NonNullable<ServerEnv[Key]>;
};
