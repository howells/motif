/**
 * Per-call environment accessors — the "importing parses nothing" shape
 * (materialdesk `packages/env/src/runtime.ts`). Each function parses at call
 * time and never at module evaluation, so this entrypoint is safe to import
 * from anywhere, including modules reachable from a zero-env `next build`.
 *
 * The environment carries ONLY credentials (user decision, 2026-08-05).
 * There is no mode flag: mock vs live is *derived* from which credentials
 * are present. No keys → mock (free, offline, what tests and a fresh clone
 * get). All keys → live. That keeps `.env` down to secrets and makes the
 * mode impossible to misconfigure independently of the credentials it needs.
 */
import { loadWorkspaceDotenv } from "./dotenv";
import { parseServerEnv } from "./schema";

export interface LiveCredentials {
  readonly databaseUrl: string;
  readonly falKey: string;
}

/**
 * The live credentials, or `null` when any are missing — never throws.
 * `null` means "run mock": the caller (the app's composition root) treats
 * absence of credentials as absence of live capability, not as an error.
 */
export const getLiveCredentials = (
  input?: NodeJS.ProcessEnv
): LiveCredentials | null => {
  // An explicit input is taken verbatim (tests hand in a constructed env);
  // only the real-process path loads the workspace .env first.
  let source = input;
  if (source === undefined) {
    loadWorkspaceDotenv();
    source = process.env;
  }
  try {
    const env = parseServerEnv(source);
    return { databaseUrl: env.DATABASE_URL, falKey: env.FAL_KEY };
  } catch {
    return null;
  }
};
